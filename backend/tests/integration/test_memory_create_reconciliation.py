"""Memory create reconciliation through a scoped request identity (#961, decision 0012)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from time import monotonic, sleep
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.jobs.maintenance import run_security_retention
from eimir.main import create_app
from eimir.memories import create_receipts
from eimir.memories import service as memory_service
from eimir.memories.models import Memory, MemoryCreateReceipt
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

_SAMPLE = UUID(int=0x1F2E3D4C5B6A79888796A5B4C3D2E1F0)
SECRET_TITLE = "Geheimer Titel der Erinnerung"
SECRET_BODY = "Ein geschuetzter Erinnerungstext, der nie im Receipt landen darf."


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/memories"


def payload(**overrides: Any) -> dict[str, Any]:
    return {
        "title": SECRET_TITLE,
        "body": SECRET_BODY,
        "happenedOn": "2025-06-13",
        **overrides,
    }


def with_key(token: str, key: UUID | str) -> dict[str, str]:
    return {**auth(token), "Idempotency-Key": str(key)}


def memory_count(session: Session, space_id: UUID) -> int:
    return session.execute(
        select(func.count()).select_from(Memory).where(Memory.space_id == space_id)
    ).scalar_one()


def receipt_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(MemoryCreateReceipt)).scalar_one()


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    other_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "other_space": other_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


class TestReplay:
    def test_an_equivalent_repeat_returns_the_original_memory_without_a_second_create(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        first = client.post(
            path(couple["space"].id), json=payload(), headers=with_key(couple["token_a"], key)
        )
        assert first.status_code == 201
        events_after_create = session.execute(
            select(func.count()).select_from(OutboxEvent)
        ).scalar_one()

        second = client.post(
            path(couple["space"].id), json=payload(), headers=with_key(couple["token_a"], key)
        )

        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert second.headers["ETag"] == first.headers["ETag"]
        assert memory_count(session, couple["space"].id) == 1
        # A replay writes nothing, so it cannot emit another domain event.
        assert (
            session.execute(select(func.count()).select_from(OutboxEvent)).scalar_one()
            == events_after_create
        )

    def test_a_replay_shows_the_current_state_of_the_original_memory(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        created = client.post(path(couple["space"].id), json=payload(), headers=headers)
        edited = client.patch(
            f"{path(couple['space'].id)}/{created.json()['id']}",
            json={"body": "Nachtraeglich geaendert"},
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert edited.status_code == 200

        replay = client.post(path(couple["space"].id), json=payload(), headers=headers)

        assert replay.status_code == 200
        assert replay.json()["id"] == created.json()["id"]
        assert replay.json()["body"] == "Nachtraeglich geaendert"
        assert replay.headers["ETag"] == '"2"'

    def test_a_create_without_a_key_keeps_the_previous_behaviour(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        for _ in range(2):
            response = client.post(
                path(couple["space"].id), json=payload(), headers=auth(couple["token_a"])
            )
            assert response.status_code == 201

        assert memory_count(session, couple["space"].id) == 2
        assert receipt_count(session) == 0

    def test_the_same_identity_with_another_payload_is_a_deterministic_conflict(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        first = client.post(path(couple["space"].id), json=payload(), headers=headers)

        for changed in (
            payload(title="Anderer Titel"),
            payload(body="Anderer Text"),
            payload(happenedOn="2025-06-14"),
            payload(happenedOn=None),
        ):
            conflict = client.post(path(couple["space"].id), json=changed, headers=headers)
            assert conflict.status_code == 409
            assert conflict.json()["code"] == "IDEMPOTENCY_KEY_REUSED"

        # Neither payload silently wins: the original is untouched and alone.
        assert memory_count(session, couple["space"].id) == 1
        stored = client.get(
            f"{path(couple['space'].id)}/{first.json()['id']}", headers=auth(couple["token_a"])
        )
        assert stored.json()["title"] == SECRET_TITLE
        assert stored.json()["body"] == SECRET_BODY

    def test_a_replay_after_the_memory_was_deleted_never_recreates_it(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        created = client.post(path(couple["space"].id), json=payload(), headers=headers)
        deleted = client.delete(
            f"{path(couple['space'].id)}/{created.json()['id']}",
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert deleted.status_code == 204

        replay = client.post(path(couple["space"].id), json=payload(), headers=headers)

        assert replay.status_code == 404
        assert replay.json()["code"] == "MEMORY_CREATE_RESULT_DELETED"
        assert memory_count(session, couple["space"].id) == 0

    @pytest.mark.parametrize(
        "value",
        ["", "abc", _SAMPLE.hex, f"{{{_SAMPLE}}}"],
    )
    def test_a_malformed_key_is_rejected_before_anything_is_written(
        self, client, session, couple, value: str
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json=payload(),
            headers={**auth(couple["token_a"]), "Idempotency-Key": value},
        )

        assert response.status_code == 422
        assert response.json()["code"] == "IDEMPOTENCY_KEY_MALFORMED"
        assert memory_count(session, couple["space"].id) == 0

    def test_a_rejected_payload_does_not_consume_the_identity(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        invalid = client.post(path(couple["space"].id), json=payload(title="   "), headers=headers)
        assert invalid.status_code == 422
        assert receipt_count(session) == 0

        fixed = client.post(path(couple["space"].id), json=payload(), headers=headers)
        assert fixed.status_code == 201


class TestScopeAndPrivacy:
    def test_a_partner_using_the_same_key_gets_an_unrelated_create(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        anna = client.post(
            path(couple["space"].id), json=payload(), headers=with_key(couple["token_a"], key)
        )
        ben = client.post(
            path(couple["space"].id),
            json=payload(title="Bens Erinnerung"),
            headers=with_key(couple["token_b"], key),
        )

        # No conflict and no replay: Ben's request neither sees nor reveals Anna's identity.
        assert ben.status_code == 201
        assert ben.json()["id"] != anna.json()["id"]
        assert ben.json()["title"] == "Bens Erinnerung"
        assert memory_count(session, couple["space"].id) == 2

    def test_the_same_account_and_key_in_another_space_is_unrelated(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        second_space = make_space(session, couple["anna"])
        session.flush()
        key = uuid4()
        first = client.post(
            path(couple["space"].id), json=payload(), headers=with_key(couple["token_a"], key)
        )
        second = client.post(
            path(second_space.id),
            json=payload(title="Anderer Space"),
            headers=with_key(couple["token_a"], key),
        )

        assert second.status_code == 201
        assert second.json()["id"] != first.json()["id"]
        assert second.json()["spaceId"] == str(second_space.id)

    def test_a_key_cannot_be_used_to_reach_a_foreign_space(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        client.post(
            path(couple["space"].id), json=payload(), headers=with_key(couple["token_a"], key)
        )

        probe = client.post(
            path(couple["space"].id),
            json=payload(),
            headers=with_key(couple["token_outsider"], key),
        )
        anonymous = client.post(
            path(couple["space"].id), json=payload(), headers={"Idempotency-Key": str(key)}
        )

        assert probe.status_code == 404
        assert probe.json()["code"] == "SPACE_NOT_FOUND"
        assert anonymous.status_code == 401

    def test_after_membership_loss_a_replay_reveals_nothing_and_the_receipt_is_gone(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_b"], key)
        created = client.post(path(couple["space"].id), json=payload(), headers=headers)
        assert created.status_code == 201
        membership = session.execute(
            select(Membership).where(
                Membership.space_id == couple["space"].id,
                Membership.account_id == couple["ben"].id,
            )
        ).scalar_one()
        relationship_service.end_membership(session, membership, removed=True)
        session.flush()

        replay = client.post(path(couple["space"].id), json=payload(), headers=headers)

        assert replay.status_code == 404
        assert replay.json()["code"] == "SPACE_NOT_FOUND"
        assert receipt_count(session) == 0

    def test_a_receipt_keeps_no_request_content(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        client.post(
            path(couple["space"].id),
            json=payload(),
            headers=with_key(couple["token_a"], uuid4()),
        )

        row = session.execute(
            text("SELECT to_jsonb(r)::text FROM memory_create_receipts r")
        ).scalar_one()
        assert "Geheimer" not in row
        assert "Erinnerungstext" not in row
        assert "2025-06-13" not in row


class TestLifetime:
    def test_receipts_expire_and_an_expired_identity_is_an_ordinary_first_use(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        key = uuid4()
        headers = with_key(couple["token_a"], key)
        client.post(path(couple["space"].id), json=payload(), headers=headers)
        created_at = session.execute(select(MemoryCreateReceipt.created_at)).scalar_one()

        just_before = create_receipts.prune_expired(
            session, at=created_at + create_receipts.RECEIPT_RETENTION
        )
        assert just_before == 0
        assert (
            client.post(path(couple["space"].id), json=payload(), headers=headers).status_code
            == 200
        )

        removed = create_receipts.prune_expired(
            session,
            at=created_at + create_receipts.RECEIPT_RETENTION + timedelta(seconds=1),
        )
        assert removed == 1
        after_expiry = client.post(path(couple["space"].id), json=payload(), headers=headers)
        assert after_expiry.status_code == 201

    def test_the_maintenance_job_prunes_expired_receipts(self, session, couple) -> None:  # type: ignore[no-untyped-def]
        context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
        for _ in range(2):
            memory_service.create_memory_once(
                session,
                context,
                idempotency_key=uuid4(),
                title="Titel",
                body="",
                happened_on=None,
            )
        session.flush()
        old = session.execute(select(MemoryCreateReceipt).limit(1)).scalar_one()
        old.created_at = now() - create_receipts.RECEIPT_RETENTION - timedelta(minutes=1)
        session.flush()

        run_security_retention(session, {})

        assert receipt_count(session) == 1

    def test_account_deletion_cleanup_removes_the_accounts_receipts(self, session, couple) -> None:  # type: ignore[no-untyped-def]
        for account, space in ((couple["anna"], couple["space"]), (couple["ben"], couple["space"])):
            memory_service.create_memory_once(
                session,
                AuthorizationContext(account_id=account.id, space_id=space.id),
                idempotency_key=uuid4(),
                title="Titel",
                body="",
                happened_on=None,
            )
        session.flush()

        apply_accepted_tombstone(session, couple["anna"].id, accepted_at=now())
        apply_core_cleanup(session, couple["anna"].id)

        remaining = session.execute(select(MemoryCreateReceipt.account_id)).scalars().all()
        assert remaining == [couple["ben"].id]


class TestTransactionBoundary:
    def test_a_rolled_back_create_leaves_neither_memory_nor_receipt_and_can_be_retried(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, space_id, token, _ = _committed_couple(production_client)
        key = uuid4()

        def explode(*_args: object, **_kwargs: object) -> None:
            raise RuntimeError("simulated failure after the Memory was flushed")

        with monkeypatch.context() as patch:
            patch.setattr(create_receipts, "attach", explode)
            failed = client.post(path(space_id), json=payload(), headers=with_key(token, key))
        assert failed.status_code == 500
        with maker() as verify:
            assert memory_count(verify, space_id) == 0
            assert receipt_count(verify) == 0

        retry = client.post(path(space_id), json=payload(), headers=with_key(token, key))
        assert retry.status_code == 201
        with maker() as verify:
            assert memory_count(verify, space_id) == 1

    def test_a_response_lost_after_commit_is_reconciled_to_the_one_original(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        _client, maker, space_id, token, _ = _committed_couple(production_client)
        key = uuid4()
        sent: list[str] = []

        inner = create_app()

        async def lossy(scope, receive, send):  # type: ignore[no-untyped-def]
            """Run the real app, but the caller never receives the response."""
            if scope["type"] != "http" or scope["method"] != "POST" or sent:
                await inner(scope, receive, send)
                return

            async def drop(message):  # type: ignore[no-untyped-def]
                if message["type"] in {"http.response.start", "http.response.body"}:
                    sent.append(message["type"])
                    if message["type"] == "http.response.start":
                        raise ConnectionResetError("client went away")

            await inner(scope, receive, drop)

        with TestClient(lossy, raise_server_exceptions=False) as lossy_client:  # type: ignore[arg-type]
            lost = lossy_client.post(path(space_id), json=payload(), headers=with_key(token, key))
            assert lost.status_code != 201, "the create response must not reach the client"
            assert sent, "the server did process and answer the request"

            # The Memory was committed even though the client never saw the answer.
            with maker() as verify:
                committed = (
                    verify.execute(select(Memory.id).where(Memory.space_id == space_id))
                    .scalars()
                    .all()
                )
            assert len(committed) == 1

            reconciled = lossy_client.post(
                path(space_id), json=payload(), headers=with_key(token, key)
            )

        assert reconciled.status_code == 200
        assert UUID(reconciled.json()["id"]) == committed[0]
        with maker() as verify:
            assert memory_count(verify, space_id) == 1

    def test_reconciliation_survives_a_new_process_and_connection(self, production_client) -> None:  # type: ignore[no-untyped-def]
        client, _maker, space_id, token, _ = _committed_couple(production_client)
        key = uuid4()
        first = client.post(path(space_id), json=payload(), headers=with_key(token, key))
        assert first.status_code == 201

        with TestClient(create_app(), raise_server_exceptions=False) as restarted:
            replay = restarted.post(path(space_id), json=payload(), headers=with_key(token, key))

        assert replay.status_code == 200
        assert replay.json()["id"] == first.json()["id"]


class TestConcurrency:
    def test_parallel_equivalent_requests_create_exactly_one_memory(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, space_id, token, _ = _committed_couple(production_client)
        key = uuid4()

        def submit() -> tuple[int, str]:
            response = client.post(path(space_id), json=payload(), headers=with_key(token, key))
            return response.status_code, response.json().get("id", "")

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: submit(), range(8)))

        assert sorted(status for status, _ in results) == [200] * 7 + [201]
        assert len({memory_id for _, memory_id in results}) == 1
        with maker() as verify:
            assert memory_count(verify, space_id) == 1
            assert receipt_count(verify) == 1

    def test_parallel_requests_with_different_payloads_produce_one_winner_and_conflicts(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker, space_id, token, _ = _committed_couple(production_client)
        key = uuid4()

        def submit(index: int) -> int:
            return client.post(
                path(space_id),
                json=payload(title=f"Titel {index}"),
                headers=with_key(token, key),
            ).status_code

        with ThreadPoolExecutor(max_workers=6) as pool:
            statuses = list(pool.map(submit, range(6)))

        assert statuses.count(201) == 1
        assert statuses.count(409) == 5
        with maker() as verify:
            assert memory_count(verify, space_id) == 1

    def test_a_second_request_waits_for_the_first_commit_and_then_replays(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        _client, maker, space_id, _token, anna_id = _committed_couple(production_client)
        context = AuthorizationContext(account_id=anna_id, space_id=space_id)
        key = uuid4()

        first = maker()
        transaction = first.begin()
        try:
            original = _create(first, context, key)
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(_create_in_new_transaction, maker, context, key)
                _wait_until_a_transaction_waits_on_a_lock(maker)
                assert not future.done()

                transaction.commit()
                replayed = future.result(timeout=10)
        finally:
            if transaction.is_active:
                transaction.rollback()
            first.close()

        assert original.created is True
        assert replayed.created is False
        assert replayed.memory.id == original.memory.id
        with maker() as verify:
            assert memory_count(verify, space_id) == 1

    def test_a_second_request_creates_when_the_first_rolls_back(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _client, maker, space_id, _token, anna_id = _committed_couple(production_client)
        context = AuthorizationContext(account_id=anna_id, space_id=space_id)
        key = uuid4()

        first = maker()
        transaction = first.begin()
        try:
            abandoned = _create(first, context, key)
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(_create_in_new_transaction, maker, context, key)
                _wait_until_a_transaction_waits_on_a_lock(maker)
                transaction.rollback()
                created = future.result(timeout=10)
        finally:
            if transaction.is_active:
                transaction.rollback()
            first.close()

        assert created.created is True
        assert created.memory.id != abandoned.memory.id
        with maker() as verify:
            assert memory_count(verify, space_id) == 1
            assert receipt_count(verify) == 1


def _create(session: Session, context: AuthorizationContext, key: UUID):  # type: ignore[no-untyped-def]
    return memory_service.create_memory_once(
        session,
        context,
        idempotency_key=key,
        title=SECRET_TITLE,
        body=SECRET_BODY,
        happened_on=None,
    )


def _create_in_new_transaction(maker, context: AuthorizationContext, key: UUID):  # type: ignore[no-untyped-def]
    with maker.begin() as session:
        return _create(session, context, key)


def _wait_until_a_transaction_waits_on_a_lock(
    maker,  # type: ignore[no-untyped-def]
    timeout: float = 10.0,
) -> None:
    """Poll PostgreSQL until a backend is blocked on a lock (no fixed delay)."""
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        with maker() as probe:
            waiting = probe.execute(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() AND wait_event_type = 'Lock'"
                )
            ).scalar_one()
        if waiting:
            return
        sleep(0.01)
    raise AssertionError("no transaction ever blocked on the request identity")


def _committed_couple(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        token = sign_in(session, anna)
        space_id, anna_id = space.id, anna.id
    return client, maker, space_id, token, anna_id
