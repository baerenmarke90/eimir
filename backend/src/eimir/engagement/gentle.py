"""Recipient-owned gentle invitations on the canonical attention pipeline."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import cast
from uuid import UUID

from sqlalchemy import Select, delete, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.authorization import (
    AuthorizationContext,
    PrivacyClass,
    readable,
    require_readable_shared,
)
from eimir.core import clock
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement import gentle_policy as policy
from eimir.engagement import quiet_hours_preferences
from eimir.engagement.models import (
    GentleMemoryExclusion,
    GentleOccasion,
    GentleProfile,
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
)
from eimir.identity import effects
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.outbox import service as outbox
from eimir.outbox.models import OutboxEvent
from eimir.relationship.models import Membership, MembershipStatus
from eimir.reminders.models import Reminder, ReminderSource
from eimir.reminders.runtime_models import OccurrenceState, ReminderOccurrence
from eimir.story.view_models import StoryItemViewAggregate

KIND = NotificationKind.GENTLE_PROMPT.value
PENDING_PUSH = (PushDeliveryStatus.PENDING.value, PushDeliveryStatus.RETRYING.value)


def _account_barrier(session: Session, account_id: UUID) -> Account | None:
    return session.scalar(
        select(Account)
        .where(Account.id == account_id, Account.disabled_at.is_(None))
        .with_for_update(read=True, key_share=True)
        .execution_options(populate_existing=True)
    )


def enabled(session: Session, account_id: UUID) -> bool:
    return (
        session.scalar(select(Account.gentle_prompts_enabled).where(Account.id == account_id))
        is True
    )


def _profile(session: Session, account_id: UUID) -> GentleProfile:
    session.execute(
        insert(GentleProfile)
        .values(
            account_id=account_id,
            observations=[],
            windows=[],
            attempts_since_use=0,
            next_check_at=clock.now(),
        )
        .on_conflict_do_nothing(index_elements=["account_id"])
    )
    return session.scalars(
        select(GentleProfile)
        .where(GentleProfile.account_id == account_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()


def _cancel(session: Session, occasion: GentleOccasion, at: datetime) -> None:
    occasion.cancelled_at = at
    if occasion.notification_id is not None:
        session.execute(
            update(Notification)
            .where(Notification.id == occasion.notification_id)
            .values(expires_at=at)
        )
        session.execute(
            update(PushDelivery)
            .where(
                PushDelivery.notification_id == occasion.notification_id,
                PushDelivery.status.in_(PENDING_PUSH),
            )
            .values(
                status=PushDeliveryStatus.UNAVAILABLE.value,
                last_error_code="GENTLE_OCCASION_CANCELLED",
                finished_at=at,
            )
        )


def _prune_observations(profile: GentleProfile, account: Account, at: datetime) -> None:
    cutoff = clock.today_in(account.timezone, at=at) - timedelta(days=policy.OBSERVATION_DAYS)
    profile.observations = [
        item for item in profile.observations if str(item["day"]) >= cutoff.isoformat()
    ]


def cancel_pending(session: Session, account_id: UUID, *, at: datetime) -> None:
    for occasion in session.scalars(
        select(GentleOccasion).where(
            GentleOccasion.account_id == account_id,
            GentleOccasion.cancelled_at.is_(None),
            GentleOccasion.attempted_at.is_(None),
            GentleOccasion.occasion_key.like("push:%"),
        )
    ):
        _cancel(session, occasion, at)


def set_enabled(session: Session, account_id: UUID, value: bool) -> None:
    accounts = effects.lock_enabled_accounts(session, {account_id})
    if accounts is None:
        raise ValueError("Account is unavailable.")
    account = accounts[account_id]
    if account.gentle_prompts_enabled == value:
        return
    account.gentle_prompts_enabled = value
    at = clock.now()
    cancel_pending(session, account_id, at=at)
    session.execute(delete(GentleProfile).where(GentleProfile.account_id == account_id))
    # Keep only the minimal canonical attempt evidence and explicit exclusions.
    session.execute(
        delete(GentleOccasion).where(
            GentleOccasion.account_id == account_id, GentleOccasion.attempted_at.is_(None)
        )
    )
    if value:
        profile = _profile(session, account_id)
        profile.last_attempt_at = session.scalar(
            select(func.max(GentleOccasion.attempted_at)).where(
                GentleOccasion.account_id == account_id,
            )
        )
    session.flush()


def record_use(
    session: Session,
    context: AuthorizationContext,
    *,
    manual_save: bool = False,
    memory_read: bool = False,
    at: datetime | None = None,
) -> None:
    """Server-time receipt for deliberate foreground use, never an imported event."""
    account = _account_barrier(session, context.account_id)
    if account is None or not account.gentle_prompts_enabled:
        return
    if not effects.has_active_membership(
        session, account_id=context.account_id, space_id=context.space_id
    ):
        return
    instant = clock.ensure_utc(at or clock.now())
    profile = _profile(session, context.account_id)
    if profile.last_use_at is not None and instant < profile.last_use_at:
        return
    if (
        not manual_save
        and not memory_read
        and profile.space_id == context.space_id
        and profile.last_use_at is not None
        and instant < profile.last_use_at + policy.FOREGROUND_COALESCE
    ):
        return
    if (
        profile.last_use_at is not None
        and instant >= profile.last_use_at + policy.PROFILE_RETENTION
    ):
        profile.observations = []
    observations = policy.observe(
        cast(list[policy.DayObservation], profile.observations),
        at=instant,
        timezone=account.timezone,
        memory_read=memory_read,
    )
    rhythm = policy.learn(observations)
    profile.observations = cast(list[dict[str, object]], observations)
    profile.interval_days = rhythm.interval_days
    profile.windows = list(rhythm.windows)
    profile.last_use_at = instant
    profile.space_id = context.space_id
    profile.attempts_since_use = 0
    profile.next_check_at = instant + timedelta(minutes=15)
    cancel_pending(session, context.account_id, at=instant)
    if manual_save:
        profile.last_save_at = instant
        for occasion in session.scalars(
            select(GentleOccasion).where(
                GentleOccasion.account_id == context.account_id,
                GentleOccasion.kind == "WRITING",
                GentleOccasion.attempted_at.is_(None),
                GentleOccasion.cancelled_at.is_(None),
            )
        ):
            _cancel(session, occasion, instant)
    session.flush()


def record_manual_save(session: Session, context: AuthorizationContext) -> None:
    """Called by explicit HTTP saves only, outside import/reconciliation services."""
    if not enabled(session, context.account_id):
        return
    try:
        with session.begin_nested():
            record_use(session, context, manual_save=True)
    except Exception:
        # Do not turn optional learning failures into saves or behavioral logs.
        return


def _context_available(session: Session, account_id: UUID, space_id: UUID) -> bool:
    if not effects.has_active_membership(session, account_id=account_id, space_id=space_id):
        return False
    memberships = list(
        session.scalars(
            select(Membership.id)
            .where(
                Membership.space_id == space_id, Membership.status == MembershipStatus.ACTIVE.value
            )
            .order_by(Membership.id)
            .with_for_update(read=True)
        )
    )
    return len(memberships) == 2


def _memory_candidates(
    context: AuthorizationContext,
    *,
    at: datetime,
    own_occasion: UUID | None = None,
) -> Select[tuple[Memory]]:
    excluded = exists(
        select(GentleMemoryExclusion.memory_id).where(
            GentleMemoryExclusion.account_id == context.account_id,
            GentleMemoryExclusion.memory_id == Memory.id,
        )
    )
    viewed = exists(
        select(StoryItemViewAggregate.item_id).where(
            StoryItemViewAggregate.space_id == context.space_id,
            StoryItemViewAggregate.viewer_account_id == context.account_id,
            StoryItemViewAggregate.item_kind == "MEMORY",
            StoryItemViewAggregate.item_id == Memory.id,
            StoryItemViewAggregate.last_viewed_at > at - policy.VIEW_SUPPRESSION,
        )
    )
    repeated = select(GentleOccasion.id).where(
        GentleOccasion.account_id == context.account_id,
        GentleOccasion.memory_id == Memory.id,
        GentleOccasion.created_at > at - policy.SOURCE_REPEAT_PAUSE,
        GentleOccasion.cancelled_at.is_(None),
    )
    if own_occasion is not None:
        repeated = repeated.where(GentleOccasion.id != own_occasion)
    return readable(Memory, context).where(
        Memory.privacy_class == PrivacyClass.SPACE_SHARED.value,
        ~excluded,
        ~viewed,
        ~repeated.exists(),
    )


def source_available(
    session: Session,
    context: AuthorizationContext,
    memory_id: UUID,
    *,
    at: datetime,
    own_occasion: UUID | None = None,
) -> bool:
    return (
        session.scalar(
            _memory_candidates(context, at=at, own_occasion=own_occasion)
            .where(Memory.id == memory_id)
            .with_only_columns(Memory.id)
            .with_for_update(read=True)
        )
        is not None
    )


def _select_memory(session: Session, context: AuthorizationContext, at: datetime) -> UUID | None:
    # One metadata query with indexed exclusion/view/repeat predicates.
    return session.scalar(
        _memory_candidates(context, at=at)
        .where(
            Memory.privacy_class == PrivacyClass.SPACE_SHARED.value,
            Memory.created_at < at - policy.VIEW_SUPPRESSION,
        )
        .with_only_columns(Memory.id)
        .order_by(Memory.created_at, Memory.id)
        .limit(1)
        .with_for_update(read=True)
    )


def _new_occasion(
    session: Session,
    account: Account,
    profile: GentleProfile,
    context: AuthorizationContext,
    *,
    key: str,
    at: datetime,
    expires_at: datetime,
) -> GentleOccasion:
    reading_days = sum(bool(item.get("memory_read")) for item in profile.observations)
    memory_id = _select_memory(session, context, at) if reading_days >= 2 else None
    occasion = GentleOccasion(
        id=new_id(),
        account_id=account.id,
        space_id=context.space_id,
        occasion_key=key,
        kind="MEMORY" if memory_id else "WRITING",
        memory_id=memory_id,
        created_at=at,
        expires_at=expires_at,
        baseline_use_at=profile.last_use_at,
    )
    session.add(occasion)
    session.flush()
    return occasion


def suggestion(session: Session, context: AuthorizationContext) -> GentleOccasion | None:
    account = _account_barrier(session, context.account_id)
    if account is None or not account.gentle_prompts_enabled:
        return None
    if not _context_available(session, account.id, context.space_id):
        return None
    profile = _profile(session, account.id)
    at = clock.now()
    if profile.last_use_at is not None and at >= profile.last_use_at + policy.PROFILE_RETENTION:
        clear_learning(session, account.id)
    _prune_observations(profile, account, at)
    today = clock.today_in(account.timezone, at=at)
    if profile.last_save_at and clock.today_in(account.timezone, at=profile.last_save_at) == today:
        return None
    key = f"app:{context.space_id}:{today.isoformat()}"
    occasion = session.scalar(
        select(GentleOccasion).where(
            GentleOccasion.account_id == account.id, GentleOccasion.occasion_key == key
        )
    )
    if occasion is None:
        end = clock.resolve_local(
            today + timedelta(days=1), time(), clock.resolve_zone(account.timezone)
        )
        occasion = _new_occasion(session, account, profile, context, key=key, at=at, expires_at=end)
    if (
        occasion.cancelled_at
        or occasion.dismissed_at
        or occasion.opened_at
        or occasion.expires_at <= at
    ):
        return None
    if occasion.kind == "MEMORY" and (
        occasion.memory_id is None
        or not source_available(
            session, context, occasion.memory_id, at=at, own_occasion=occasion.id
        )
    ):
        return None
    return occasion


def attention_collision(
    session: Session, account_id: UUID, start: datetime, end: datetime, *, at: datetime
) -> bool:
    partner_push = session.scalar(
        select(PushDelivery.id)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(
            Notification.recipient_account_id == account_id,
            Notification.actor_id.is_not(None),
            Notification.actor_id != account_id,
            PushDelivery.attempts > 0,
            PushDelivery.finished_at > at - policy.PARTNER_ATTENTION_PAUSE,
            PushDelivery.status.in_(
                [PushDeliveryStatus.SUCCEEDED.value, PushDeliveryStatus.FAILED.value]
            ),
        )
        .limit(1)
    )
    reminder = session.scalar(
        select(ReminderOccurrence.id)
        .join(Reminder, Reminder.id == ReminderOccurrence.reminder_id)
        .where(
            ReminderOccurrence.recipient_account_id == account_id,
            ReminderOccurrence.due_at >= start,
            ReminderOccurrence.due_at < end,
            ReminderOccurrence.state.in_(
                [OccurrenceState.PENDING.value, OccurrenceState.DELIVERED.value]
            ),
            Reminder.source == ReminderSource.MANUAL.value,
        )
        .limit(1)
    )
    return partner_push is not None or reminder is not None


def eligible_window(
    session: Session,
    account: Account,
    profile: GentleProfile,
    *,
    at: datetime,
    occasion: GentleOccasion | None = None,
) -> tuple[datetime, datetime] | None:
    if not account.gentle_prompts_enabled or profile.space_id is None:
        return None
    if not _context_available(session, account.id, profile.space_id):
        return None
    # A prepared attempt must not fail its own newly reserved cooldown.
    attempts = profile.attempts_since_use - (1 if occasion and occasion.attempted_at else 0)
    last_attempt = profile.last_attempt_at
    if occasion and occasion.attempted_at and last_attempt == occasion.attempted_at:
        last_attempt = session.scalar(
            select(func.max(GentleOccasion.attempted_at)).where(
                GentleOccasion.account_id == account.id,
                GentleOccasion.id != occasion.id,
            )
        )
    threshold = policy.eligible_after(
        last_use_at=profile.last_use_at,
        interval_days=profile.interval_days,
        attempts_since_use=max(0, attempts),
        last_attempt_at=last_attempt,
        at=at,
    )
    if threshold is None or at < threshold:
        return None
    window = policy.delivery_window(
        at=at,
        timezone=account.timezone,
        windows=tuple(profile.windows),
        quiet_hours=quiet_hours_preferences.own_window(account),
    )
    if window is None or attention_collision(session, account.id, *window, at=at):
        return None
    if occasion and (
        occasion.space_id != profile.space_id or occasion.baseline_use_at != profile.last_use_at
    ):
        return None
    return window


def reserve(session: Session, account_id: UUID) -> GentleOccasion | None:
    """Account barrier serializes candidate types, Spaces, devices and workers."""
    account = session.scalar(
        select(Account)
        .where(Account.id == account_id, Account.disabled_at.is_(None))
        .with_for_update(skip_locked=True)
    )
    if account is None:
        return None
    profile = session.get(GentleProfile, account_id)
    if profile is None:
        return None
    at = clock.now()
    if profile.space_id is not None and not _context_available(
        session, account_id, profile.space_id
    ):
        clear_learning(session, account_id)
        return None
    profile.next_check_at = at + timedelta(minutes=15)
    _prune_observations(profile, account, at)
    if profile.last_use_at is not None and at >= profile.last_use_at + policy.PROFILE_RETENTION:
        clear_learning(session, account_id)
        return None
    window = eligible_window(session, account, profile, at=at)
    if window is None:
        return None
    from eimir.engagement import push

    endpoints = session.scalars(
        select(PushEndpoint)
        .where(
            PushEndpoint.account_id == account_id,
            PushEndpoint.disabled_at.is_(None),
        )
        .order_by(PushEndpoint.created_at.desc())
        .limit(32)
    )
    if not any(push.supports_targeted_delivery(session, endpoint) for endpoint in endpoints):
        return None
    pending = session.scalar(
        select(GentleOccasion.id)
        .where(
            GentleOccasion.account_id == account_id,
            GentleOccasion.occasion_key.like("push:%"),
            GentleOccasion.cancelled_at.is_(None),
            GentleOccasion.attempted_at.is_(None),
            GentleOccasion.expires_at > at,
        )
        .limit(1)
    )
    if pending is not None:
        return None
    assert profile.space_id is not None
    context = AuthorizationContext(account_id=account_id, space_id=profile.space_id)
    local = at.astimezone(clock.resolve_zone(account.timezone))
    key = f"push:{local.date().isoformat()}:{local.hour // policy.WINDOW_HOURS}"
    if (
        session.scalar(
            select(GentleOccasion.id).where(
                GentleOccasion.account_id == account_id, GentleOccasion.occasion_key == key
            )
        )
        is not None
    ):
        return None
    occasion = _new_occasion(
        session, account, profile, context, key=key, at=at, expires_at=window[1]
    )
    outbox.record(
        session,
        DomainEvent(
            type=EventType.GENTLE_PROMPT_READY,
            space_id=context.space_id,
            subject_type="GENTLE_OCCASION",
            subject_id=occasion.id,
            payload=PublicEventPayload(recipient_id=account_id),
        ),
    )
    return occasion


def project(session: Session, event: OutboxEvent) -> None:
    occasion = session.get(GentleOccasion, event.subject_id)
    if occasion is None or occasion.cancelled_at or occasion.expires_at <= clock.now():
        return
    if occasion.kind == "MEMORY" and occasion.memory_id is None:
        return
    if occasion.account_id != event.payload.recipient_id or occasion.space_id != event.space_id:
        return
    account = session.get(Account, occasion.account_id)
    if account is None or not account.gentle_prompts_enabled:
        return
    statement = (
        insert(Notification)
        .values(
            id=new_id(),
            space_id=occasion.space_id,
            recipient_account_id=occasion.account_id,
            source_event_id=event.id,
            kind=KIND,
            target_type="MEMORY" if occasion.memory_id else None,
            target_id=occasion.memory_id,
            in_app_visible=False,
        )
        .on_conflict_do_nothing(index_elements=["recipient_account_id", "source_event_id", "kind"])
    )
    session.execute(statement)
    occasion.notification_id = session.scalar(
        select(Notification.id).where(
            Notification.recipient_account_id == occasion.account_id,
            Notification.source_event_id == event.id,
            Notification.kind == KIND,
        )
    )
    session.flush()


def change_occasion(
    session: Session, context: AuthorizationContext, occasion_id: UUID, *, opened: bool
) -> GentleOccasion | None:
    if _account_barrier(session, context.account_id) is None:
        return None
    occasion = session.scalar(
        select(GentleOccasion).where(
            GentleOccasion.id == occasion_id,
            GentleOccasion.account_id == context.account_id,
            GentleOccasion.space_id == context.space_id,
            GentleOccasion.cancelled_at.is_(None),
        )
    )
    if occasion is None or not enabled(session, context.account_id):
        return None
    at = clock.now()
    if occasion.kind == "MEMORY" and occasion.memory_id is None:
        return None
    if occasion.memory_id:
        memory = require_readable_shared(session, Memory, context, occasion.memory_id)
        if memory.privacy_class != PrivacyClass.SPACE_SHARED.value:
            return None
        if session.get(GentleMemoryExclusion, (context.account_id, occasion.memory_id)) is not None:
            return None
    session.refresh(occasion, with_for_update=True)
    if occasion.cancelled_at or occasion.dismissed_at or occasion.expires_at <= at:
        return None
    if opened:
        occasion.opened_at = occasion.opened_at or at
    else:
        occasion.dismissed_at = occasion.dismissed_at or at
    return occasion


def exclude_memory(session: Session, context: AuthorizationContext, memory_id: UUID) -> None:
    if _account_barrier(session, context.account_id) is None:
        return
    memory = require_readable_shared(session, Memory, context, memory_id)
    if memory.privacy_class != PrivacyClass.SPACE_SHARED.value:
        raise Memory.privacy_absence.error()
    session.execute(
        insert(GentleMemoryExclusion)
        .values(account_id=context.account_id, space_id=context.space_id, memory_id=memory_id)
        .on_conflict_do_nothing()
    )
    for occasion in session.scalars(
        select(GentleOccasion).where(
            GentleOccasion.account_id == context.account_id,
            GentleOccasion.memory_id == memory_id,
            GentleOccasion.attempted_at.is_(None),
        )
    ):
        _cancel(session, occasion, clock.now())


def clear_learning(session: Session, account_id: UUID) -> None:
    cancel_pending(session, account_id, at=clock.now())
    profile = session.get(GentleProfile, account_id)
    if profile is not None:
        profile.observations = []
        profile.windows = []
        profile.interval_days = None
        profile.last_use_at = None
        profile.last_save_at = None
        profile.space_id = None
        profile.attempts_since_use = policy.MAX_UNOBSERVED_ATTEMPTS
        profile.next_check_at = clock.now() + policy.PROFILE_RETENTION


def purge_account(session: Session, account_id: UUID) -> None:
    session.execute(delete(GentleProfile).where(GentleProfile.account_id == account_id))
    session.execute(delete(GentleOccasion).where(GentleOccasion.account_id == account_id))
    session.execute(
        delete(GentleMemoryExclusion).where(GentleMemoryExclusion.account_id == account_id)
    )


def purge_space_member(session: Session, account_id: UUID, space_id: UUID) -> None:
    # Offboarding already holds Membership exclusively. Do not take the
    # worker's Account/PushDelivery locks in the opposite order here. The
    # canonical current-membership gates invalidate delivery immediately.
    session.execute(
        update(GentleProfile)
        .where(GentleProfile.account_id == account_id)
        .values(
            observations=[],
            windows=[],
            interval_days=None,
            last_use_at=None,
            last_save_at=None,
            space_id=None,
            attempts_since_use=policy.MAX_UNOBSERVED_ATTEMPTS,
            next_check_at=clock.now() + policy.PROFILE_RETENTION,
        )
    )
    session.execute(
        delete(GentleOccasion).where(
            GentleOccasion.account_id == account_id,
            GentleOccasion.space_id == space_id,
            GentleOccasion.attempted_at.is_(None),
        )
    )
    session.execute(
        delete(GentleMemoryExclusion).where(
            GentleMemoryExclusion.account_id == account_id,
            GentleMemoryExclusion.space_id == space_id,
        )
    )
