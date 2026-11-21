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


def plan(session, context, *, day=None, start=None, special=True, status="PLANNED", foreign=False):  # type: ignore[no-untyped-def]
    item = Plan(
        **root(context, foreign=foreign),
        payload=PlanPayload(title="A deliberate special event"),
        status=status,
        planned_on=day,
        planned_start=start,
        anticipation_enabled=special,
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


def test_countdown_selects_special_plan_beyond_ordinary_agenda_limit(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    for offset in range(1, 10):
        plan(session, context, day=NOW.date() + timedelta(days=offset), special=False)
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


@pytest.mark.parametrize(
    "status,day,special",
    [
        ("PLANNED", date(2026, 10, 28), True),
        ("PLANNED", date(2026, 10, 30), False),
        ("COMPLETED", date(2026, 10, 30), True),
        ("IDEA", None, True),
    ],
)
def test_countdown_ignores_ineligible_plans(
    client, session, context, monkeypatch, status, day, special
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    plan(session, context, day=day, status=status, special=special)
    assert dashboard(client, context).json()["anticipation"] is None


@pytest.mark.parametrize(
    "instant,expected",
    [
        (datetime(2026, 10, 28, 23, 30, tzinfo=UTC), 0),
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


def test_highlight_uses_existing_plan_version_and_clears_without_pro(client, session, context):  # type: ignore[no-untyped-def]
    item = plan(session, context, day=date(2099, 1, 1), special=False)
    path = f"/api/v1/spaces/{context['space'].id}/plans/{item.id}"
    version = item.version
    response = client.patch(
        path,
        json={"anticipationEnabled": True},
        headers={**auth(context["token"]), "If-Match": str(version)},
    )
    assert response.status_code == 200
    assert response.json()["anticipationEnabled"] is True
    stale = client.patch(
        path,
        json={"anticipationEnabled": False},
        headers={**auth(context["token"]), "If-Match": str(version)},
    )
    assert stale.status_code == 409
    cleared = client.patch(
        path,
        json={"anticipationEnabled": False},
        headers={**auth(context["partner_token"]), "If-Match": str(response.json()["version"])},
    )
    assert cleared.status_code == 200
    assert cleared.json()["anticipationEnabled"] is False
