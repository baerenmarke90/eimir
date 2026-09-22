"""Shared create-receipt reconciliation (decision 0012) for the domains that
adopted `eimir.create_receipts` instead of `memories.create_receipts`: Comment,
Wish, Plan, Milestone, HeartMoment.

`test_memory_create_reconciliation.py` already proves the generic mechanics
(claim/replay/lock/purge/prune) exhaustively against Memory's own bespoke
receipt table. This file does not repeat that depth per domain; it proves
each domain's thin wrapper is wired correctly, and adds the one property
unique to sharing one table across domains: a key used for one resource type
must not collide with the same key used for another.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.comments.models import Comment
from eimir.create_receipts.models import CreateReceipt
from eimir.heart_moments.models import HeartMoment
from eimir.milestones.models import Milestone
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def base_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}"


def with_key(token: str, key: UUID | str) -> dict[str, str]:
    return {**auth(token), "Idempotency-Key": str(key)}


def _memory(client, couple):  # type: ignore[no-untyped-def]
    return client.post(
        f"{base_path(couple['space'].id)}/memories",
        json={"title": "M", "body": "B", "happenedOn": "2025-06-13"},
        headers=auth(couple["token_a"]),
    ).json()


def _receipt_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(CreateReceipt)).scalar_one()


class TestCommentReplay:
    """Comments have the highest-impact failure mode: a duplicate persisted
    comment also fires a second outbox event and a second push notification
    to the partner. This class proves that double-tap/retry cannot do that.
    """

    def _path(self, couple, memory_id: str) -> str:  # type: ignore[no-untyped-def]
        return f"{base_path(couple['space'].id)}/memories/{memory_id}/comments"

    def test_a_repeat_returns_the_original_comment_without_a_second_notification(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        key = uuid4()
        path = self._path(couple, memory["id"])

        first = client.post(path, json={"body": "Schoen!"}, headers=with_key(couple["token_a"], key))
        assert first.status_code == 201
        events_after_create = session.execute(
            select(func.count()).select_from(OutboxEvent)
        ).scalar_one()

        second = client.post(path, json={"body": "Schoen!"}, headers=with_key(couple["token_a"], key))

        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert (
            session.execute(select(func.count()).select_from(Comment)).scalar_one() == 1
        )
        # A replay writes nothing, so it cannot fire a second COMMENT_CREATED
        # event and therefore cannot deliver a second push notification.
        assert (
            session.execute(select(func.count()).select_from(OutboxEvent)).scalar_one()
            == events_after_create
        )

    def test_a_create_without_a_key_keeps_the_previous_behaviour(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        path = self._path(couple, memory["id"])
        for _ in range(2):
            response = client.post(path, json={"body": "Hi"}, headers=auth(couple["token_a"]))
            assert response.status_code == 201

        assert session.execute(select(func.count()).select_from(Comment)).scalar_one() == 2
        assert _receipt_count(session) == 0

    def test_the_same_identity_with_a_different_body_is_a_deterministic_conflict(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        key = uuid4()
        path = self._path(couple, memory["id"])
        headers = with_key(couple["token_a"], key)

        first = client.post(path, json={"body": "Original"}, headers=headers)
        assert first.status_code == 201

        conflict = client.post(path, json={"body": "Geaendert"}, headers=headers)
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "IDEMPOTENCY_KEY_REUSED"

    def test_a_replay_after_the_comment_was_deleted_never_recreates_it(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        key = uuid4()
        path = self._path(couple, memory["id"])
        created = client.post(path, json={"body": "Weg damit"}, headers=with_key(couple["token_a"], key))
        assert created.status_code == 201

        deleted = client.delete(
            f"{base_path(couple['space'].id)}/comments/{created.json()['id']}",
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert deleted.status_code == 204

        replay = client.post(path, json={"body": "Weg damit"}, headers=with_key(couple["token_a"], key))
        assert replay.status_code == 404
        assert replay.json()["code"] == "COMMENT_CREATE_RESULT_DELETED"
        assert session.execute(select(func.count()).select_from(Comment)).scalar_one() == 0

    def test_a_partner_using_the_same_key_gets_an_unrelated_create(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        key = uuid4()
        path = self._path(couple, memory["id"])

        anna_comment = client.post(path, json={"body": "Anna"}, headers=with_key(couple["token_a"], key))
        ben_comment = client.post(path, json={"body": "Ben"}, headers=with_key(couple["token_b"], key))

        assert anna_comment.status_code == 201
        assert ben_comment.status_code == 201
        assert anna_comment.json()["id"] != ben_comment.json()["id"]

    def test_parallel_equivalent_requests_create_exactly_one_comment(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        # `client`/`session` share one non-thread-safe Session; real
        # concurrency needs `production_client`'s one-session-per-request
        # unit of work, exactly like `test_memory_create_reconciliation.py`.
        client, maker = production_client
        with maker.begin() as setup:
            anna = make_account(setup, "Anna")
            ben = make_account(setup, "Ben")
            space = make_space(setup, anna)
            relationship_service.add_member(setup, space.id, ben)
            token = sign_in(setup, anna)
            space_id = space.id

        memory = client.post(
            f"{base_path(space_id)}/memories",
            json={"title": "M", "body": "B", "happenedOn": "2025-06-13"},
            headers=auth(token),
        ).json()
        key = uuid4()
        path = f"{base_path(space_id)}/memories/{memory['id']}/comments"
        headers = with_key(token, key)

        def submit() -> tuple[int, str]:
            response = client.post(path, json={"body": "Gleichzeitig"}, headers=headers)
            return response.status_code, response.json().get("id", "")

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: submit(), range(8)))

        assert sorted(status for status, _ in results) == [200] * 7 + [201]
        assert len({comment_id for _, comment_id in results}) == 1
        with maker() as verify:
            assert verify.execute(select(func.count()).select_from(Comment)).scalar_one() == 1


class TestCrossDomainIsolation:
    """The whole point of a shared table is that one client-chosen UUID must
    stay scoped to the resource type it was used for."""

    def test_the_same_key_for_a_comment_and_a_wish_does_not_collide(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        memory = _memory(client, couple)
        key = uuid4()

        comment = client.post(
            f"{base_path(couple['space'].id)}/memories/{memory['id']}/comments",
            json={"body": "Kommentar"},
            headers=with_key(couple["token_a"], key),
        )
        wish = client.post(
            f"{base_path(couple['space'].id)}/wishes",
            json={"title": "Wunsch"},
            headers=with_key(couple["token_a"], key),
        )

        assert comment.status_code == 201
        assert wish.status_code == 201
        # Two committed resources under the identical (space, account, key):
        # scoping by resource_type kept them from being treated as replays of
        # each other.
        assert comment.json()["id"] != wish.json()["id"]


class TestWishReplay:
    def test_a_repeat_returns_the_original_wish(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        path = f"{base_path(couple['space'].id)}/wishes"

        first = client.post(path, json={"title": "Segelurlaub"}, headers=headers)
        assert first.status_code == 201
        second = client.post(path, json={"title": "Segelurlaub"}, headers=headers)
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert session.execute(select(func.count()).select_from(Wish)).scalar_one() == 1

    def test_the_same_identity_with_a_different_title_is_a_conflict(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        path = f"{base_path(couple['space'].id)}/wishes"

        assert client.post(path, json={"title": "A"}, headers=headers).status_code == 201
        conflict = client.post(path, json={"title": "B"}, headers=headers)
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "IDEMPOTENCY_KEY_REUSED"


class TestPlanReplay:
    def test_a_repeat_returns_the_original_plan(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        path = f"{base_path(couple['space'].id)}/plans"
        body = {"title": "Kino"}

        first = client.post(path, json=body, headers=headers)
        assert first.status_code == 201
        second = client.post(path, json=body, headers=headers)
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert session.execute(select(func.count()).select_from(Plan)).scalar_one() == 1


class TestMilestoneReplay:
    def test_a_repeat_returns_the_original_milestone(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        path = f"{base_path(couple['space'].id)}/milestones"
        body = {"title": "Verlobung", "happenedOn": "2025-06-13"}

        first = client.post(path, json=body, headers=headers)
        assert first.status_code == 201
        second = client.post(path, json=body, headers=headers)
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert session.execute(select(func.count()).select_from(Milestone)).scalar_one() == 1


class TestHeartMomentReplay:
    def test_a_repeat_returns_the_original_heart_moment(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        path = f"{base_path(couple['space'].id)}/heart-moments"
        body = {
            "text": "Danke fuer heute",
            "emotion": "GRATEFUL",
            "visibility": "SHARED",
            "happenedOn": "2025-06-13",
        }

        first = client.post(path, json=body, headers=headers)
        assert first.status_code == 201
        second = client.post(path, json=body, headers=headers)
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert session.execute(select(func.count()).select_from(HeartMoment)).scalar_one() == 1

    def test_only_the_creator_can_replay_an_owner_only_heart_moment(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        path = f"{base_path(couple['space'].id)}/heart-moments"
        body = {
            "text": "Privat",
            "emotion": "GRATEFUL",
            "visibility": "PRIVATE",
            "happenedOn": "2025-06-13",
        }

        created = client.post(path, json=body, headers=with_key(couple["token_a"], key))
        assert created.status_code == 201

        # The partner never claimed this identity, so this is simply their
        # own first use of the same key value -- not a replay, and not a
        # window into Anna's private HeartMoment.
        partner_attempt = client.post(path, json=body, headers=with_key(couple["token_b"], key))
        assert partner_attempt.status_code == 201
        assert partner_attempt.json()["id"] != created.json()["id"]
