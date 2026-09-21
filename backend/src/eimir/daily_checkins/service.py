"""Authoritative current-day Daily Check-in service.

Only owner state and a reveal-aware partner projection leave this module. There
is intentionally no raw/list partner read API: Mutual Reveal must be enforced
before a value reaches a client.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError, ErrorCode, ForbiddenError, ValidationError
from eimir.daily_checkins.context import DailyCheckInErrorCode, resolve_space_day
from eimir.daily_checkins.models import DailyCheckIn
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


class PartnerRevealState(StrEnum):
    HIDDEN_UNTIL_SELF_CHECK_IN = "HIDDEN_UNTIL_SELF_CHECK_IN"
    NO_CHECK_IN = "NO_CHECK_IN"
    VISIBLE = "VISIBLE"


@dataclass(frozen=True)
class PartnerDimensionProjection:
    state: PartnerRevealState
    value: int | None = None


@dataclass(frozen=True)
class TodayProjection:
    checked_on: date
    daily_context_timezone: str
    own: DailyCheckIn | None
    energy_enabled: bool
    energy_visibility_mode: DailyCheckInVisibilityMode
    partner_energy: PartnerDimensionProjection | None


def concurrency_token(check_in: DailyCheckIn | None) -> str:
    """Return an ABA-safe strong-ETag payload for the caller's current row."""
    if check_in is None:
        return ABSENT_CONCURRENCY_TOKEN
    return f"{check_in.id}:{check_in.version}"


def _require_expected_token(check_in: DailyCheckIn | None, expected_token: str) -> None:
    if concurrency_token(check_in) != expected_token:
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


def _partner_energy(
    session: Session,
    authorization: AuthorizationContext,
    *,
    checked_on: date,
    own: DailyCheckIn | None,
    visibility_mode: DailyCheckInVisibilityMode,
) -> PartnerDimensionProjection:
    own_energy = own.energy_level if own is not None else None
    if visibility_mode is DailyCheckInVisibilityMode.MUTUAL_REVEAL and own_energy is None:
        # Privacy invariant: do not even query partner participation while the
        # caller has not satisfied this dimension's reveal condition.
        return PartnerDimensionProjection(state=PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN)

    partner_account_id = _active_partner_account_id(session, authorization)
    if partner_account_id is None:
        return PartnerDimensionProjection(state=PartnerRevealState.NO_CHECK_IN)

    partner_energy = session.execute(
        select(DailyCheckIn.energy_level).where(
            DailyCheckIn.space_id == authorization.space_id,
            DailyCheckIn.account_id == partner_account_id,
            DailyCheckIn.checked_on == checked_on,
        )
    ).scalar_one_or_none()
    if partner_energy is None:
        return PartnerDimensionProjection(state=PartnerRevealState.NO_CHECK_IN)
    return PartnerDimensionProjection(
        state=PartnerRevealState.VISIBLE,
        value=partner_energy,
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

    energy_enabled = configuration_service.module_enabled(
        configuration,
        configuration_service.SpaceModule.ENERGY_CHECK_IN,
    )
    energy_mode = DailyCheckInVisibilityMode(configuration.energy_visibility_mode)
    partner_energy = (
        _partner_energy(
            session,
            authorization,
            checked_on=checked_on,
            own=own,
            visibility_mode=energy_mode,
        )
        if energy_enabled
        else None
    )
    return TodayProjection(
        checked_on=checked_on,
        daily_context_timezone=timezone_name,
        own=own,
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


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as stale:
        raise ConflictError(
            "The Daily Check-in changed since it was read.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from stale


def set_energy(
    session: Session,
    authorization: AuthorizationContext,
    *,
    expected_token: str,
    energy_level: int | None,
    at: datetime | None = None,
) -> TodayProjection:
    """Set or clear Energy on the one shared current-day record.

    Clearing is owner-controlled and remains available while the Space module is
    disabled. Setting a value is participation and therefore requires the
    module to be enabled. The exclusive Space row lock provides one lock order
    shared with configuration/timezone changes and serializes concurrent first
    writes before the unique constraint is reached.
    """
    # Take the partner Membership share lock before the Space write lock.
    # Offboarding uses Membership -> Space as well; preserving that order
    # prevents a Daily Check-in response from racing a partner exit without
    # introducing a new deadlock cycle.
    _active_partner_account_id(session, authorization)
    _locked_space(session, authorization.space_id)
    configuration = _configuration(session, authorization.space_id)
    checked_on = resolve_space_day(configuration.daily_context_timezone, at=at)
    own = _own_for_day(session, authorization, checked_on, for_update=True)
    _require_expected_token(own, expected_token)

    if energy_level is not None:
        normalized_energy = _validate_energy(energy_level)
        if not configuration_service.module_enabled(
            configuration,
            configuration_service.SpaceModule.ENERGY_CHECK_IN,
        ):
            raise ForbiddenError(
                "This optional Space module is disabled.",
                configuration_service.SpaceConfigurationErrorCode.MODULE_DISABLED,
            )
    else:
        normalized_energy = None

    if own is None:
        if normalized_energy is not None:
            own = DailyCheckIn(
                space_id=authorization.space_id,
                account_id=authorization.account_id,
                checked_on=checked_on,
                energy_level=normalized_energy,
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
    else:
        if normalized_energy is None and own.vibe is None:
            session.delete(own)
            _flush(session)
            own = None
        else:
            own.energy_level = normalized_energy
            _flush(session)

    return _project(
        session,
        authorization,
        configuration=configuration,
        checked_on=checked_on,
        own=own,
    )
