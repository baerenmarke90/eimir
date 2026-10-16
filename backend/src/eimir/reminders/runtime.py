"""Deterministic M4-C Rule reconciliation and Reminder occurrence delivery."""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core import clock
from eimir.core.errors import ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.outbox import service as outbox_service
from eimir.people.models import DateRepeat, ImportantDate, RelatedPerson
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship.models import Membership, MembershipStatus, SpaceProfile
from eimir.reminders.models import (
    Reminder,
    ReminderOffset,
    ReminderPayload,
    ReminderPreference,
    ReminderScheduleType,
    ReminderSource,
    shared_privacy,
)
from eimir.reminders.rules import (
    CATALOG,
    IMPORTANT_DATE_RULE,
    PARTNER_BIRTHDAY_RULE,
    PLAN_START_RULE,
    RELATED_PERSON_BIRTHDAY_RULE,
    RELATIONSHIP_ANNIVERSARY_RULE,
    RuleDefinition,
    RuleParameters,
    default_parameters,
    validate_parameters,
)
from eimir.reminders.runtime_models import (
    OccurrenceState,
    ReminderOccurrence,
    RulePreference,
)

log = logging.getLogger(__name__)

OCCURRENCE_JOB = "reminder-occurrence"
RECONCILE_JOB = "reminder-reconcile"
RECONCILE_INTERVAL = timedelta(minutes=15)
CATCH_UP_WINDOW = timedelta(hours=24)
_LOCK_KEY = 8_150_214


class RuntimeErrorCode:
    TIMEZONE_INVALID = "ACCOUNT_TIMEZONE_INVALID"


def _lock(session: Session) -> None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))


def _open_reconcile_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.kind == RECONCILE_JOB,
                Job.status.in_([status.value for status in statuses]),
            )
        ).scalar_one()
    )


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    """Ensure one bounded reconciliation chain exists after startup/restore."""
    _lock(session)
    if _open_reconcile_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    return queue.enqueue(session, RECONCILE_JOB, delay=delay)


def schedule_next_reconcile(session: Session) -> Job | None:
    _lock(session)
    if _open_reconcile_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(session, RECONCILE_JOB, delay=RECONCILE_INTERVAL)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(OCCURRENCE_JOB) is None:
        destination.register(OCCURRENCE_JOB, handle_occurrence)
    if destination.get(RECONCILE_JOB) is None:
        destination.register(RECONCILE_JOB, handle_reconcile)


def handle_reconcile(session: Session, payload: dict[str, Any]) -> None:
    del payload
    reconcile_all(session)
    schedule_next_reconcile(session)


def reconcile_all(session: Session) -> None:
    """Idempotently recover generated definitions and next pending occurrences."""
    space_ids = list(
        session.execute(
            select(Membership.space_id)
            .where(Membership.status == MembershipStatus.ACTIVE.value)
            .distinct()
            .order_by(Membership.space_id)
        ).scalars()
    )
    for space_id in space_ids:
        reconcile_space(session, space_id)


def reconcile_space(session: Session, space_id: UUID) -> None:
    _reconcile_generated_reminders(session, space_id)
    reminders = list(
        session.execute(
            select(Reminder)
            .where(Reminder.space_id == space_id)
            .order_by(Reminder.source, Reminder.id)
        ).scalars()
    )
    recipients = list(
        session.execute(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
        ).scalars()
    )
    for reminder in reminders:
        for account in recipients:
            _plan_for_recipient(session, reminder, account)


