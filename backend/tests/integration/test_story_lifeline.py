"""Acceptance tests for the #1770 Wir story lifeline."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.dashboard import service as dashboard_service
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpaceProfile
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 10, 29, 12, tzinfo=UTC)


@pytest.fixture
def context(session: Session, monkeypatch):  # type: ignore[no-untyped-def]
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
        "outsider": outsider,
        "space": space,
        "foreign": foreign,
        "token": sign_in(session, anna),
        "partner_token": sign_in(session, ben),
    }


def grant(session, context):  # type: ignore[no-untyped-def]
    return entitlements.record_grant(
        session,
        space_id=context["space"].id,
        account_id=context["anna"].id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=NOW - timedelta(days=10),
        effective_until=NOW + timedelta(days=30),
        capabilities=["relationship.passport"],
    )


def shared(context, *, foreign=False, private=False):  # type: ignore[no-untyped-def]
    return {
        "space_id": (context["foreign"] if foreign else context["space"]).id,
        "owner_id": (context["outsider"] if foreign else context["anna"]).id,
        "privacy_class": PrivacyClass.OWNER_ONLY.value
        if private
        else PrivacyClass.SPACE_SHARED.value,
    }


def lifeline(client, context, *, token=None, space=None):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{(space or context['space']).id}/story-lifeline",
        headers=auth(token or context["token"]),
    )


def test_lifeline_requires_the_passport_capability_before_reading(
    client, session, context, monkeypatch
):  # type: ignore[no-untyped-def]
    def unexpected(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("A Free request must not read the lifeline")

    monkeypatch.setattr(dashboard_service, "read_story_lifeline", unexpected)
    result = lifeline(client, context)
    assert result.status_code == 403
    assert result.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_lifeline_buckets_only_shared_past_entries_by_week_for_both_partners(
    client, session, context
):  # type: ignore[no-untyped-def]
    grant(session, context)
    older_memory = Memory(
        **shared(context),
        happened_on=date(2026, 10, 5),
        payload=MemoryPayload(title="Monday walk", body=""),
    )
    latest_memory = Memory(
        **shared(context),
        happened_on=date(2026, 10, 7),
        payload=MemoryPayload(title="Picnic at the lake", body=""),
    )
    later_heart = HeartMoment(
        **shared(context),
        happened_on=date(2026, 10, 8),
        payload=HeartMomentPayload(text="A shared feeling", emotion=HeartEmotion.LOVED),
    )
    milestone = Milestone(
        **shared(context),
        happened_on=date(2026, 10, 20),
        payload=MilestonePayload(title="Moved in together"),
    )
    private_heart = HeartMoment(
        **shared(context, private=True),
        happened_on=date(2026, 10, 21),
        payload=HeartMomentPayload(text="Only mine", emotion=HeartEmotion.GRATEFUL),
    )
    future_memory = Memory(
        **shared(context),
        happened_on=date(2026, 11, 15),
        payload=MemoryPayload(title="Not yet", body=""),
    )
    foreign_memory = Memory(
        **shared(context, foreign=True),
        happened_on=date(2026, 10, 6),
        payload=MemoryPayload(title="Another couple", body=""),
    )
    session.add_all(
        [
            older_memory,
            latest_memory,
            later_heart,
            milestone,
            private_heart,
            future_memory,
            foreign_memory,
        ]
    )
    session.flush()

    for token in (context["token"], context["partner_token"]):
        result = lifeline(client, context, token=token)
        assert result.status_code == 200, result.text
        assert result.headers["Cache-Control"] == "private, no-store"
        value = result.json()
        assert value["today"] == "2026-10-29"
        assert value["startsOn"] is None
        assert [
            (
                week["weekStart"],
                week["memories"],
                week["heartMoments"],
                week["milestones"],
            )
            for week in value["weeks"]
        ] == [("2026-10-05", 2, 1, 0), ("2026-10-19", 0, 0, 1)]
        # A week prefers its latest Memory, even over a later HeartMoment.
        first, second = value["weeks"]
        assert first["highlight"]["id"] == str(latest_memory.id)
        assert first["highlight"]["type"] == "MEMORY"
        assert first["highlight"]["titleOrText"] == "Picnic at the lake"
        assert first["highlight"]["previewAttachmentId"] is None
        assert second["highlight"] == {
            **second["highlight"],
            "id": str(milestone.id),
            "type": "MILESTONE",
            "titleOrText": "Moved in together",
        }
        serialized = result.text
        assert "Only mine" not in serialized
        assert "Another couple" not in serialized
        assert "Not yet" not in serialized

    assert lifeline(client, context, space=context["foreign"]).status_code == 404


def test_lifeline_starts_at_the_shown_relationship_start(client, session, context):  # type: ignore[no-untyped-def]
    grant(session, context)
    session.add(
        Memory(
            **shared(context),
            happened_on=date(2026, 9, 1),
            payload=MemoryPayload(title="Early", body=""),
        )
    )
    profile = session.query(SpaceProfile).filter_by(space_id=context["space"].id).one()
    profile.relationship_started_on = date(2026, 5, 13)
    profile.show_relationship_duration = False
    session.flush()
    # A hidden relationship duration is never disclosed through the lifeline.
    assert lifeline(client, context).json()["startsOn"] is None

    profile.show_relationship_duration = True
    session.flush()
    value = lifeline(client, context).json()
    assert value["startsOn"] == "2026-05-13"
    assert [week["weekStart"] for week in value["weeks"]] == ["2026-08-31"]


def test_lifeline_is_empty_without_shared_entries(client, session, context):  # type: ignore[no-untyped-def]
    grant(session, context)
    session.add(
        HeartMoment(
            **shared(context, private=True),
            happened_on=date(2026, 10, 1),
            payload=HeartMomentPayload(text="Private", emotion=HeartEmotion.LOVED),
        )
    )
    session.flush()
    result = lifeline(client, context)
    assert result.status_code == 200
    assert result.json()["weeks"] == []
