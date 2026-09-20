"""Typed Space-wide product configuration.

This module owns the shared write boundary for #432. It deliberately stays
separate from deployment configuration, commercial Entitlements, and personal
Account preferences.

Callers must tenant-authorize with `require_membership` before loading a
configuration for a request. Writes additionally require the persisted
configuration-management capability established by #1113.
"""

from __future__ import annotations

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
    DAILY_CONTEXT_TIMEZONE_REQUIRED = "SPACE_DAILY_CONTEXT_TIMEZONE_REQUIRED"
    DAILY_CONTEXT_TIMEZONE_INVALID = "SPACE_DAILY_CONTEXT_TIMEZONE_INVALID"


def load(session: Session, space_id: UUID) -> SpaceConfiguration | None:
    """Load the typed configuration after the caller has authorized the Space."""
    return session.execute(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
    ).scalar_one_or_none()


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

    ADR 0007 additionally requires a timezone-change conflict while a current
    Space-day DailyCheckIn exists. That guard belongs to the later shared
    DailyCheckIn persistence slice; no such rows can exist before that runtime
    is introduced.
    """
    configuration = _locked_configuration(session, space_id, membership)

    if configuration.version != expected_version:
        raise ConflictError(
            "The Space configuration was changed by someone else.",
            ErrorCode.VERSION_CONFLICT,
        )

    timezone = _daily_timezone(daily_context_timezone)
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
