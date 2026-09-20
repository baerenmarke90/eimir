"""M4-C Reminder definition, schedule and preference services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_writable,
)
from eimir.core import clock
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.reminders import runtime as reminder_runtime
from eimir.reminders.models import (
    Reminder,
    ReminderOffset,
    ReminderPayload,
    ReminderPreference,
    ReminderScheduleType,
    ReminderSource,
    shared_privacy,
)

REMINDER_TITLE_REQUIRED = "REMINDER_TITLE_REQUIRED"
REMINDER_GENERATED_IMMUTABLE = "REMINDER_GENERATED_IMMUTABLE"
REMINDER_SCHEDULE_INVALID = "REMINDER_SCHEDULE_INVALID"
REMINDER_ONCE_TIMEZONE_REQUIRED = "REMINDER_ONCE_TIMEZONE_REQUIRED"
REMINDER_ONCE_IN_PAST = "REMINDER_ONCE_IN_PAST"
REMINDER_OFFSET_INVALID = "REMINDER_OFFSET_INVALID"
REMINDER_OFFSET_DUPLICATE = "REMINDER_OFFSET_DUPLICATE"

MAX_RELATIONSHIP_DAY_COUNT = (date.max - date.min).days + 1


@dataclass(frozen=True)
class ScheduleDefinition:
    type: ReminderScheduleType
    once_at: datetime | None = None
    annual_month: int | None = None
    annual_day: int | None = None
    local_time: time | None = None
    relationship_day_count: int | None = None


@dataclass(frozen=True)
class ReminderView:
    reminder: Reminder
    offsets: list[int]
    muted: bool


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(reminder: Reminder, expected_version: int) -> None:
    if reminder.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _ensure_manual(reminder: Reminder) -> None:
    if reminder.source != ReminderSource.MANUAL.value:
        raise ConflictError(
            "Generated reminders are controlled by their source and rule.",
            REMINDER_GENERATED_IMMUTABLE,
        )


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Reminder title must not be blank.", REMINDER_TITLE_REQUIRED)
    return cleaned


def _normalize_description(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_schedule(schedule: ScheduleDefinition) -> ScheduleDefinition:
    if schedule.type is ReminderScheduleType.ONCE:
        if schedule.once_at is None or any(
            value is not None
            for value in (
                schedule.annual_month,
                schedule.annual_day,
                schedule.local_time,
                schedule.relationship_day_count,
            )
        ):
            raise ValidationError("Invalid ONCE schedule.", REMINDER_SCHEDULE_INVALID)
        if schedule.once_at.tzinfo is None or schedule.once_at.utcoffset() is None:
            raise ValidationError(
                "ONCE schedule requires an offset-aware timestamp.",
                REMINDER_ONCE_TIMEZONE_REQUIRED,
            )
        normalized = schedule.once_at.astimezone(UTC)
        if normalized <= clock.now():
            raise ValidationError(
                "ONCE schedule must be in the future.",
                REMINDER_ONCE_IN_PAST,
            )
        return ScheduleDefinition(type=schedule.type, once_at=normalized)

    if schedule.type is ReminderScheduleType.ANNUAL:
        if (
            schedule.annual_month is None
            or schedule.annual_day is None
            or schedule.local_time is None
            or schedule.once_at is not None
            or schedule.relationship_day_count is not None
        ):
            raise ValidationError("Invalid ANNUAL schedule.", REMINDER_SCHEDULE_INVALID)
        try:
            date(2000, schedule.annual_month, schedule.annual_day)
        except ValueError as error:
            raise ValidationError(
                "ANNUAL month/day is not a valid calendar date.",
                REMINDER_SCHEDULE_INVALID,
            ) from error
        return schedule

    if schedule.type is ReminderScheduleType.RELATIONSHIP_DAY_COUNT:
        if (
            schedule.relationship_day_count is None
            or schedule.local_time is None
            or schedule.once_at is not None
            or schedule.annual_month is not None
            or schedule.annual_day is not None
            or not 1 <= schedule.relationship_day_count <= MAX_RELATIONSHIP_DAY_COUNT
        ):
            raise ValidationError(
                "Invalid RELATIONSHIP_DAY_COUNT schedule.",
                REMINDER_SCHEDULE_INVALID,
            )
        return schedule

    raise ValidationError("Unsupported reminder schedule.", REMINDER_SCHEDULE_INVALID)


def _normalize_offsets(values: list[int]) -> list[int]:
    if any(value < 0 or value > 365 for value in values):
        raise ValidationError(
            "Reminder offsets must be between 0 and 365 days.",
            REMINDER_OFFSET_INVALID,
        )
    if len(set(values)) != len(values):
        raise ValidationError(
            "Reminder offsets must be unique.",
            REMINDER_OFFSET_DUPLICATE,
        )
    return sorted(values)


def _apply_schedule(reminder: Reminder, schedule: ScheduleDefinition) -> None:
    reminder.schedule_type = schedule.type.value
    reminder.once_at = schedule.once_at
    reminder.annual_month = schedule.annual_month
    reminder.annual_day = schedule.annual_day
    reminder.local_time = schedule.local_time
    reminder.relationship_day_count = schedule.relationship_day_count


def _replace_offsets(session: Session, reminder: Reminder, values: list[int]) -> None:
    session.execute(delete(ReminderOffset).where(ReminderOffset.reminder_id == reminder.id))
    session.add_all(ReminderOffset(reminder_id=reminder.id, days_before=value) for value in values)


def _offsets(session: Session, reminder_id: UUID) -> list[int]:
    return list(
        session.execute(
            select(ReminderOffset.days_before)
            .where(ReminderOffset.reminder_id == reminder_id)
            .order_by(ReminderOffset.days_before)
        ).scalars()
    )


def _muted(session: Session, context: AuthorizationContext, reminder_id: UUID) -> bool:
    value = session.execute(
        select(ReminderPreference.muted).where(
            ReminderPreference.reminder_id == reminder_id,
            ReminderPreference.account_id == context.account_id,
        )
    ).scalar_one_or_none()
    return bool(value) if value is not None else False


def create_reminder(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    description: str | None,
    schedule: ScheduleDefinition,
    offsets: list[int],
) -> ReminderView:
    validated_schedule = _validate_schedule(schedule)
    normalized_offsets = _normalize_offsets(offsets)
    reminder = Reminder(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        source=ReminderSource.MANUAL.value,
        schedule_type=validated_schedule.type.value,
        payload=ReminderPayload(
            title=_normalize_title(title),
            description=_normalize_description(description),
        ),
    )
    _apply_schedule(reminder, validated_schedule)
    session.add(reminder)
    _flush(session)
    _replace_offsets(session, reminder, normalized_offsets)
    _flush(session)
    reminder_runtime.reconcile_reminder(session, reminder.id)
    return ReminderView(reminder=reminder, offsets=normalized_offsets, muted=False)


def _generated_source_is_current(session: Session, reminder: Reminder) -> bool:
    if reminder.source != ReminderSource.GENERATED.value:
        return True
    return reminder_runtime.source_is_eligible(session, reminder)


def _require_current_generated_source(session: Session, reminder: Reminder) -> None:
    if not _generated_source_is_current(session, reminder):
        raise Reminder.privacy_absence.error()


def get_reminder(
    session: Session,
    context: AuthorizationContext,
    reminder_id: UUID | str,
) -> ReminderView:
    reminder = require_readable(session, Reminder, context, reminder_id)
    _require_current_generated_source(session, reminder)
    return ReminderView(
        reminder=reminder,
        offsets=_offsets(session, reminder.id),
        muted=_muted(session, context, reminder.id),
    )


def list_reminders(session: Session, context: AuthorizationContext) -> list[ReminderView]:
    reminders = [
        reminder
        for reminder in session.execute(
            readable(Reminder, context).order_by(Reminder.created_at.desc(), Reminder.id.desc())
        ).scalars()
        if _generated_source_is_current(session, reminder)
    ]
    preference_rows: dict[UUID, bool] = {}
    if reminders:
        preference_rows = {
            reminder_id: muted
            for reminder_id, muted in session.execute(
                select(ReminderPreference.reminder_id, ReminderPreference.muted).where(
                    ReminderPreference.account_id == context.account_id,
                    ReminderPreference.reminder_id.in_([reminder.id for reminder in reminders]),
                )
            )
        }
    offsets_by_reminder: dict[UUID, list[int]] = {reminder.id: [] for reminder in reminders}
    if reminders:
        for reminder_id, days_before in session.execute(
            select(ReminderOffset.reminder_id, ReminderOffset.days_before)
            .where(ReminderOffset.reminder_id.in_([reminder.id for reminder in reminders]))
            .order_by(ReminderOffset.reminder_id, ReminderOffset.days_before)
        ):
            offsets_by_reminder[reminder_id].append(days_before)
    return [
        ReminderView(
            reminder=reminder,
            offsets=offsets_by_reminder[reminder.id],
            muted=bool(preference_rows.get(reminder.id, False)),
        )
        for reminder in reminders
    ]


def update_reminder(
    session: Session,
    context: AuthorizationContext,
    reminder_id: UUID | str,
    *,
    expected_version: int,
    title: str,
    description: str | None,
    schedule: ScheduleDefinition,
    offsets: list[int],
) -> ReminderView:
    reminder = require_writable(session, Reminder, context, reminder_id)
    _ensure_expected_version(reminder, expected_version)
    _ensure_manual(reminder)
    validated_schedule = _validate_schedule(schedule)
    normalized_offsets = _normalize_offsets(offsets)

    reminder.payload = ReminderPayload(
        title=_normalize_title(title),
        description=_normalize_description(description),
    )
    _apply_schedule(reminder, validated_schedule)
    reminder.updated_at = clock.now()
    _replace_offsets(session, reminder, normalized_offsets)
    _flush(session)
    reminder_runtime.reconcile_reminder(session, reminder.id)
    return ReminderView(
        reminder=reminder,
        offsets=normalized_offsets,
        muted=_muted(session, context, reminder.id),
    )


def delete_reminder(
    session: Session,
    context: AuthorizationContext,
    reminder_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    reminder = require_writable(session, Reminder, context, reminder_id)
    _ensure_expected_version(reminder, expected_version)
    _ensure_manual(reminder)
    session.delete(reminder)
    _flush(session)


def set_preference(
    session: Session,
    context: AuthorizationContext,
    reminder_id: UUID | str,
    *,
    muted: bool,
) -> ReminderView:
    reminder = require_readable(session, Reminder, context, reminder_id)
    _require_current_generated_source(session, reminder)
    statement = (
        postgresql.insert(ReminderPreference)
        .values(
            reminder_id=reminder.id,
            account_id=context.account_id,
            muted=muted,
        )
        .on_conflict_do_update(
            index_elements=["reminder_id", "account_id"],
            set_={"muted": muted, "updated_at": clock.now()},
        )
    )
    session.execute(statement)
    _flush(session)
    reminder_runtime.reconcile_reminder(session, reminder.id)
    return ReminderView(
        reminder=reminder,
        offsets=_offsets(session, reminder.id),
        muted=muted,
    )
