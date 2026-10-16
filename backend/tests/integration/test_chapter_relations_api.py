"""HTTP acceptance coverage for typed M3 Chapter relation routes."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.chapters import service as chapter_service
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion
from eimir.memories import service as memory_service
from eimir.milestones import service as milestone_service
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def world(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    anna_context = AuthorizationContext(anna.id, space.id)
    ben_context = AuthorizationContext(ben.id, space.id)
    chapter = chapter_service.create_chapter(
        session,
        anna_context,
        title="Our chapter",
        description=None,
        start_on=None,
        end_on=None,
        place_id=None,
    )
    memory = memory_service.create_memory(
        session,
        anna_context,
        title="Memory",
        body="",
        happened_on=None,
    )
    memory.created_at = datetime(2026, 1, 15, 12, tzinfo=UTC)
    heart = heart_moment_service.create_heart_moment(
        session,
        anna_context,
        text="Heart",
        emotion=HeartEmotion.LOVED,
        visibility=ContentVisibility.SHARED,
        happened_on=date(2026, 2, 1),
    )
    milestone = milestone_service.create_milestone(
        session,
        anna_context,
        title="Milestone",
        body=None,
        happened_on=date(2026, 3, 1),
    )
    private_heart = heart_moment_service.create_heart_moment(
        session,
        anna_context,
        text="Private",
        emotion=HeartEmotion.SEEN,
        visibility=ContentVisibility.PRIVATE,
        happened_on=date(2026, 4, 1),
    )
    session.flush()
    return {
        "anna_context": anna_context,
        "ben_context": ben_context,
        "space": space,
        "chapter": chapter,
        "memory": memory,
        "heart": heart,
        "milestone": milestone,
        "private_heart": private_heart,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def base(world) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{world['space'].id}/chapters/{world['chapter'].id}"


def test_typed_relation_routes_are_idempotent_and_preserve_targets(
    client,
    session,
    world,
) -> None:  # type: ignore[no-untyped-def]
    headers = auth(world["token_a"])
    relations = [
        ("memories", world["memory"]),
        ("heart-moments", world["heart"]),
        ("milestones", world["milestone"]),
    ]

    for slug, target in relations:
        url = f"{base(world)}/{slug}/{target.id}"
        assert client.put(url, headers=headers).status_code == 204
        assert client.put(url, headers=auth(world["token_b"])).status_code == 204
        listed = client.get(f"{base(world)}/{slug}", headers=headers)
        assert listed.status_code == 200
        assert listed.json() == {"items": [str(target.id)]}

    removed = client.delete(
        f"{base(world)}/memories/{world['memory'].id}",
        headers=auth(world["token_b"]),
    )
    assert removed.status_code == 204
    assert (
        memory_service.get_memory(
            session,
            world["ben_context"],
            world["memory"].id,
        ).id
        == world["memory"].id
    )


def test_private_heart_moment_relation_fails_closed(client, world) -> None:  # type: ignore[no-untyped-def]
    response = client.put(
        f"{base(world)}/heart-moments/{world['private_heart'].id}",
        headers=auth(world["token_a"]),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"


def test_combined_content_endpoint_uses_derived_cross_type_order(client, world) -> None:  # type: ignore[no-untyped-def]
    for slug, target in (
        ("milestones", world["milestone"]),
        ("memories", world["memory"]),
        ("heart-moments", world["heart"]),
    ):
        assert (
            client.put(
                f"{base(world)}/{slug}/{target.id}",
                headers=auth(world["token_a"]),
            ).status_code
            == 204
        )

    response = client.get(
        f"{base(world)}/content",
        headers=auth(world["token_b"]),
    )
    assert response.status_code == 200
    assert response.json()["items"] == [
        {"targetType": "MEMORY", "targetId": str(world["memory"].id)},
        {"targetType": "HEART_MOMENT", "targetId": str(world["heart"].id)},
        {"targetType": "MILESTONE", "targetId": str(world["milestone"].id)},
    ]