def reconcile_reminder(session: Session, reminder_id: UUID) -> None:
    reminder = _lock_reminder(session, reminder_id)
    if reminder is None:
        return
    recipients = list(
        session.execute(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(
                Membership.space_id == reminder.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
        ).scalars()
    )
    for account in recipients:
        _plan_for_recipient(session, reminder, account)


def reconcile_account(
    session: Session,
    account: Account,
    *,
    timezone_name: str | None = None,
) -> None:
    """Replan current Reminder occurrences for one Account after timezone changes."""
    space_ids = list(
        session.execute(
            select(Membership.space_id)
            .where(
                Membership.account_id == account.id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.space_id)
        ).scalars()
    )
    for space_id in space_ids:
        reminders = session.execute(
            select(Reminder)
            .where(Reminder.space_id == space_id)
            .order_by(Reminder.source, Reminder.id)
        ).scalars()
        for reminder in reminders:
            _plan_for_recipient(session, reminder, account, timezone_name=timezone_name)
    session.flush()


def _active_owner(session: Session, space_id: UUID) -> UUID | None:
    return session.execute(
        select(Membership.account_id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .order_by(Membership.created_at, Membership.account_id)
        .limit(1)
    ).scalar_one_or_none()


def _reconcile_generated_reminders(session: Session, space_id: UUID) -> None:
    # Existing generated definitions are the stable parent rows for source-derived
    # planning. Lock them before reading source state so a waiter always observes
    # the source commit that released the lock instead of writing an older schedule
    # afterwards. The ID ordering matches every other multi-Reminder planner.
    existing = list(
        session.execute(
            select(Reminder)
            .where(
                Reminder.space_id == space_id,
                Reminder.source == ReminderSource.GENERATED.value,
            )
            .order_by(Reminder.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalars()
    )
    desired: dict[tuple[str, UUID, str], dict[str, Any]] = {}

    important_dates = session.execute(
        select(ImportantDate).where(
            ImportantDate.space_id == space_id,
            ImportantDate.privacy_class == PrivacyClass.SPACE_SHARED.value,
            ImportantDate.repeats == DateRepeat.ANNUALLY.value,
        )
    ).scalars()
    for important_date in important_dates:
        desired[("IMPORTANT_DATE", important_date.id, IMPORTANT_DATE_RULE)] = {
            "owner_id": important_date.owner_id,
            "schedule_type": ReminderScheduleType.ANNUAL,
            "annual_month": important_date.date.month,
            "annual_day": important_date.date.day,
            "local_time": time(9, 0),
        }

    people = session.execute(
        select(RelatedPerson).where(
            RelatedPerson.space_id == space_id,
            RelatedPerson.privacy_class == PrivacyClass.SPACE_SHARED.value,
            RelatedPerson.birthday.is_not(None),
        )
    ).scalars()
    for person in people:
        if person.birthday is None:
            continue
        desired[("RELATED_PERSON", person.id, RELATED_PERSON_BIRTHDAY_RULE)] = {
            "owner_id": person.owner_id,
            "schedule_type": ReminderScheduleType.ANNUAL,
            "annual_month": person.birthday.month,
            "annual_day": person.birthday.day,
            "local_time": time(9, 0),
        }

    birthday_accounts = session.execute(
        select(Account)
        .join(Membership, Membership.account_id == Account.id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Account.disabled_at.is_(None),
            Account.birthday.is_not(None),
        )
        .order_by(Account.id)
    ).scalars()
    for birthday_account in birthday_accounts:
        if birthday_account.birthday is None:
            continue
        desired[("ACCOUNT", birthday_account.id, PARTNER_BIRTHDAY_RULE)] = {
            "owner_id": birthday_account.id,
            "schedule_type": ReminderScheduleType.ANNUAL,
            "annual_month": birthday_account.birthday.month,
            "annual_day": birthday_account.birthday.day,
            "local_time": time(9, 0),
        }

    profile = session.execute(
        select(SpaceProfile).where(
            SpaceProfile.space_id == space_id,
            SpaceProfile.relationship_started_on.is_not(None),
        )
    ).scalar_one_or_none()
    owner_id = _active_owner(session, space_id)
    if profile is not None and profile.relationship_started_on is not None and owner_id is not None:
        desired[("RELATIONSHIP", profile.id, RELATIONSHIP_ANNIVERSARY_RULE)] = {
            "owner_id": owner_id,
            "schedule_type": ReminderScheduleType.ANNUAL,
            "annual_month": profile.relationship_started_on.month,
            "annual_day": profile.relationship_started_on.day,
            "local_time": time(9, 0),
        }

    plans = session.execute(
        select(Plan).where(
            Plan.space_id == space_id,
            Plan.status == PlanStatus.PLANNED.value,
            Plan.planned_start.is_not(None),
        )
    ).scalars()
    for plan in plans:
        if plan.planned_start is None:
            continue
        desired[("PLAN", plan.id, PLAN_START_RULE)] = {
            "owner_id": plan.owner_id,
            "schedule_type": ReminderScheduleType.ONCE,
            "once_at": clock.ensure_utc(plan.planned_start),
        }

    existing_by_identity = {
        (row.source_type or "", row.source_id, row.rule_key or ""): row for row in existing
    }

    for identity, values in desired.items():
        source_type, source_id, rule_key = identity
        reminder = existing_by_identity.pop(identity, None)
        rule = CATALOG[rule_key]
        if reminder is None:
            reminder = Reminder(
                space_id=space_id,
                owner_id=values["owner_id"],
                privacy_class=shared_privacy(),
                source=ReminderSource.GENERATED.value,
                source_type=source_type,
                source_id=source_id,
                rule_key=rule_key,
                schedule_type=values["schedule_type"].value,
                payload=ReminderPayload(title=rule_key),
            )
            session.add(reminder)
        _apply_generated_schedule(reminder, values)
        _replace_generated_offsets(session, reminder, rule)

    for obsolete in existing_by_identity.values():
        session.delete(obsolete)
    session.flush()


def _apply_generated_schedule(reminder: Reminder, values: dict[str, Any]) -> None:
    schedule_type: ReminderScheduleType = values["schedule_type"]
    reminder.schedule_type = schedule_type.value
    reminder.once_at = values.get("once_at")
    reminder.annual_month = values.get("annual_month")
    reminder.annual_day = values.get("annual_day")
    reminder.local_time = values.get("local_time")
    reminder.relationship_day_count = None


def _replace_generated_offsets(session: Session, reminder: Reminder, rule: RuleDefinition) -> None:
    if reminder.id is None:
        session.flush()
    current = list(
        session.execute(
            select(ReminderOffset).where(ReminderOffset.reminder_id == reminder.id)
        ).scalars()
    )
    existing = {row.days_before: row for row in current}
    wanted = set(rule.default_days_before)
    for value in wanted - set(existing):
        session.add(ReminderOffset(reminder_id=reminder.id, days_before=value))
    for value, row in existing.items():
        if value not in wanted:
            session.delete(row)


def effective_rule_preference(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
    rule: RuleDefinition,
) -> tuple[bool, RuleParameters]:
    row = session.execute(
        select(RulePreference).where(
            RulePreference.account_id == account_id,
            RulePreference.space_id == space_id,
            RulePreference.rule_key == rule.key,
        )
    ).scalar_one_or_none()
    if row is None:
        return rule.enabled_by_default, default_parameters(rule)
    return row.enabled, validate_parameters(rule, row.parameters)


def set_rule_preference(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
    rule: RuleDefinition,
    enabled: bool,
    parameters: dict[str, Any],
) -> RulePreference:
    normalized = validate_parameters(rule, parameters)
    statement = (
        postgresql.insert(RulePreference)
        .values(
            account_id=account_id,
            space_id=space_id,
            rule_key=rule.key,
            enabled=enabled,
            parameters=normalized.as_json(),
        )
        .on_conflict_do_update(
            index_elements=["account_id", "space_id", "rule_key"],
            set_={
                "enabled": enabled,
                "parameters": normalized.as_json(),
                "updated_at": clock.now(),
            },
        )
        .returning(RulePreference.id)
    )
    preference_id = session.execute(statement).scalar_one()
    row = session.get(RulePreference, preference_id)
    if row is None:
        raise RuntimeError("Rule preference disappeared after upsert.")

    reminders = list(
        session.execute(
            select(Reminder)
            .where(
                Reminder.space_id == space_id,
                Reminder.rule_key == rule.key,
                Reminder.source == ReminderSource.GENERATED.value,
            )
            .order_by(Reminder.id)
        ).scalars()
    )
    account = session.get(Account, account_id)
    if account is not None:
        for reminder in reminders:
            _plan_for_recipient(session, reminder, account)
    return row


def _is_muted(session: Session, reminder_id: UUID, account_id: UUID) -> bool:
    value = session.execute(
        select(ReminderPreference.muted).where(
            ReminderPreference.reminder_id == reminder_id,
            ReminderPreference.account_id == account_id,
        )
    ).scalar_one_or_none()
    return bool(value) if value is not None else False


def _manual_parameters(session: Session, reminder: Reminder) -> RuleParameters:
    offsets = tuple(
        session.execute(
            select(ReminderOffset.days_before)
            .where(ReminderOffset.reminder_id == reminder.id)
            .order_by(ReminderOffset.days_before)
        ).scalars()
    )
    return RuleParameters(days_before=offsets, local_time=reminder.local_time)


def _lock_reminder(session: Session, reminder_id: UUID) -> Reminder | None:
    """Serialize one Reminder plan before any occurrence rows are read or written."""
    return session.execute(
        select(Reminder)
        .where(Reminder.id == reminder_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


def _current_account(session: Session, account_id: UUID) -> Account | None:
    """Reload account state after a planner may have waited on its Reminder lock."""
    return session.execute(
        select(Account).where(Account.id == account_id).execution_options(populate_existing=True)
    ).scalar_one_or_none()


def _plan_for_recipient(
    session: Session,
    reminder: Reminder,
    account: Account,
    *,
    timezone_name: str | None = None,
) -> None:
    # Reminder -> ReminderOccurrence is the planning lock order. Multi-Reminder
    # callers visit GENERATED before MANUAL and then IDs in ascending order.
    locked_reminder = _lock_reminder(session, reminder.id)
    if locked_reminder is None:
        return
    reminder = locked_reminder
    if timezone_name is None:
        current_account = _current_account(session, account.id)
        if current_account is None:
            return
        account = current_account

    if (
        reminder.source == ReminderSource.GENERATED.value
        and reminder.rule_key == PARTNER_BIRTHDAY_RULE
        and reminder.source_type == "ACCOUNT"
        and reminder.source_id == account.id
    ):
        _supersede_pending(session, reminder.id, account.id, set())
        return

    if _is_muted(session, reminder.id, account.id):
        _supersede_pending(session, reminder.id, account.id, set())
        return

    parameters = _manual_parameters(session, reminder)
    if reminder.source == ReminderSource.GENERATED.value:
        rule = CATALOG.get(reminder.rule_key or "")
        if rule is None:
            _supersede_pending(session, reminder.id, account.id, set())
            return
        enabled, parameters = effective_rule_preference(
            session,
            account_id=account.id,
            space_id=reminder.space_id,
            rule=rule,
        )
        if not enabled:
            _supersede_pending(session, reminder.id, account.id, set())
            return

    desired = _desired_occurrences(
        session, reminder, account, parameters, timezone_name=timezone_name
    )
    desired_keys = {(key, days) for key, days, _ in desired}
    _supersede_pending(session, reminder.id, account.id, desired_keys)
    for occurrence_key, days_before, due_at in desired:
        _upsert_occurrence(
            session,
            reminder=reminder,
            account=account,
            occurrence_key=occurrence_key,
            days_before=days_before,
            due_at=due_at,
        )


def _supersede_pending(
    session: Session,
    reminder_id: UUID,
    account_id: UUID,
    desired: set[tuple[str, int]],
) -> None:
    rows = session.execute(
        select(ReminderOccurrence)
        .where(
            ReminderOccurrence.reminder_id == reminder_id,
            ReminderOccurrence.recipient_account_id == account_id,
            ReminderOccurrence.state == OccurrenceState.PENDING.value,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalars()
    for row in rows:
        if (row.occurrence_key, row.days_before) not in desired:
            row.state = OccurrenceState.SUPERSEDED.value
            row.generation += 1


def _upsert_occurrence(
    session: Session,
    *,
    reminder: Reminder,
    account: Account,
    occurrence_key: str,
    days_before: int,
    due_at: datetime,
) -> None:
    row = session.execute(
        select(ReminderOccurrence)
        .where(
            ReminderOccurrence.reminder_id == reminder.id,
            ReminderOccurrence.recipient_account_id == account.id,
            ReminderOccurrence.occurrence_key == occurrence_key,
            ReminderOccurrence.days_before == days_before,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()

    enqueue = False
    if row is None:
        row = ReminderOccurrence(
            reminder_id=reminder.id,
            recipient_account_id=account.id,
            occurrence_key=occurrence_key,
            days_before=days_before,
            due_at=due_at,
            state=OccurrenceState.PENDING.value,
            generation=1,
        )
        session.add(row)
        session.flush()
        enqueue = True
    elif row.state == OccurrenceState.DELIVERED.value:
        return
    elif row.state != OccurrenceState.PENDING.value or row.due_at != due_at:
        row.due_at = due_at
        row.state = OccurrenceState.PENDING.value
        row.generation += 1
        enqueue = True

    if enqueue:
        delay = max(due_at - clock.now(), timedelta(0))
        queue.enqueue(
            session,
            OCCURRENCE_JOB,
            {"occurrenceId": str(row.id), "generation": row.generation},
            delay=delay if delay else None,
        )


def _desired_occurrences(
    session: Session,
    reminder: Reminder,
    account: Account,
    parameters: RuleParameters,
    *,
    timezone_name: str | None = None,
) -> list[tuple[str, int, datetime]]:
    now = clock.now()
    cutoff = now - CATCH_UP_WINDOW
    schedule_type = ReminderScheduleType(reminder.schedule_type)
    result: list[tuple[str, int, datetime]] = []

    if schedule_type is ReminderScheduleType.ONCE:
        if reminder.once_at is None:
            return result
        target = clock.ensure_utc(reminder.once_at)
        key = f"once:{target.isoformat()}"
        for days_before in parameters.days_before:
            due_at = target - timedelta(days=days_before)
            if due_at >= cutoff:
                result.append((key, days_before, due_at))
        return result

    timezone = _timezone(timezone_name or account.timezone)
    local_time = parameters.local_time or reminder.local_time
    if local_time is None:
        return result

    if schedule_type is ReminderScheduleType.RELATIONSHIP_DAY_COUNT:
        profile = _relationship_profile_for(session, reminder.space_id)
        if (
            profile is None
            or profile.relationship_started_on is None
            or reminder.relationship_day_count is None
        ):
            return result
        try:
            target_date = profile.relationship_started_on + timedelta(
                days=reminder.relationship_day_count - 1
            )
        except OverflowError:
            return result
        key = f"relationship:{target_date.isoformat()}"
        for days_before in parameters.days_before:
            delivery_date = target_date - timedelta(days=days_before)
            due_at = _resolve_local(delivery_date, local_time, timezone)
            if due_at >= cutoff:
                result.append((key, days_before, due_at))
        return result

    if reminder.annual_month is None or reminder.annual_day is None:
        return result
    local_today = now.astimezone(timezone).date()
    for year in (local_today.year, local_today.year + 1):
        target_date = _annual_date(year, reminder.annual_month, reminder.annual_day)
        candidate: list[tuple[str, int, datetime]] = []
        key = f"annual:{target_date.isoformat()}"
        for days_before in parameters.days_before:
            delivery_date = target_date - timedelta(days=days_before)
            due_at = _resolve_local(delivery_date, local_time, timezone)
            if due_at >= cutoff:
                candidate.append((key, days_before, due_at))
        if candidate:
            return candidate
    return result


def _timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as error:
        raise ValidationError(
            "Account timezone is invalid.", RuntimeErrorCode.TIMEZONE_INVALID
        ) from error


def _annual_date(year: int, month: int, day: int) -> date:
    return clock.annual_occurrence(year, month, day)


def _resolve_local(day: date, wall_time: time, zone: ZoneInfo) -> datetime:
    """Resolve local wall time with deterministic DST gap/overlap semantics."""
    return clock.resolve_local(day, wall_time, zone)


def source_is_eligible(session: Session, reminder: Reminder) -> bool:
    if reminder.source != ReminderSource.GENERATED.value:
        return True
    if reminder.source_id is None or reminder.rule_key is None or reminder.source_type is None:
        return False
    if reminder.rule_key == IMPORTANT_DATE_RULE:
        return (
            session.execute(
                select(ImportantDate.id).where(
                    ImportantDate.id == reminder.source_id,
                    ImportantDate.space_id == reminder.space_id,
                    ImportantDate.privacy_class == PrivacyClass.SPACE_SHARED.value,
                    ImportantDate.repeats == DateRepeat.ANNUALLY.value,
                )
            ).scalar_one_or_none()
            is not None
        )
    if reminder.rule_key == RELATED_PERSON_BIRTHDAY_RULE:
        return (
            session.execute(
                select(RelatedPerson.id).where(
                    RelatedPerson.id == reminder.source_id,
                    RelatedPerson.space_id == reminder.space_id,
                    RelatedPerson.privacy_class == PrivacyClass.SPACE_SHARED.value,
                    RelatedPerson.birthday.is_not(None),
                )
            ).scalar_one_or_none()
            is not None
        )
    if reminder.rule_key == PARTNER_BIRTHDAY_RULE:
        return (
            session.execute(
                select(Account.id)
                .join(Membership, Membership.account_id == Account.id)
                .where(
                    Account.id == reminder.source_id,
                    Account.disabled_at.is_(None),
                    Account.birthday.is_not(None),
                    Membership.space_id == reminder.space_id,
                    Membership.status == MembershipStatus.ACTIVE.value,
                )
            ).scalar_one_or_none()
            is not None
        )
    if reminder.rule_key == RELATIONSHIP_ANNIVERSARY_RULE:
        return (
            session.execute(
                select(SpaceProfile.id).where(
                    SpaceProfile.id == reminder.source_id,
                    SpaceProfile.space_id == reminder.space_id,
                    SpaceProfile.relationship_started_on.is_not(None),
                )
            ).scalar_one_or_none()
            is not None
        )
    if reminder.rule_key == PLAN_START_RULE:
        return (
            session.execute(
                select(Plan.id).where(
                    Plan.id == reminder.source_id,
                    Plan.space_id == reminder.space_id,
                    Plan.status == PlanStatus.PLANNED.value,
                    Plan.planned_start.is_not(None),
                )
            ).scalar_one_or_none()
            is not None
        )
    return False


def handle_occurrence(session: Session, payload: dict[str, Any]) -> None:
    raw_id = payload.get("occurrenceId")
    raw_generation = payload.get("generation")
    if not isinstance(raw_id, str) or not isinstance(raw_generation, int):
        return
    try:
        occurrence_id = UUID(raw_id)
    except ValueError:
        return

    occurrence = session.execute(
        select(ReminderOccurrence).where(ReminderOccurrence.id == occurrence_id).with_for_update()
    ).scalar_one_or_none()
    if (
        occurrence is None
        or occurrence.state != OccurrenceState.PENDING.value
        or occurrence.generation != raw_generation
    ):
        return

    now = clock.now()
    if occurrence.due_at > now:
        return
    if now - occurrence.due_at > CATCH_UP_WINDOW:
        occurrence.state = OccurrenceState.EXPIRED.value
        return

    reminder = session.get(Reminder, occurrence.reminder_id)
    account = session.get(Account, occurrence.recipient_account_id)
    if reminder is None or account is None or account.disabled_at is not None:
        occurrence.state = OccurrenceState.CANCELLED.value
        return
    membership = session.execute(
        select(Membership.id).where(
            Membership.space_id == reminder.space_id,
            Membership.account_id == account.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one_or_none()
    if membership is None or _is_muted(session, reminder.id, account.id):
        occurrence.state = OccurrenceState.CANCELLED.value
        return
    if not source_is_eligible(session, reminder):
        occurrence.state = OccurrenceState.CANCELLED.value
        return
    if reminder.source == ReminderSource.GENERATED.value:
        rule = CATALOG.get(reminder.rule_key or "")
        if rule is None:
            occurrence.state = OccurrenceState.CANCELLED.value
            return
        enabled, _ = effective_rule_preference(
            session,
            account_id=account.id,
            space_id=reminder.space_id,
            rule=rule,
        )
        if not enabled:
            occurrence.state = OccurrenceState.CANCELLED.value
            return

    outbox_service.record(
        session,
        DomainEvent(
            type=EventType.REMINDER_DUE,
            space_id=reminder.space_id,
            actor_id=None,
            subject_type="REMINDER",
            subject_id=reminder.id,
            resource_version=reminder.version,
            payload=PublicEventPayload(
                recipient_id=account.id,
                occurrence_id=occurrence.id,
                due_at=occurrence.due_at,
                rule_key=reminder.rule_key,
            ),
        ),
    )
    occurrence.state = OccurrenceState.DELIVERED.value
    occurrence.delivered_at = now


def _relationship_profile_for(session: Session, space_id: UUID) -> SpaceProfile | None:
    return session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == space_id)
    ).scalar_one_or_none()
