"""Integration tests for the Pro Vibe/Energy insights boundary (#1151).

Verifies:
- Free Space without Pro capability receives 403 PREMIUM_ENTITLEMENT_REQUIRED on insights.
- Free Space can still perform daily check-in (Free daily couple ritual is functional).
- Pro Space with `daily.insights` receives longitudinal series and summary.
- Privacy & Mutual Reveal: under MUTUAL_REVEAL, partner check-in is HIDDEN on days where
  the caller did not submit their own check-in.
- Cross-Space isolation: data from other spaces is never included.
- Downgrade semantics: revoking or expiring Pro does not delete raw check-in rows, Free
  daily check-in remains functional, while insights endpoint returns 403.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.daily_checkins.models import DailyCheckIn, DailyVibe
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship import configuration as configuration_service
from eimir.relationship import service as relationship_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    Membership,
    SpaceConfiguration,
)
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


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


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")

    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()

    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def _grant_insights(session: Session, space_id: UUID, account_id: UUID) -> None:
    entitlement_service.record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.DAILY_INSIGHTS.value],
    )
    session.flush()


def test_free_space_insights_rejected_but_today_check_in_allowed(
    client, session: Session, couple
) -> None:
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
    )

    # 1. Pro insights endpoint returns 403 Forbidden with PREMIUM_ENTITLEMENT_REQUIRED
    insights_response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        headers=auth(couple["token_a"]),
    )
    assert insights_response.status_code == 403
    assert insights_response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert "daily.insights" in insights_response.json()["detail"]

    # 2. Free today check-in read is 200 OK
    today_response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/today",
        headers=auth(couple["token_a"]),
    )
    assert today_response.status_code == 200
    assert today_response.json()["own"]["vibe"] is None

    # 3. Free today check-in write is 200 OK
    etag = today_response.headers["ETag"]
    patch_response = client.patch(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/today",
        headers={**auth(couple["token_a"]), "If-Match": etag},
        json={"vibe": "GOOD", "energy_level": 80},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["own"]["vibe"] == "GOOD"
    assert patch_response.json()["own"]["energyLevel"] == 80


def test_pro_space_returns_longitudinal_insights(client, session: Session, couple) -> None:
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
    )
    _grant_insights(session, couple["space"].id, couple["anna"].id)

    # Seed past check-in entries
    today = date(2026, 9, 21)
    yesterday = today - timedelta(days=1)

    session.add(
        DailyCheckIn(
            space_id=couple["space"].id,
            account_id=couple["anna"].id,
            checked_on=yesterday,
            vibe=DailyVibe.GOOD.value,
            energy_level=70,
            version=1,
        )
    )
    session.add(
        DailyCheckIn(
            space_id=couple["space"].id,
            account_id=couple["ben"].id,
            checked_on=yesterday,
            vibe=DailyVibe.OKAY.value,
            energy_level=60,
            version=1,
        )
    )
    session.flush()

    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        params={"start_date": yesterday.isoformat(), "end_date": today.isoformat()},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["vibeEnabled"] is True
    assert data["energyEnabled"] is True
    assert len(data["days"]) == 2

    yesterday_entry = next(d for d in data["days"] if d["checkedOn"] == yesterday.isoformat())
    assert yesterday_entry["ownVibe"] == "GOOD"
    assert yesterday_entry["ownEnergy"] == 70
    assert yesterday_entry["partnerVibe"]["state"] == "VISIBLE"
    assert yesterday_entry["partnerVibe"]["value"] == "OKAY"
    assert yesterday_entry["partnerEnergy"]["state"] == "VISIBLE"
    assert yesterday_entry["partnerEnergy"]["value"] == 60

    assert data["summary"]["daysWithMutualCheckIn"] == 1


def test_pro_insights_respects_mutual_reveal_privacy(client, session: Session, couple) -> None:
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
        vibe_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL,
        energy_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL,
    )
    _grant_insights(session, couple["space"].id, couple["anna"].id)

    partner_day = date(2026, 9, 20)
    empty_day = partner_day - timedelta(days=1)

    # Ben checked in on one day but not the adjacent day. Anna skipped both days.
    session.add(
        DailyCheckIn(
            space_id=couple["space"].id,
            account_id=couple["ben"].id,
            checked_on=partner_day,
            vibe=DailyVibe.STRESSED.value,
            energy_level=30,
            version=1,
        )
    )
    session.flush()

    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        params={"start_date": empty_day.isoformat(), "end_date": partner_day.isoformat()},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 200
    data = response.json()
    days = {entry["checkedOn"]: entry for entry in data["days"]}
    skipped_without_partner = days[empty_day.isoformat()]
    skipped_with_partner = days[partner_day.isoformat()]

    # Mutual Reveal must not disclose whether Ben participated while Anna skipped.
    for day_entry in (skipped_without_partner, skipped_with_partner):
        assert day_entry["ownVibe"] is None
        assert day_entry["ownEnergy"] is None
        assert day_entry["partnerVibe"] == {"state": "HIDDEN_UNTIL_SELF_CHECK_IN"}
        assert day_entry["partnerEnergy"] == {"state": "HIDDEN_UNTIL_SELF_CHECK_IN"}

    assert skipped_without_partner["partnerVibe"] == skipped_with_partner["partnerVibe"]
    assert skipped_without_partner["partnerEnergy"] == skipped_with_partner["partnerEnergy"]

    # Summary counters must not leak partner participation either.
    assert data["summary"]["daysWithOwnCheckIn"] == 0
    assert data["summary"]["daysWithPartnerCheckIn"] == 0
    assert data["summary"]["daysWithMutualCheckIn"] == 0

    # Once Anna checks in for vibe on the partner day, only that dimension reveals.
    session.add(
        DailyCheckIn(
            space_id=couple["space"].id,
            account_id=couple["anna"].id,
            checked_on=partner_day,
            vibe=DailyVibe.GOOD.value,
            energy_level=None,
            version=1,
        )
    )
    session.flush()

    revealed_res = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        params={"start_date": empty_day.isoformat(), "end_date": partner_day.isoformat()},
        headers=auth(couple["token_a"]),
    )
    assert revealed_res.status_code == 200
    revealed_data = revealed_res.json()
    revealed_days = {entry["checkedOn"]: entry for entry in revealed_data["days"]}
    revealed_entry = revealed_days[partner_day.isoformat()]
    still_skipped_entry = revealed_days[empty_day.isoformat()]

    assert revealed_entry["ownVibe"] == "GOOD"
    assert revealed_entry["partnerVibe"]["state"] == "VISIBLE"
    assert revealed_entry["partnerVibe"]["value"] == "STRESSED"
    assert revealed_entry["partnerEnergy"] == {"state": "HIDDEN_UNTIL_SELF_CHECK_IN"}

    # The adjacent skipped day remains privacy-indistinguishable.
    assert still_skipped_entry["partnerVibe"] == {"state": "HIDDEN_UNTIL_SELF_CHECK_IN"}
    assert still_skipped_entry["partnerEnergy"] == {"state": "HIDDEN_UNTIL_SELF_CHECK_IN"}

    assert revealed_data["summary"]["daysWithOwnCheckIn"] == 1
    assert revealed_data["summary"]["daysWithPartnerCheckIn"] == 1
    assert revealed_data["summary"]["daysWithMutualCheckIn"] == 1


def test_cross_space_check_ins_are_strictly_isolated(client, session: Session, couple) -> None:
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
    )
    _grant_insights(session, couple["space"].id, couple["anna"].id)

    day = date(2026, 9, 20)
    # Outsider in foreign space checked in
    session.add(
        DailyCheckIn(
            space_id=couple["foreign_space"].id,
            account_id=couple["outsider"].id,
            checked_on=day,
            vibe=DailyVibe.GOOD.value,
            energy_level=90,
            version=1,
        )
    )
    session.flush()

    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        params={"start_date": day.isoformat(), "end_date": day.isoformat()},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 200
    data = response.json()
    day_entry = data["days"][0]
    # Foreign space check-in is not present
    assert day_entry["ownVibe"] is None
    assert day_entry["partnerVibe"]["state"] == "NO_CHECK_IN"


def test_downgrade_preserves_raw_data_and_free_today(client, session: Session, couple) -> None:
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
    )

    day = date(2026, 9, 20)
    checkin_row = DailyCheckIn(
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        checked_on=day,
        vibe=DailyVibe.GOOD.value,
        energy_level=80,
        version=1,
    )
    session.add(checkin_row)

    # 1. Grant active
    grant = entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.DAILY_INSIGHTS.value],
    )
    session.flush()

    assert (
        client.get(
            f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
            headers=auth(couple["token_a"]),
        ).status_code
        == 200
    )

    # 2. Downgrade: revoke grant
    grant.status = EntitlementStatus.REVOKED.value
    session.flush()

    # Pro insights is now blocked with 403
    downgraded_response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/insights",
        headers=auth(couple["token_a"]),
    )
    assert downgraded_response.status_code == 403
    assert downgraded_response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"

    # Non-destructive guarantee: raw DB record still exists!
    persisted = session.execute(
        select(DailyCheckIn).where(
            DailyCheckIn.space_id == couple["space"].id,
            DailyCheckIn.account_id == couple["anna"].id,
            DailyCheckIn.checked_on == day,
        )
    ).scalar_one_or_none()
    assert persisted is not None
    assert persisted.vibe == "GOOD"
    assert persisted.energy_level == 80

    # Free daily ritual still works!
    today_res = client.get(
        f"/api/v1/spaces/{couple['space'].id}/daily-check-in/today",
        headers=auth(couple["token_a"]),
    )
    assert today_res.status_code == 200
