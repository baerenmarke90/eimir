"""Authoritative current-day Daily Check-in service.

Only owner state and a reveal-aware partner projection leave this module. There
is intentionally no raw/list partner read API: Mutual Reveal must be enforced
before a value reaches a client.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError, ErrorCode, ForbiddenError, ValidationError
from eimir.daily_checkins.context import DailyCheckInErrorCode, resolve_space_day
from eimir.daily_checkins.models import (
    DailyCheckIn,
    DailyCheckInVibeNote,
    DailyVibe,
    DailyVibeNotePayload,
)
from eimir.relationship import configuration as configuration_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    MembershipStatus,
    Space,
    SpaceConfiguration,
)

ABSENT_CONCURRENCY_TOKEN = "absent"
ENERGY_LEVELS = frozenset(range(10, 101, 10))
VIBE_NOTE_MAX_LENGTH = 200

DimensionValue = int | str


class DailyCheckInDimension(StrEnum):
    VIBE = "VIBE"
    ENERGY = "ENERGY"


class PartnerRevealState(StrEnum):
    HIDDEN_UNTIL_SELF_CHECK_IN = "HIDDEN_UNTIL_SELF_CHECK_IN"
    NO_CHECK_IN = "NO_CHECK_IN"
    VISIBLE = "VISIBLE"


@dataclass(frozen=True)
class DimensionUpdate[DimensionUpdateValue]:
    """One PATCH dimension, preserving omitted versus explicit null."""

    supplied: bool
    value: DimensionUpdateValue | None = None


@dataclass(frozen=True)
class PartnerDimensionProjection:
    state: PartnerRevealState
    value: DimensionValue | None = None
    check_in_id: UUID | None = None


@dataclass(frozen=True)
class TodayProjection:
    checked_on: date
    daily_context_timezone: str
    own: DailyCheckIn | None
    own_vibe_note: str | None
    vibe_enabled: bool
    vibe_visibility_mode: DailyCheckInVisibilityMode
    partner_vibe: PartnerDimensionProjection | None
    partner_vibe_note: str | None
    energy_enabled: bool
    energy_visibility_mode: DailyCheckInVisibilityMode
    partner_energy: PartnerDimensionProjection | None


def concurrency_token(check_in: DailyCheckIn | None, checked_on: date) -> str:
    """Return an ABA- and day-safe strong-ETag payload for current owner state.

    The authoritative day is part of the token even when no row exists. Without
    it, yesterday's absent validator would still match after midnight and an
    offline/stale mutation could accidentally create today's state.
    """
    state = ABSENT_CONCURRENCY_TOKEN
    if check_in is not None:
        state = f"{check_in.id}:{check_in.version}"
    return f"{checked_on.isoformat()}:{state}"


def _require_expected_token(
    check_in: DailyCheckIn | None,
    checked_on: date,
    expected_token: str,
) -> None:
    if concurrency_token(check_in, checked_on) != expected_token:
        raise ConflictError(
            "The Daily Check-in changed since it was read.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _configuration(session: Session, space_id: UUID) -> SpaceConfiguration:
    configuration = configuration_service.load(session, space_id)
    if configuration is None:
        raise ConflictError(
            "Daily Check-in configuration is unavailable for this Space.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        )
    return configuration


def _own_for_day(
    session: Session,
    authorization: AuthorizationContext,
    checked_on: date,
    *,
    for_update: bool = False,
) -> DailyCheckIn | None:
    statement = select(DailyCheckIn).where(
        DailyCheckIn.space_id == authorization.space_id,
        DailyCheckIn.account_id == authorization.account_id,
        DailyCheckIn.checked_on == checked_on,
    )
    if for_update:
        statement = statement.with_for_update()
    return session.execute(statement).scalar_one_or_none()


def _vibe_note_row(
    session: Session,
    check_in_id: UUID,
) -> DailyCheckInVibeNote | None:
    return session.execute(
        select(DailyCheckInVibeNote).where(
            DailyCheckInVibeNote.daily_check_in_id == check_in_id
        )
    ).scalar_one_or_none()


def _vibe_note_value(session: Session, check_in_id: UUID) -> str | None:
    row = _vibe_note_row(session, check_in_id)
    return row.payload.note if row is not None else None


def _active_partner_account_id(
    session: Session,
    authorization: AuthorizationContext,
) -> UUID | None:
    membership = session.execute(
        select(Membership)
        .where(
            Membership.space_id == authorization.space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.account_id != authorization.account_id,
        )
        .order_by(Membership.joined_at, Membership.id)
        .with_for_update(read=True)
        .limit(1)
    ).scalar_one_or_none()
    return membership.account_id if membership is not None else None


def _dimension_value(
    check_in: DailyCheckIn | None,
    dimension: DailyCheckInDimension,
) -> DimensionValue | None:
    if check_in is None:
        return None
    if dimension is DailyCheckInDimension.VIBE:
        return check_in.vibe
    return check_in.energy_level


def _partner_dimension(
    session: Session,
    authorization: AuthorizationContext,
    *,
    checked_on: date,
    own: DailyCheckIn | None,
    dimension: DailyCheckInDimension,
    visibility_mode: DailyCheckInVisibilityMode,
) -> PartnerDimensionProjection:
    own_value = _dimension_value(own, dimension)
    if visibility_mode is DailyCheckInVisibilityMode.MUTUAL_REVEAL and own_value is None:
        # Privacy invariant: do not even query partner participation while the
        # caller has not satisfied this dimension's reveal condition.
        return PartnerDimensionProjection(state=PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN)

    partner_account_id = _active_partner_account_id(session, authorization)
    if partner_account_id is None:
        return PartnerDimensionProjection(state=PartnerRevealState.NO_CHECK_IN)

    filters = (
        DailyCheckIn.space_id == authorization.space_id,
        DailyCheckIn.account_id == partner_account_id,
        DailyCheckIn.checked_on == checked_on,
    )
    selected_dimension = (
        DailyCheckIn.vibe
        if dimension is DailyCheckInDimension.VIBE
        else DailyCheckIn.energy_level
    )
    partner_row = session.execute(
        select(DailyCheckIn.id, selected_dimension).where(*filters)
    ).one_or_none()

    if partner_row is None or partner_row[1] is None:
        return PartnerDimensionProjection(state=PartnerRevealState.NO_CHECK_IN)
    return PartnerDimensionProjection(
        state=PartnerRevealState.VISIBLE,
        value=partner_row[1],
        check_in_id=partner_row[0],
    )


def _project(
    session: Session,
    authorization: AuthorizationContext,
    *,
    configuration: SpaceConfiguration,
    checked_on: date,
    own: DailyCheckIn | None,
) -> TodayProjection:
    timezone_name = configuration.daily_context_timezone
    assert timezone_name is not None  # resolve_space_day already proved this state.

    vibe_enabled = configuration_service.module_enabled(
        configuration,
        configuration_service.SpaceModule.VIBE_CHECK,
    )
    vibe_mode = DailyCheckInVisibilityMode(configuration.vibe_visibility_mode)
    partner_vibe = (
        _partner_dimension(
            session,
            authorization,
            checked_on=checked_on,
            own=own,
            dimension=DailyCheckInDimension.VIBE,
            visibility_mode=vibe_mode,
        )
        if vibe_enabled
        else None
    )

    own_vibe_note = (
        _vibe_note_value(session, own.id)
        if own is not None and own.vibe is not None
        else None
    )
    partner_vibe_note = (
        _vibe_note_value(session, partner_vibe.check_in_id)
        if partner_vibe is not None
        and partner_vibe.state is PartnerRevealState.VISIBLE
        and partner_vibe.check_in_id is not None
        else None
    )

    energy_enabled = configuration_service.module_enabled(
        configuration,
        configuration_service.SpaceModule.ENERGY_CHECK_IN,
    )
    energy_mode = DailyCheckInVisibilityMode(configuration.energy_visibility_mode)
    partner_energy = (
        _partner_dimension(
            session,
            authorization,
            checked_on=checked_on,
            own=own,
            dimension=DailyCheckInDimension.ENERGY,
            visibility_mode=energy_mode,
        )
        if energy_enabled
        else None
    )
    return TodayProjection(
        checked_on=checked_on,
        daily_context_timezone=timezone_name,
        own=own,
        own_vibe_note=own_vibe_note,
        vibe_enabled=vibe_enabled,
        vibe_visibility_mode=vibe_mode,
        partner_vibe=partner_vibe,
        partner_vibe_note=partner_vibe_note,
        energy_enabled=energy_enabled,
        energy_visibility_mode=energy_mode,
        partner_energy=partner_energy,
    )


def get_today(
    session: Session,
    authorization: AuthorizationContext,
    *,
    at: datetime | None = None,
) -> TodayProjection:
    """Read only the caller's current state and the reveal-safe partner projection."""
    configuration = _configuration(session, authorization.space_id)
    checked_on = resolve_space_day(configuration.daily_context_timezone, at=at)
    own = _own_for_day(session, authorization, checked_on)
    return _project(
        session,
        authorization,
        configuration=configuration,
        checked_on=checked_on,
        own=own,
    )


