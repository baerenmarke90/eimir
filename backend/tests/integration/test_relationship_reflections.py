"""Real PostgreSQL/HTTP boundaries for special Plans on the Dashboard (Free/Core).

The Pro relationship passport is plugin code; its tests live in
``test_relationship_passport.py``.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.dashboard import service as dashboard_service
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.plans.models import Plan, PlanPayload
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 10, 29, 12, tzinfo=UTC)


@pytest.fixture
def context(session: Session, monkeypatch):  # type: ignore[no-untyped-def]
    # Issue and validate real sessions against the same authoritative instant.
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outside")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "foreign": foreign,
        "token": sign_in(session, anna),
        "partner_token": sign_in(session, ben),
    }


def root(context, *, private=False, foreign=False):  # type: ignore[no-untyped-def]
    return {
        "space_id": (context["foreign"] if foreign else context["space"]).id,
        "owner_id": context["anna"].id,
        "privacy_class": PrivacyClass.OWNER_ONLY.value
        if private
        else PrivacyClass.SPACE_SHARED.value,
    }


def plan(  # type: ignore[no-untyped-def]
    session,
    context,
    *,
    day=None,
    start=None,
    end=None,
    anticipation="ALWAYS",
    status="PLANNED",
    foreign=False,
    discreet=False,
    title="A deliberate special event",
):
    item = Plan(
        **root(context, foreign=foreign),
        payload=PlanPayload(title=title),
        status=status,
        planned_on=day,
        planned_start=start,
        planned_end=end,
        anticipation=anticipation,
        discreet=discreet,
        experienced_on=date(2026, 10, 28) if status == "COMPLETED" else None,
    )
    session.add(item)
    session.flush()
    return item


def dashboard(client, context):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{context['space'].id}/dashboard", headers=auth(context["token"])
    )


def grant(session, context, *, capabilities=None, expired=False):  # type: ignore[no-untyped-def]
    return entitlements.record_grant(
        session,
        space_id=context["space"].id,
        account_id=context["anna"].id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=NOW - timedelta(days=10),
        effective_until=NOW - timedelta(days=1) if expired else NOW + timedelta(days=30),
        capabilities=capabilities,
    )


def test_countdown_prefers_pinned_plan_beyond_ordinary_agenda_limit(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    # Earlier automatic Plans never outrank a pinned one (#2158 D).
    for offset in range(1, 10):
        plan(session, context, day=NOW.date() + timedelta(days=offset), anticipation="AUTOMATIC")
    selected = plan(session, context, day=date(2026, 11, 10))
    plan(session, context, day=date(2026, 10, 30), foreign=True)
    result = dashboard(client, context)
    assert result.status_code == 200
    view = result.json()
    assert len(view["upcoming"]) == 8
    assert view["anticipation"] == {
        "planId": str(selected.id),
        "title": selected.payload.title,
        "eventOn": "2026-11-10",
        "daysRemaining": 12,
        "eventAt": None,
        "concealed": False,
    }


@pytest.mark.parametrize("anticipation", ["ALWAYS", "AUTOMATIC"])
@pytest.mark.parametrize(
    "status,day",
    [
        ("PLANNED", date(2026, 10, 28)),
        ("COMPLETED", date(2026, 10, 30)),
        ("IDEA", None),
    ],
)
def test_countdown_ignores_ineligible_plans(
    client, session, context, monkeypatch, status, day, anticipation
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    plan(session, context, day=day, status=status, anticipation=anticipation)
    assert dashboard(client, context).json()["anticipation"] is None


def test_countdown_shows_the_next_automatic_plan_when_none_is_pinned(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    plan(session, context, day=date(2026, 10, 30), anticipation="NEVER", title="Kept off Wir")
    plan(session, context, day=date(2026, 10, 30), discreet=True, anticipation="AUTOMATIC")
    plan(session, context, day=date(2026, 10, 31), foreign=True, anticipation="AUTOMATIC")
    later = plan(session, context, day=date(2026, 11, 5), anticipation="AUTOMATIC")
    soonest = plan(
        session, context, start=datetime(2026, 11, 1, 18, tzinfo=UTC), anticipation="AUTOMATIC"
    )
    view = dashboard(client, context).json()["anticipation"]
    assert view["planId"] == str(soonest.id)
    assert view["daysRemaining"] == 3
    assert view["concealed"] is False

    soonest.anticipation = "NEVER"
    session.flush()
    assert dashboard(client, context).json()["anticipation"]["planId"] == str(later.id)


def test_a_started_timed_plan_counts_down_until_it_ends(client, session, context, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    # Started an hour ago without an end: no longer upcoming, even on its day.
    plan(session, context, start=NOW - timedelta(hours=1), anticipation="ALWAYS")
    running = plan(
        session,
        context,
        start=NOW - timedelta(hours=2),
        end=NOW + timedelta(hours=1),
        anticipation="AUTOMATIC",
    )
    assert dashboard(client, context).json()["anticipation"]["planId"] == str(running.id)
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW + timedelta(hours=2))
    assert dashboard(client, context).json()["anticipation"] is None


@pytest.mark.parametrize(
    "instant,expected",
    [
        (datetime(2026, 10, 29, 22, 30, tzinfo=UTC), 0),
        (datetime(2026, 10, 29, 23, 30, tzinfo=UTC), 1),
    ],
)
def test_countdown_uses_authoritative_viewer_calendar_day(
    client, session, context, monkeypatch, instant, expected
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    context["anna"].timezone = "Europe/Berlin"
    plan(session, context, start=instant)
    value = dashboard(client, context).json()["anticipation"]
    assert datetime.fromisoformat(value["eventAt"]) == instant
    assert value["daysRemaining"] == expected
    assert value["eventOn"] == (NOW.date() + timedelta(days=expected)).isoformat()


def test_preference_uses_existing_plan_version_and_clears_without_pro(client, session, context):  # type: ignore[no-untyped-def]
    item = plan(session, context, day=date(2099, 1, 1), anticipation="AUTOMATIC")
    path = f"/api/v1/spaces/{context['space'].id}/plans/{item.id}"
    version = item.version
    response = client.patch(
        path,
        json={"anticipation": "ALWAYS"},
        headers={**auth(context["token"]), "If-Match": str(version)},
    )
    assert response.status_code == 200
    assert response.json()["anticipation"] == "ALWAYS"
    assert response.json()["anticipationEnabled"] is True
    stale = client.patch(
        path,
        json={"anticipation": "NEVER"},
        headers={**auth(context["token"]), "If-Match": str(version)},
    )
    assert stale.status_code == 409
    hidden = client.patch(
        path,
        json={"anticipation": "NEVER"},
        headers={**auth(context["partner_token"]), "If-Match": str(response.json()["version"])},
    )
    assert hidden.status_code == 200
    assert hidden.json()["anticipation"] == "NEVER"
    assert hidden.json()["anticipationEnabled"] is False


@pytest.mark.parametrize("flag,expected", [(True, "ALWAYS"), (False, "AUTOMATIC")])
def test_deprecated_flag_from_older_clients_maps_onto_the_preference(
    client, session, context, flag, expected
):  # type: ignore[no-untyped-def]
    item = plan(session, context, day=date(2099, 1, 1), anticipation="NEVER")
    response = client.patch(
        f"/api/v1/spaces/{context['space'].id}/plans/{item.id}",
        json={"anticipationEnabled": flag},
        headers={**auth(context["token"]), "If-Match": str(item.version)},
    )
    assert response.status_code == 200, response.text
    assert response.json()["anticipation"] == expected
    assert response.json()["anticipationEnabled"] is flag


@pytest.mark.parametrize(
    "body",
    [
        {"anticipation": None},
        {"anticipation": "SOMETIMES"},
        {"anticipationEnabled": None},
        {"anticipation": "ALWAYS", "anticipationEnabled": True},
    ],
)
def test_invalid_preference_writes_are_rejected(client, session, context, body):  # type: ignore[no-untyped-def]
    item = plan(session, context, day=date(2099, 1, 1), anticipation="AUTOMATIC")
    response = client.patch(
        f"/api/v1/spaces/{context['space'].id}/plans/{item.id}",
        json=body,
        headers={**auth(context["token"]), "If-Match": str(item.version)},
    )
    assert response.status_code == 422
