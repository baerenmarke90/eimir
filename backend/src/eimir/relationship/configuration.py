"""Typed Space-wide product configuration.

This module owns the shared write boundary for #432. It deliberately stays
separate from deployment configuration, commercial Entitlements, and personal
Account preferences.

Callers must tenant-authorize with `require_membership` before loading a
configuration for a request. Writes additionally require the persisted
configuration-management capability established by #1113.
"""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from eimir.daily_checkins.context import resolve_space_day
from eimir.daily_checkins.models import DailyCheckIn
from eimir.identity.preferences import validate_timezone
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    Space,
    SpaceConfiguration,
)
from eimir.relationship.service import (
    SpaceErrorCode,
    can_manage_space_configuration,
)


class SpaceConfigurationErrorCode:
    MANAGEMENT_REQUIRED = "SPACE_CONFIGURATION_MANAGEMENT_REQUIRED"
    MODULE_DISABLED = "SPACE_MODULE_DISABLED"
    DAILY_CONTEXT_TIMEZONE_REQUIRED = "SPACE_DAILY_CONTEXT_TIMEZONE_REQUIRED"
    DAILY_CONTEXT_TIMEZONE_INVALID = "SPACE_DAILY_CONTEXT_TIMEZONE_INVALID"
    DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN = "SPACE_DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN"


def load(session: Session, space_id: UUID) -> SpaceConfiguration | None:
    """Load the typed configuration after the caller has authorized the Space."""
    return session.execute(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
    ).scalar_one_or_none()


class SpaceModule(StrEnum):
    """Closed V1 catalog for shared Space module availability."""

    VIBE_CHECK = "vibe_check"
    ENERGY_CHECK_IN = "energy_check_in"
    LOVE_NOTES = "love_notes"
    SUPPORT_GESTURES = "support_gestures"
    SHARED_ACHIEVEMENTS = "shared_achievements"
    DAILY_QUESTIONS = "daily_questions"


def module_enabled(configuration: SpaceConfiguration, module: SpaceModule) -> bool:
    """Resolve one typed module without introducing a free-form feature map."""
    match module:
        case SpaceModule.VIBE_CHECK:
            return configuration.vibe_check_enabled
        case SpaceModule.ENERGY_CHECK_IN:
            return configuration.energy_check_in_enabled
        case SpaceModule.LOVE_NOTES:
            return configuration.love_notes_enabled
        case SpaceModule.SUPPORT_GESTURES:
            return configuration.support_gestures_enabled
        case SpaceModule.SHARED_ACHIEVEMENTS:
            return configuration.shared_achievements_enabled
        case SpaceModule.DAILY_QUESTIONS:
            return configuration.daily_questions_enabled


def is_module_enabled(
    session: Session,
    space_id: UUID,
    module: SpaceModule,
    *,
    lock_space: bool = False,
) -> bool:
    """Return one Space-module choice, optionally serialized with config writes.

    This helper represents only the Space-configuration dimension of effective
    capability. Deployment capabilities, commercial Entitlements and personal
    consent remain separate authorities and must be composed by the owning
    feature where they apply.

    Runtime mutations and asynchronous side effects use lock_space=True. The
    shared Space-row lock serializes them with configuration updates, whose
    write boundary takes the exclusive lock on the same row. Work admitted
    before a disable may finish first; work starting after it fails closed.
    """
    if lock_space:
        locked_space_id = session.execute(
            select(Space.id).where(Space.id == space_id).with_for_update(read=True)
        ).scalar_one_or_none()
        if locked_space_id is None:
            return False

    configuration = load(session, space_id)
    return configuration is not None and module_enabled(configuration, module)


def require_module_enabled(
    session: Session,
    space_id: UUID,
    module: SpaceModule,
) -> None:
    """Reject new participation when the typed Space module is disabled."""
    if not is_module_enabled(session, space_id, module, lock_space=True):
        raise ForbiddenError(
            "This optional Space module is disabled.",
            SpaceConfigurationErrorCode.MODULE_DISABLED,
        )