def _locked_space(session: Session, space_id: UUID) -> None:
    """Serialize current-day writes with Space-configuration/timezone writes."""
    found = session.execute(
        select(Space.id).where(Space.id == space_id).with_for_update()
    ).scalar_one_or_none()
    if found is None:
        # Tenant authorization normally makes this unreachable. Keep the service
        # fail-closed rather than continuing against detached configuration.
        raise ConflictError(
            "Daily Check-in context is unavailable for this Space.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        )


def _validate_energy(value: int) -> int:
    if value not in ENERGY_LEVELS:
        raise ValidationError(
            "Energy level must be one of 10, 20, ..., 100.",
            DailyCheckInErrorCode.ENERGY_LEVEL_INVALID,
        )
    return value


def _normalize_vibe_note(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > VIBE_NOTE_MAX_LENGTH:
        raise ValidationError(
            f"Vibe context must be at most {VIBE_NOTE_MAX_LENGTH} characters.",
            ErrorCode.VALIDATION_FAILED,
        )
    return normalized


def _require_dimension_enabled(
    configuration: SpaceConfiguration,
    module: configuration_service.SpaceModule,
) -> None:
    if not configuration_service.module_enabled(configuration, module):
        raise ForbiddenError(
            "This optional Space module is disabled.",
            configuration_service.SpaceConfigurationErrorCode.MODULE_DISABLED,
        )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as stale:
        raise ConflictError(
            "The Daily Check-in changed since it was read.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from stale


def update_today(
    session: Session,
    authorization: AuthorizationContext,
    *,
    expected_token: str,
    energy: DimensionUpdate[int],
    vibe: DimensionUpdate[DailyVibe],
    vibe_note: DimensionUpdate[str] | None = None,
    at: datetime | None = None,
) -> TodayProjection:
    """Apply a partial owner mutation to the shared current-day record.

    Omitted dimensions remain unchanged while explicit null clears only the
    supplied dimension. Clearing stays available while its module is disabled;
    supplying a value is participation and requires that dimension's module.
    The exclusive Space row lock preserves the existing lock/race contract with
    configuration and time-zone writes.
    """
    # Take the partner Membership share lock before the Space write lock.
    # Offboarding uses Membership -> Space as well; preserving that order
    # prevents a Daily Check-in response from racing a partner exit without
    # introducing a new deadlock cycle.
    if vibe_note is None:
        vibe_note = DimensionUpdate[str](supplied=False)

    _active_partner_account_id(session, authorization)
    _locked_space(session, authorization.space_id)
    configuration = _configuration(session, authorization.space_id)
    checked_on = resolve_space_day(configuration.daily_context_timezone, at=at)
    own = _own_for_day(session, authorization, checked_on, for_update=True)
    _require_expected_token(own, checked_on, expected_token)

    if energy.supplied and energy.value is not None:
        _validate_energy(energy.value)
        _require_dimension_enabled(
            configuration,
            configuration_service.SpaceModule.ENERGY_CHECK_IN,
        )
    if vibe.supplied and vibe.value is not None:
        _require_dimension_enabled(
            configuration,
            configuration_service.SpaceModule.VIBE_CHECK,
        )

    current_note_row = _vibe_note_row(session, own.id) if own is not None else None
    current_vibe_note = (
        current_note_row.payload.note if current_note_row is not None else None
    )

    next_energy = own.energy_level if own is not None else None
    next_vibe = own.vibe if own is not None else None
    next_vibe_note = current_vibe_note
    if energy.supplied:
        next_energy = energy.value
    if vibe.supplied:
        next_vibe = vibe.value.value if vibe.value is not None else None
        if vibe.value is None:
            next_vibe_note = None
    if vibe_note.supplied:
        next_vibe_note = _normalize_vibe_note(vibe_note.value)

    if next_vibe_note is not None and next_vibe is None:
        raise ValidationError(
            "Vibe context requires a Vibe for the same current-day check-in.",
            DailyCheckInErrorCode.VIBE_NOTE_REQUIRES_VIBE,
        )
    if vibe_note.supplied and next_vibe_note is not None:
        _require_dimension_enabled(
            configuration,
            configuration_service.SpaceModule.VIBE_CHECK,
        )

    existing_owner = own is not None
    if own is None:
        if next_energy is not None or next_vibe is not None:
            own = DailyCheckIn(
                space_id=authorization.space_id,
                account_id=authorization.account_id,
                checked_on=checked_on,
                energy_level=next_energy,
                vibe=next_vibe,
            )
            try:
                with session.begin_nested():
                    session.add(own)
                    session.flush()
            except IntegrityError as duplicate:
                raise ConflictError(
                    "A Daily Check-in was created concurrently.",
                    ErrorCode.RESOURCE_VERSION_CONFLICT,
                ) from duplicate
    elif next_energy is None and next_vibe is None:
        session.delete(own)
        _flush(session)
        own = None
    else:
        own.energy_level = next_energy
        own.vibe = next_vibe

    if own is not None:
        note_changed = next_vibe_note != current_vibe_note
        if note_changed:
            if next_vibe_note is None:
                if current_note_row is not None:
                    session.delete(current_note_row)
            elif current_note_row is None:
                session.add(
                    DailyCheckInVibeNote(
                        daily_check_in_id=own.id,
                        payload=DailyVibeNotePayload(note=next_vibe_note),
                    )
                )
            else:
                current_note_row.payload = DailyVibeNotePayload(note=next_vibe_note)

            # The DailyCheckIn ETag owns concurrency for the complete aggregate.
            # A child-only note edit must therefore advance the parent version.
            if existing_owner:
                own.updated_at = datetime.now(UTC)

        _flush(session)

    return _project(
        session,
        authorization,
        configuration=configuration,
        checked_on=checked_on,
        own=own,
    )
