"""Real PostgreSQL races for Comment creation against parent withdrawal."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import sleep
from uuid import UUID

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.comments import service as comment_service
from eimir.comments.models import Comment, CommentTarget
from eimir.core.errors import NotFoundError
from eimir.heart_moments.models import HeartMoment
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def _setup(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        token_a = sign_in(session, anna)
        space_id = space.id
        anna_id = anna.id
        ben_id = ben.id

    response = client.post(
        f"/api/v1/spaces/{space_id}/heart-moments",
        json={
            "text": "Race Parent",
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": "2025-06-13",
        },
        headers=auth(token_a),
    )
    assert response.status_code == 201
    return maker, space_id, anna_id, ben_id, UUID(response.json()["id"])


def _attempt_comment(
    maker,
    context: AuthorizationContext,
    parent_id: UUID,
    started: Event,
):  # type: ignore[no-untyped-def]
    started.set()
    try:
        with maker.begin() as session:
            comment_service.create_comment(
                session,
                context,
                target_type=CommentTarget.HEART_MOMENT,
                target_id=parent_id,
                body="darf nicht ueberleben",
            )
    except NotFoundError as error:
        return error.code
    return "CREATED"


@pytest.mark.parametrize("withdrawal", ["PRIVATE", "DELETE"])
def test_comment_create_against_parent_withdrawal_leaves_nothing(
    production_client,
    withdrawal: str,
) -> None:  # type: ignore[no-untyped-def]
    maker, space_id, _anna_id, ben_id, parent_id = _setup(production_client)
    context = AuthorizationContext(account_id=ben_id, space_id=space_id)

    blocker = maker()
    transaction = blocker.begin()
    parent = blocker.execute(
        select(HeartMoment).where(HeartMoment.id == parent_id).with_for_update()
    ).scalar_one()
    if withdrawal == "PRIVATE":
        parent.privacy_class = PrivacyClass.OWNER_ONLY.value
    else:
        blocker.delete(parent)
    blocker.flush()

    started = Event()
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_attempt_comment, maker, context, parent_id, started)
            assert started.wait(timeout=2)
            # Comment creation has started. While the exclusive parent lock is
            # held, it must not complete successfully.
            sleep(0.2)
            assert not future.done()

            transaction.commit()
            assert future.result(timeout=5) == "COMMENT_TARGET_NOT_AVAILABLE"
    finally:
        if transaction.is_active:
            transaction.rollback()
        blocker.close()

    with maker() as verify:
        comments = list(
            verify.execute(
                select(Comment).where(
                    Comment.space_id == space_id,
                    Comment.target_type == CommentTarget.HEART_MOMENT.value,
                    Comment.target_id == parent_id,
                )
            ).scalars()
        )
        assert comments == []
