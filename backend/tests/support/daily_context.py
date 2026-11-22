"""Daily check-in configuration for tests (Core test support).

Shared by Core tests and the Pro insights tests (``backend/pro/pro_tests``), so the
Core tests never import a Pro test module (#2182).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.relationship import configuration as configuration_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    SpaceConfiguration,
)


def _membership(session: Session, space_id: UUID, account_id: UUID) -> Membership:
    return session.execute(
        select(Membership).where(
            Membership.space_id == space_id,
            Membership.account_id == account_id,
        )
    ).scalar_one()


def _configuration(session: Session, space_id: UUID) -> SpaceConfiguration:
    return session.execute(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
    ).scalar_one()


def configure_daily(
    session: Session,
    *,
    space_id: UUID,
    manager_id: UUID,
    vibe: bool = True,
    energy: bool = True,
    timezone: str = "Europe/Berlin",
    vibe_mode: DailyCheckInVisibilityMode = DailyCheckInVisibilityMode.IMMEDIATE,
    energy_mode: DailyCheckInVisibilityMode = DailyCheckInVisibilityMode.IMMEDIATE,
) -> SpaceConfiguration:
    current = _configuration(session, space_id)
    return configuration_service.update(
        session,
        space_id,
        _membership(session, space_id, manager_id),
        expected_version=current.version,
        vibe_check_enabled=vibe,
        energy_check_in_enabled=energy,
        love_notes_enabled=current.love_notes_enabled,
        support_gestures_enabled=current.support_gestures_enabled,
        shared_achievements_enabled=current.shared_achievements_enabled,
        daily_questions_enabled=current.daily_questions_enabled,
        daily_context_timezone=timezone,
        vibe_visibility_mode=vibe_mode,
        energy_visibility_mode=energy_mode,
    )
