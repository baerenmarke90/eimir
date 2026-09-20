"""M7-S0 typed Space configuration domain contract."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError, ErrorCode, ForbiddenError, ValidationError
from eimir.relationship import configuration as configuration_service
from eimir.relationship import service as relationship_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    SpaceConfiguration,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    founder = make_account(session, "Founder")
    partner = make_account(session, "Partner")
    space = make_space(session, founder)
    relationship_service.add_member(session, space.id, partner)
    session.flush()

    founder_membership = _membership(session, space.id, founder.id)
    partner_membership = _membership(session, space.id, partner.id)
    return space, founder_membership, partner_membership


def _membership(session: Session, space_id: UUID, account_id: UUID) -> Membership:
    return session.execute(
        select(Membership).where(
            Membership.space_id == space_id,
            Membership.account_id == account_id,
        )
    ).scalar_one()


def _stored(session: Session, space_id: UUID) -> SpaceConfiguration:
    configuration = session.execute(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
    ).scalar_one()
    session.refresh(configuration)
    return configuration


def _update(
    session: Session,
    space_id: UUID,
    membership: Membership,
    *,
    expected_version: int = 1,
    vibe: bool = False,
    energy: bool = False,
    love_notes: bool = False,
    support_gestures: bool = True,
    achievements: bool = False,
    questions: bool = False,
    timezone: str | None = None,
    vibe_mode: DailyCheckInVisibilityMode = DailyCheckInVisibilityMode.IMMEDIATE,
    energy_mode: DailyCheckInVisibilityMode = DailyCheckInVisibilityMode.IMMEDIATE,
) -> SpaceConfiguration:
    return configuration_service.update(
        session,
        space_id,
        membership,
        expected_version=expected_version,
        vibe_check_enabled=vibe,
        energy_check_in_enabled=energy,
        love_notes_enabled=love_notes,
        support_gestures_enabled=support_gestures,
        shared_achievements_enabled=achievements,
        daily_questions_enabled=questions,
        daily_context_timezone=timezone,
        vibe_visibility_mode=vibe_mode,
        energy_visibility_mode=energy_mode,
    )


def test_new_space_has_typed_v1_defaults(session: Session) -> None:
    founder = make_account(session, "Solo founder")
    space = make_space(session, founder)
    configuration = _stored(session, space.id)

    assert configuration.version == 1
    assert not configuration.vibe_check_enabled
    assert not configuration.energy_check_in_enabled
    assert not configuration.love_notes_enabled
    assert configuration.support_gestures_enabled
    assert not configuration.shared_achievements_enabled
    assert not configuration.daily_questions_enabled
    assert configuration.daily_context_timezone is None
    assert configuration.vibe_visibility_mode == "IMMEDIATE"
    assert configuration.energy_visibility_mode == "IMMEDIATE"


def test_manager_can_update_independent_typed_modules(
    session: Session,
    pair,
) -> None:  # type: ignore[no-untyped-def]
    space, manager, _ = pair

    updated = _update(
        session,
        space.id,
        manager,
        vibe=True,
        love_notes=True,
        timezone="Europe/Berlin",
        vibe_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL,
    )

    assert updated.version == 2
    assert updated.vibe_check_enabled
    assert not updated.energy_check_in_enabled
    assert updated.love_notes_enabled
    assert updated.daily_context_timezone == "Europe/Berlin"
    assert updated.vibe_visibility_mode == "MUTUAL_REVEAL"


def test_partner_cannot_update_space_configuration(
    session: Session,
    pair,
) -> None:  # type: ignore[no-untyped-def]
    space, _, partner = pair

    with pytest.raises(ForbiddenError) as denied:
        _update(session, space.id, partner, love_notes=True)

    assert (
        denied.value.code == configuration_service.SpaceConfigurationErrorCode.MANAGEMENT_REQUIRED
    )
    assert not _stored(session, space.id).love_notes_enabled


@pytest.mark.parametrize("dimension", ["vibe", "energy"])
def test_daily_dimension_requires_shared_timezone(
    session: Session,
    pair,
    dimension: str,
) -> None:  # type: ignore[no-untyped-def]
    space, manager, _ = pair
    values = {dimension: True}

    with pytest.raises(ValidationError) as invalid:
        _update(session, space.id, manager, love_notes=True, **values)

    assert (
        invalid.value.code
        == configuration_service.SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_REQUIRED
    )
    stored = _stored(session, space.id)
    assert not stored.vibe_check_enabled
    assert not stored.energy_check_in_enabled
    assert not stored.love_notes_enabled
    assert stored.version == 1


def test_invalid_timezone_fails_without_partial_mutation(
    session: Session,
    pair,
) -> None:  # type: ignore[no-untyped-def]
    space, manager, _ = pair

    with pytest.raises(ValidationError) as invalid:
        _update(
            session,
            space.id,
            manager,
            love_notes=True,
            timezone="Europe/Berlinn",
        )

    assert (
        invalid.value.code
        == configuration_service.SpaceConfigurationErrorCode.DAILY_CONTEXT_TIMEZONE_INVALID
    )
    stored = _stored(session, space.id)
    assert not stored.love_notes_enabled
    assert stored.daily_context_timezone is None
    assert stored.version == 1


def test_stale_version_fails_without_overwriting_newer_configuration(
    session: Session,
    pair,
) -> None:  # type: ignore[no-untyped-def]
    space, manager, _ = pair
    first = _update(session, space.id, manager, love_notes=True)
    assert first.version == 2

    with pytest.raises(ConflictError) as conflict:
        _update(
            session,
            space.id,
            manager,
            expected_version=1,
            support_gestures=False,
        )

    assert conflict.value.code == ErrorCode.VERSION_CONFLICT
    stored = _stored(session, space.id)
    assert stored.love_notes_enabled
    assert stored.support_gestures_enabled
    assert stored.version == 2


def test_unchanged_write_keeps_version(
    session: Session,
    pair,
) -> None:  # type: ignore[no-untyped-def]
    space, manager, _ = pair

    unchanged = _update(session, space.id, manager)

    assert unchanged.version == 1
