"""Real PostgreSQL/HTTP boundaries for the Pro relationship passport (plugin code)."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.dashboard import service as dashboard_service
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.places.models import Place, PlacePayload
from eimir.plans.models import Plan, PlanPayload, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpaceProfile
from eimir.relationship_passport import service as passport_service
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


def test_passport_free_denied_before_aggregation(client, session, context, monkeypatch):  # type: ignore[no-untyped-def]
    def unexpected(*args):  # type: ignore[no-untyped-def]
        raise AssertionError("Free request must not calculate premium aggregates")

    monkeypatch.setattr(passport_service, "read_relationship_passport", unexpected)
    result = client.get(
        f"/api/v1/spaces/{context['space'].id}/relationship-passport",
        headers=auth(context["token"]),
    )
    assert result.status_code == 403
    assert result.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


@pytest.mark.parametrize(
    "capabilities,expired", [(["daily.insights"], False), (["relationship.passport"], True)]
)
def test_passport_requires_its_own_current_capability(
    client, session, context, monkeypatch, capabilities, expired
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    grant(session, context, capabilities=capabilities, expired=expired)
    result = client.get(
        f"/api/v1/spaces/{context['space'].id}/relationship-passport",
        headers=auth(context["token"]),
    )
    assert result.status_code == 403


def test_passport_is_shared_only_couple_scoped_and_respects_duration_preference(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: NOW)
    grant(session, context, capabilities=["relationship.passport"])
    session.add(
        Memory(
            **root(context), payload=MemoryPayload(title="Shared memory", body="Our shared story")
        )
    )
    session.add(
        Memory(
            **root(context, foreign=True),
            payload=MemoryPayload(title="Foreign memory", body="A different Space"),
        )
    )
    for private in (False, True):
        session.add(
            HeartMoment(
                **root(context, private=private),
                happened_on=NOW.date(),
                payload=HeartMomentPayload(text="A moment", emotion=HeartEmotion.LOVED),
            )
        )
    session.add(Place(**root(context), payload=PlacePayload(name="Our place")))
    plan(session, context, day=date(2026, 10, 28), status=PlanStatus.COMPLETED.value)
    plan(session, context, day=date(2026, 11, 10))
    session.flush()
    path = f"/api/v1/spaces/{context['space'].id}/relationship-passport"
    for token in (context["token"], context["partner_token"]):
        result = client.get(path, headers=auth(token))
        assert result.status_code == 200
        assert result.headers["Cache-Control"] == "private, no-store"
        value = result.json()
        assert value["memories"] == 1
        assert value["heartMoments"] == 1
        assert value["completedPlans"] == 1
        assert value["places"] == 1
        assert value["relationshipDuration"] is None
    foreign = client.get(
        f"/api/v1/spaces/{context['foreign'].id}/relationship-passport",
        headers=auth(context["token"]),
    )
    assert foreign.status_code == 404
    profile = session.query(SpaceProfile).filter_by(space_id=context["space"].id).one()
    profile.relationship_started_on = date(2023, 5, 14)
    profile.show_relationship_duration = True
    session.flush()
    assert (
        client.get(path, headers=auth(context["token"])).json()["relationshipDuration"][
            "daysTogether"
        ]
        == (NOW.date() - date(2023, 5, 14)).days
    )
