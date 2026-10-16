"""Acceptance tests for #809 shared Story totals on the Dashboard."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.dashboard import service as dashboard_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


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
    }


def _get_dashboard(client, *, space_id, token):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{space_id}/dashboard",
        headers=auth(token),
    )


def test_shared_story_summary_is_identical_for_partners_and_excludes_private_and_foreign(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    memories = [
        Memory(
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=date(2026, 1, day),
            payload=MemoryPayload(title=f"Memory {day}", body=""),
        )
        for day in (1, 2)
    ]
    shared_heart = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 2, 1),
        payload=HeartMomentPayload(text="Shared", emotion=HeartEmotion.LOVED),
    )
    private_heart = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=date(2026, 2, 2),
        payload=HeartMomentPayload(text="Private", emotion=HeartEmotion.GRATEFUL),
    )
    milestone = Milestone(
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 3, 1),
        payload=MilestonePayload(title="Milestone"),
    )
    foreign_memory = Memory(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 4, 1),
        payload=MemoryPayload(title="Foreign", body=""),
    )
    session.add_all([*memories, shared_heart, private_heart, milestone, foreign_memory])
    session.flush()

    expected = {"memories": 2, "heartMoments": 1, "milestones": 1}
    anna = _get_dashboard(client, space_id=couple["space"].id, token=couple["token_a"])
    ben = _get_dashboard(client, space_id=couple["space"].id, token=couple["token_b"])

    assert anna.status_code == 200, anna.text
    assert ben.status_code == 200, ben.text
    assert anna.json()["sharedStorySummary"] == expected
    assert ben.json()["sharedStorySummary"] == expected

    shared_heart.privacy_class = PrivacyClass.OWNER_ONLY.value
    session.flush()
    after_private = _get_dashboard(
        client,
        space_id=couple["space"].id,
        token=couple["token_a"],
    )
    assert after_private.status_code == 200
    assert after_private.json()["sharedStorySummary"]["heartMoments"] == 0

    shared_heart.privacy_class = PrivacyClass.SPACE_SHARED.value
    session.delete(memories[0])
    session.flush()
    after_delete = _get_dashboard(client, space_id=couple["space"].id, token=couple["token_b"])
    assert after_delete.status_code == 200
    assert after_delete.json()["sharedStorySummary"] == {
        "memories": 1,
        "heartMoments": 1,
        "milestones": 1,
    }


def test_shared_story_summary_is_not_bounded_by_dashboard_section_limit(
    client,
    session: Session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    total = dashboard_service.SECTION_LIMIT + 5
    for index in range(total):
        session.add(
            Memory(
                space_id=couple["space"].id,
                owner_id=couple["anna"].id,
                privacy_class=PrivacyClass.SPACE_SHARED.value,
                happened_on=date(2026, 5, 1),
                payload=MemoryPayload(title=f"Memory {index}", body=""),
            )
        )
    session.flush()

    response = _get_dashboard(client, space_id=couple["space"].id, token=couple["token_a"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sharedStorySummary"] == {
        "memories": total,
        "heartMoments": 0,
        "milestones": 0,
    }
    assert len(body["recentShared"]) <= dashboard_service.SECTION_LIMIT
