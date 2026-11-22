"""Weekly brief (#2169): authorization, mutual visibility and rule-backed composition."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from eimir.authorization import AuthorizationContext
from eimir.daily_checkins import context
from eimir.daily_checkins.models import DailyCheckIn
from eimir.memories import service as memories
from eimir.plans import service as plans
from eimir.relationship.models import DailyCheckInVisibilityMode
from eimir.wishes import service as wishes
from tests.conftest import auth, requires_database
from tests.integration.test_daily_checkins_pro_insights import (
    _grant_insights,
    configure_daily,
)
from tests.integration.test_daily_checkins_pro_insights import (
    couple as couple,
)

pytestmark = [pytest.mark.integration, requires_database]

TODAY = date(2026, 10, 31)  # Saturday
WEEK = date(2026, 10, 26)


@pytest.fixture(autouse=True)
def space_day(monkeypatch):
    monkeypatch.setattr(context, "now", lambda: datetime(2026, 10, 31, 12, tzinfo=UTC))


def setup(session, couple, *, pro=True, mutual=False):
    mode = (
        DailyCheckInVisibilityMode.MUTUAL_REVEAL if mutual else DailyCheckInVisibilityMode.IMMEDIATE
    )
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
        vibe_mode=mode,
        energy_mode=mode,
    )
    if pro:
        _grant_insights(session, couple["space"].id, couple["anna"].id)
    return f"/api/v1/spaces/{couple['space'].id}/daily-check-in/weekly-brief"


def check_in(session, couple, person, day, vibe=None, energy=None):
    session.add(
        DailyCheckIn(
            space_id=couple["space"].id,
            account_id=couple[person].id,
            checked_on=day,
            vibe=vibe,
            energy_level=energy,
        )
    )


def brief(client, base, token, week=WEEK):
    response = client.get(f"{base}?week_start={week.isoformat()}", headers=auth(token))
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "private, no-store"
    return response.json()


def ctx(couple, person):
    return AuthorizationContext(account_id=couple[person].id, space_id=couple["space"].id)


def test_free_space_is_gated_and_foreign_space_is_absent(client, session, couple):
    base = setup(session, couple, pro=False)
    response = client.get(f"{base}?week_start={WEEK}", headers=auth(couple["token_a"]))
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    _grant_insights(session, couple["space"].id, couple["anna"].id)
    outsider = client.get(f"{base}?week_start={WEEK}", headers=auth(couple["token_outsider"]))
    assert outsider.status_code == 404


def test_week_start_must_be_an_elapsed_monday(client, session, couple):
    base = setup(session, couple)
    for week in ("2026-10-27", "2026-11-02"):
        response = client.get(f"{base}?week_start={week}", headers=auth(couple["token_a"]))
        assert response.status_code == 422, week


def test_brief_composes_good_days_shared_content_attention_wishes_and_follow_up(
    client, session, couple
):
    base = setup(session, couple)
    days = [WEEK + timedelta(days=offset) for offset in range(6)]
    check_in(session, couple, "anna", days[0], "GOOD", 70)
    check_in(session, couple, "ben", days[0], "VERY_GOOD", 80)
    check_in(session, couple, "anna", days[1], "GOOD", 60)
    check_in(session, couple, "ben", days[1], "GOOD", 70)
    for day in days[2:4]:
        check_in(session, couple, "anna", day, "NEEDS_CONNECTION", 50)
        check_in(session, couple, "ben", day, "NEEDS_SPACE", 40)
    check_in(session, couple, "anna", days[4], "OKAY", 50)
    check_in(session, couple, "ben", days[4], "OKAY", 50)
    anna, ben = ctx(couple, "anna"), ctx(couple, "ben")
    plans.create_plan(
        session, anna, title="Kino", description=None, place_id=None, planned_on=days[0]
    )
    berlin = ZoneInfo("Europe/Berlin")
    plans.create_plan(
        session,
        ben,
        title="Spät essen",
        description=None,
        place_id=None,
        planned_start=datetime(2026, 10, 27, 23, 30, tzinfo=berlin),
    )
    plans.create_plan(
        session,
        anna,
        title="Last week",
        description=None,
        place_id=None,
        planned_on=date(2026, 10, 23),
    )
    plans.create_plan(
        session,
        anna,
        title="Long ago",
        description=None,
        place_id=None,
        planned_on=date(2026, 10, 12),
    )
    memory = memories.create_memory(
        session, ben, title="Spaziergang", body="Rhein", happened_on=days[1]
    )
    memories.create_memory(session, anna, title="Alltag", body="x", happened_on=days[4])
    older = wishes.create_wish(session, ben, title="Fondue-Abend")
    wishes.create_wish(session, anna, title="Museum")
    session.flush()

    result = brief(client, base, couple["token_a"])
    assert result["elapsedDays"] == 6
    assert result["jointDays"] == 5
    assert result["headline"] == "SHARED_GOOD_DAYS"
    assert result["goodDays"] == ["2026-10-26", "2026-10-27"]
    assert result["sharedDays"] == ["2026-10-26", "2026-10-27", "2026-10-30"]
    assert result["highlight"]["memoryId"] == str(memory.id)
    assert result["highlight"]["photoCount"] == 0
    assert result["attention"] == "OWN_CLOSENESS"
    assert result["attentionDays"] == 2
    assert [w["title"] for w in result["wishes"]] == ["Fondue-Abend", "Museum"]
    assert result["wishes"][0]["wishId"] == str(older.id)
    assert [w["own"] for w in result["wishes"]] == [False, True]
    assert result["followUp"]["title"] == "Last week"
    assert result["followUp"]["plannedOn"] == "2026-10-23"
    assert result["followUp"]["concealed"] is False

    partner_view = brief(client, base, couple["token_b"])
    assert partner_view["attention"] == "PARTNER_CLOSENESS"
    assert [w["own"] for w in partner_view["wishes"]] == [True, False]


def test_hidden_partner_days_never_count(client, session, couple):
    base = setup(session, couple, mutual=True)
    for offset in range(4):
        check_in(session, couple, "ben", WEEK + timedelta(days=offset), "GOOD", 80)
    check_in(session, couple, "anna", WEEK, "GOOD", 70)
    session.flush()
    result = brief(client, base, couple["token_a"])
    assert result["jointDays"] == 1
    assert result["headline"] == "SPARSE"
    assert result["goodDays"] == ["2026-10-26"]
    assert result["newObservations"] == []
    assert result["attention"] is None

    nothing = brief(client, base, couple["token_a"], week=WEEK - timedelta(days=7))
    assert nothing["headline"] == "EMPTY"
    assert nothing["jointDays"] == 0


def test_suggested_date_follows_a_repeated_high_energy_weekday(client, session, couple):
    base = setup(session, couple)
    for weeks in range(1, 5):
        friday = date(2026, 10, 30) - timedelta(weeks=weeks - 1)
        for person in ("anna", "ben"):
            check_in(session, couple, person, friday, None, 80)
            check_in(session, couple, person, friday - timedelta(days=2), None, 40)
    session.flush()
    result = brief(client, base, couple["token_a"])
    assert result["suggestedDate"] == "2026-11-06"


def test_completed_or_running_plans_are_no_follow_up(client, session, couple):
    base = setup(session, couple)
    anna = ctx(couple, "anna")
    plans.create_plan(
        session,
        anna,
        title="Trip",
        description=None,
        place_id=None,
        planned_on=date(2026, 10, 24),
        planned_until=date(2026, 10, 27),
    )
    session.flush()
    assert brief(client, base, couple["token_a"])["followUp"] is None