def _locked_configuration(
    session: Session,
    space_id: UUID,
    membership: Membership,
) -> SpaceConfiguration:
    """Lock the Space/configuration and enforce the persisted manager capability."""
    space = session.execute(
        select(Space).where(Space.id == space_id).with_for_update()
    ).scalar_one_or_none()
    if space is None:
        raise NotFoundError("Space not found.", SpaceErrorCode.NOT_FOUND)

    if not can_manage_space_configuration(space, membership):
        raise ForbiddenError(
            "Only the Space configuration manager may change this configuration.",
            SpaceConfigurationErrorCode.MANAGEMENT_REQUIRED,
        )

    configuration = session.execute(
        select(SpaceConfiguration)
        .where(SpaceConfiguration.space_id == space_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()

    if configuration is None:
        # Migration 0063 backfills every existing Space and create_space() adds
        # the row for new Spaces. Keep this recovery path so an incomplete
        # legacy/restored row cannot force callers into a second config model.
        configuration = SpaceConfiguration(space_id=space_id)
        session.add(configuration)
        session.flush()

    return configuration


def _daily_timezone(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return validate_timezone(value)
    except ValidationError as invalid:
        raise ValidationError(
            "Enter a valid IANA time zone, for example Europe/Berlin.",
            SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_INVALID,
        ) from invalid


def _ensure_daily_timezone_change_allowed(
    session: Session,
    *,
    space_id: UUID,
    current_timezone: str | None,
    next_timezone: str | None,
) -> None:
    """Block reinterpreting an active Daily Check-in under another Space day."""
    if current_timezone == next_timezone or current_timezone is None:
        return

    any_check_in = session.execute(
        select(DailyCheckIn.id).where(DailyCheckIn.space_id == space_id).limit(1)
    ).scalar_one_or_none()
    if any_check_in is None:
        return

    try:
        current_day = resolve_space_day(current_timezone)
    except ConflictError as invalid_context:
        # Existing state plus an unusable authoritative zone cannot be
        # reclassified safely. Require an explicit data repair instead of
        # guessing which retained row represents the current day.
        raise ConflictError(
            "The shared daily context time zone cannot change while Daily Check-in "
            "state exists under an invalid current time zone.",
            SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN,
        ) from invalid_context

    current_exists = session.execute(
        select(DailyCheckIn.id)
        .where(
            DailyCheckIn.space_id == space_id,
            DailyCheckIn.checked_on == current_day,
        )
        .limit(1)
    ).scalar_one_or_none()
    if current_exists is not None:
        raise ConflictError(
            "The shared daily context time zone cannot change while current "
            "Daily Check-in state exists.",
            SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN,
        )


def update(
    session: Session,
    space_id: UUID,
    membership: Membership,
    *,
    expected_version: int,
    vibe_check_enabled: bool,
    energy_check_in_enabled: bool,
    love_notes_enabled: bool,
    support_gestures_enabled: bool,
    shared_achievements_enabled: bool,
    daily_questions_enabled: bool,
    daily_context_timezone: str | None,
    vibe_visibility_mode: DailyCheckInVisibilityMode,
    energy_visibility_mode: DailyCheckInVisibilityMode,
) -> SpaceConfiguration:
    """Replace the resulting typed state under optimistic concurrency.

    The HTTP layer can expose typed PATCH semantics later by merging only
    explicitly supplied fields with the state the client read, then calling
    this domain boundary with the complete result. Keeping partial-field
    sentinels out of the Domain prevents an untyped feature-map contract.

    ADR 0007 requires a timezone-change conflict while the current authoritative
    Space day has DailyCheckIn state. This boundary owns that guard because the
    Space row lock also serializes it with current-day writes.
    """
    configuration = _locked_configuration(session, space_id, membership)

    if configuration.version != expected_version:
        raise ConflictError(
            "The Space configuration was changed by someone else.",
            ErrorCode.VERSION_CONFLICT,
        )

    timezone = _daily_timezone(daily_context_timezone)
    _ensure_daily_timezone_change_allowed(
        session,
        space_id=space_id,
        current_timezone=configuration.daily_context_timezone,
        next_timezone=timezone,
    )
    if (vibe_check_enabled or energy_check_in_enabled) and timezone is None:
        raise ValidationError(
            "Daily Check-in modules require a shared daily context time zone.",
            SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_REQUIRED,
        )

    configuration.vibe_check_enabled = vibe_check_enabled
    configuration.energy_check_in_enabled = energy_check_in_enabled
    configuration.love_notes_enabled = love_notes_enabled
    configuration.support_gestures_enabled = support_gestures_enabled
    configuration.shared_achievements_enabled = shared_achievements_enabled
    configuration.daily_questions_enabled = daily_questions_enabled
    configuration.daily_context_timezone = timezone
    configuration.vibe_visibility_mode = vibe_visibility_mode.value
    configuration.energy_visibility_mode = energy_visibility_mode.value

    try:
        session.flush()
    except StaleDataError as stale:
        raise ConflictError(
            "The Space configuration was changed by someone else.",
            ErrorCode.VERSION_CONFLICT,
        ) from stale

    return configuration
