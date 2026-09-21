"""M7 shared Daily Check-in foundation: authority, reveal, concurrency and retention."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.daily_checkins import context as daily_context
from eimir.daily_checkins import retention, service
from eimir.daily_checkins.models import DailyCheckIn
from eimir.relationship import configuration as configuration_service
from eimir.relationship import service as relationship_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    MembershipStatus,
    SpaceConfiguration,
)
from eimir.transfer import service as transfer_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/daily-check-in/today"


def if_match(etag: str) -> dict[str, str]:
    return {"If-Match": etag}


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
    energy: bool = True,
    timezone: str | None = "Europe/Berlin",
    energy_mode: DailyCheckInVisibilityMode = DailyCheckInVisibilityMode.IMMEDIATE,
) -> SpaceConfiguration:
    current = _configuration(session, space_id)
    return configuration_service.update(
        session,
        space_id,
        _membership(session, space_id, manager_id),
        expected_version=current.version,
        vibe_check_enabled=current.vibe_check_enabled,
        energy_check_in_enabled=energy,
        love_notes_enabled=current.love_notes_enabled,
        support_gestures_enabled=current.support_gestures_enabled,
        shared_achievements_enabled=current.shared_achievements_enabled,
        daily_questions_enabled=current.daily_questions_enabled,
        daily_context_timezone=timezone,
        vibe_visibility_mode=DailyCheckInVisibilityMode(current.vibe_visibility_mode),
        energy_visibility_mode=energy_mode,
    )


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    manager = make_account(session, "Manager")
    partner = make_account(session, "Partner")
    outsider = make_account(session, "Outsider")
    manager.timezone = "America/Los_Angeles"
    partner.timezone = "Asia/Tokyo"

    space = make_space(session, manager)
    relationship_service.add_member(session, space.id, partner)
    outsider_space = make_space(session, outsider)
    session.flush()

    return {
        "space": space,
        "manager": manager,
        "partner": partner,
        "outsider": outsider,
        "outsider_space": outsider_space,
        "manager_token": sign_in(session, manager),
        "partner_token": sign_in(session, partner),
        "outsider_token": sign_in(session, outsider),
    }


class TestAuthorityAndSpaceDay:
    def test_foreign_space_matches_nonexistent_privacy_boundary(
        self, client, session: Session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
        )
        # The ordinary Tenant dependency owns this privacy boundary; DailyCheckIn
        # has no alternate raw read path that bypasses it.
        foreign = client.get(
            path(couple["space"].id),
            headers=auth(couple["outsider_token"]),
        )
        nonexistent = client.get(
            path("0199b2f3-7c44-7000-8000-000000000001"),
            headers=auth(couple["outsider_token"]),
        )
        assert foreign.status_code == nonexistent.status_code == 404
        assert foreign.json() == nonexistent.json()

    def test_missing_shared_timezone_fails_closed(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            path(couple["space"].id),
            headers=auth(couple["manager_token"]),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "DAILY_CHECK_IN_CONTEXT_UNAVAILABLE"

    def test_shared_timezone_not_account_timezone_defines_day(
        self,
        client,
        session: Session,
        couple,
        monkeypatch,
    ) -> None:  # type: ignore[no-untyped-def]
        fixed = datetime(2026, 9, 21, 22, 30, tzinfo=UTC)
        monkeypatch.setattr(daily_context, "now", lambda: fixed)
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
            timezone="Europe/Berlin",
        )

        manager = client.get(path(couple["space"].id), headers=auth(couple["manager_token"]))
        partner = client.get(path(couple["space"].id), headers=auth(couple["partner_token"]))

        assert manager.status_code == partner.status_code == 200
        assert manager.json()["checkedOn"] == partner.json()["checkedOn"] == "2026-09-22"
        assert manager.json()["dailyContextTimezone"] == "Europe/Berlin"
        assert partner.json()["dailyContextTimezone"] == "Europe/Berlin"

    def test_timezone_change_conflicts_only_with_current_space_day(
        self,
        client,
        session: Session,
        couple,
        monkeypatch,
    ) -> None:  # type: ignore[no-untyped-def]
        fixed = datetime(2026, 9, 21, 10, 0, tzinfo=UTC)
        monkeypatch.setattr(daily_context, "now", lambda: fixed)
        configuration = configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
        )
        current = client.get(path(couple["space"].id), headers=auth(couple["manager_token"]))
        created = client.patch(
            path(couple["space"].id),
            json={"energyLevel": 40},
            headers={**auth(couple["manager_token"]), **if_match(current.headers["etag"])},
        )
        assert created.status_code == 200

        blocked = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/configuration",
            json={"dailyContextTimezone": "America/New_York"},
            headers={**auth(couple["manager_token"]), "If-Match": f'"{configuration.version}"'},
        )
        assert blocked.status_code == 409
        assert blocked.json()["code"] == "SPACE_DAILY_CONTEXT_TIMEZONE_ACTIVE_CHECK_IN"

        row = session.execute(
            select(DailyCheckIn).where(DailyCheckIn.space_id == couple["space"].id)
        ).scalar_one()
        row.checked_on = date(2026, 9, 20)
        session.flush()

        allowed = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/configuration",
            json={"dailyContextTimezone": "America/New_York"},
            headers={**auth(couple["manager_token"]), "If-Match": f'"{configuration.version}"'},
        )
        assert allowed.status_code == 200
        assert allowed.json()["dailyContextTimezone"] == "America/New_York"


class TestPersistenceAndEnergy:
    def test_energy_mutations_share_one_row_and_final_clear_removes_it(
        self, client, session: Session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
        )
        initial = client.get(path(couple["space"].id), headers=auth(couple["manager_token"]))
        assert initial.headers["etag"] == '"absent"'
        assert initial.json()["own"] == {"version": 0, "energyLevel": None}

        created = client.patch(
            path(couple["space"].id),
            json={"energyLevel": 20},
            headers={**auth(couple["manager_token"]), **if_match(initial.headers["etag"])},
        )
        assert created.status_code == 200
        assert created.json()["own"] == {"version": 1, "energyLevel": 20}
        created_etag = created.headers["etag"]
        assert created_etag != '"absent"'

        updated = client.patch(
            path(couple["space"].id),
            json={"energyLevel": 60},
            headers={**auth(couple["manager_token"]), **if_match(created_etag)},
        )
        assert updated.status_code == 200
        assert updated.json()["own"] == {"version": 2, "energyLevel": 60}
        assert session.execute(
            select(func.count()).select_from(DailyCheckIn).where(
                DailyCheckIn.space_id == couple["space"].id,
                DailyCheckIn.account_id == couple["manager"].id,
            )
        ).scalar_one() == 1

        cleared = client.patch(
            path(couple["space"].id),
            json={"energyLevel": None},
            headers={**auth(couple["manager_token"]), **if_match(updated.headers["etag"])},
        )
        assert cleared.status_code == 200
        assert cleared.headers["etag"] == '"absent"'
        assert cleared.json()["own"] == {"version": 0, "energyLevel": None}
        assert session.execute(
            select(func.count()).select_from(DailyCheckIn).where(
                DailyCheckIn.space_id == couple["space"].id,
                DailyCheckIn.account_id == couple["manager"].id,
            )
        ).scalar_one() == 0

    @pytest.mark.parametrize("invalid", [0, 5, 15, 101])
    def test_energy_accepts_only_decided_ten_point_steps(
        self, client, session: Session, couple, invalid: int
    ) -> None:  # type: ignore[no-untyped-def]
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
        )
        response = client.patch(
            path(couple["space"].id),
            json={"energyLevel": invalid},
            headers={**auth(couple["manager_token"]), "If-Match": '"absent"'},
        )
        assert response.status_code == 422
        assert session.execute(select(func.count()).select_from(DailyCheckIn)).scalar_one() == 0

    def test_database_rejects_empty_or_invented_vibe_rows(
        self, session: Session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        day = date(2026, 9, 21)
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(
                    DailyCheckIn(
                        space_id=couple["space"].id,
                        account_id=couple["manager"].id,
                        checked_on=day,
                    )
                )
                session.flush()

        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(
                    DailyCheckIn(
                        space_id=couple["space"].id,
                        account_id=couple["manager"].id,
                        checked_on=day,
                        vibe="INVENTED_MOOD",
                    )
                )
                session.flush()

    def test_disabled_energy_hides_partner_projection_but_owner_can_clear(
        self, client, session: Session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
        )
        initial = client.get(path(couple["space"].id), headers=auth(couple["manager_token"]))
        saved = client.patch(
            path(couple["space"].id),
            json={"energyLevel": 50},
            headers={**auth(couple["manager_token"]), **if_match(initial.headers["etag"])},
        )
        assert saved.status_code == 200
        configure_daily(
            session,
            space_id=couple["space"].id,
            manager_id=couple["manager"].id,
            energy=False,
        )

        disabled = client.get(path(couple["space"].id), headers=auth(couple["manager_token"]))
        assert disabled.status_code == 200
        assert disabled.json()["energy"] is None
        assert disabled.json()["own"]["energyLevel"] == 50

        rejected = client.patch(
            path(couple["space"].id),
            json={"energyLevel": 60},
            headers={**auth(couple["manager_token"]), **if_match(disabled.headers["etag"])},
        )
        assert rejected.status_code == 403
        assert rejected.json()["code"] == "SPACE_MODULE_DISABLED"

        cleared = client.patch(
            path(couple["space"].id),
            json={"energyLevel": None},
            headers={**auth(couple["manager_token"]), **if_match(disabled.headers["etag"])},
        )
        assert cleared.status_code == 200
        assert cleared.headers["etag"] == '"absent"'


