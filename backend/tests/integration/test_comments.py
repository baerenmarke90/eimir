"""PostgreSQL and HTTP acceptance for M2 Comments."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.comments.models import Comment
from eimir.comments.notifications import deliver
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET = "Kommentartext-darf-nicht-ins-event"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    beta = make_space(session, outsider)
    relationship_service.add_member(session, beta.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "beta": beta,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def base_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}"


def memory(client, couple, *, token: str | None = None):  # type: ignore[no-untyped-def]
    return client.post(
        f"{base_path(couple['space'].id)}/memories",
        json={"title": "M", "body": "B", "happenedOn": "2025-06-13"},
        headers=auth(token or couple["token_a"]),
    ).json()


def milestone(client, couple):  # type: ignore[no-untyped-def]
    return client.post(
        f"{base_path(couple['space'].id)}/milestones",
        json={"title": "Meilenstein", "happenedOn": "2025-06-13"},
        headers=auth(couple["token_a"]),
    ).json()


def heart(client, couple, visibility: str = "SHARED"):  # type: ignore[no-untyped-def]
    return client.post(
        f"{base_path(couple['space'].id)}/heart-moments",
        json={
            "text": "Herz",
            "emotion": "LOVED",
            "visibility": visibility,
            "happenedOn": "2025-06-13",
        },
        headers=auth(couple["token_a"]),
    ).json()


def comment_path(space_id: object, parent: str, parent_id: str) -> str:
    return f"{base_path(space_id)}/{parent}/{parent_id}/comments"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.mark.parametrize(
    ("factory", "segment"),
    [(memory, "memories"), (milestone, "milestones"), (heart, "heart-moments")],
)
def test_both_partners_comment_on_shared_targets(
    client,
    couple,
    factory,
    segment,
) -> None:  # type: ignore[no-untyped-def]
    parent = factory(client, couple)
    path = comment_path(couple["space"].id, segment, parent["id"])

    created = client.post(path, json={"body": "  Hallo  "}, headers=auth(couple["token_b"]))
    assert created.status_code == 201
    payload = created.json()
    assert UUID(payload["id"]).version == 7
    assert payload["body"] == "Hallo"
    assert payload["authorId"] == str(couple["ben"].id)
    assert payload["version"] == 1
    assert created.headers["ETag"] == '"1"'

    listing = client.get(path, headers=auth(couple["token_a"]))
    assert [entry["id"] for entry in listing.json()["items"]] == [payload["id"]]


def test_private_heart_moment_accepts_no_comments(client, couple) -> None:  # type: ignore[no-untyped-def]
    private = heart(client, couple, "PRIVATE")
    path = comment_path(couple["space"].id, "heart-moments", private["id"])

    for token in (couple["token_a"], couple["token_b"]):
        response = client.post(path, json={"body": "Nein"}, headers=auth(token))
        assert response.status_code == 404
        assert response.json()["code"] == "COMMENT_TARGET_NOT_AVAILABLE"


def test_cross_space_target_creates_neither_comment_nor_event(
    client,
    couple,
    session,
) -> None:  # type: ignore[no-untyped-def]
    parent = memory(client, couple)
    response = client.post(
        comment_path(couple["beta"].id, "memories", parent["id"]),
        json={"body": SECRET},
        headers=auth(couple["token_b"]),
    )
    assert response.status_code == 404
    assert session.execute(select(Comment)).scalars().all() == []
    assert (
        session.execute(select(OutboxEvent).where(OutboxEvent.event_type == "COMMENT_CREATED"))
        .scalars()
        .all()
        == []
    )


def test_only_comment_author_may_update_and_delete(client, couple) -> None:  # type: ignore[no-untyped-def]
    parent = memory(client, couple)
    path = comment_path(couple["space"].id, "memories", parent["id"])
    comment = client.post(
        path,
        json={"body": "Erste"},
        headers=auth(couple["token_b"]),
    ).json()
    detail = f"{base_path(couple['space'].id)}/comments/{comment['id']}"

    denied = client.patch(
        detail,
        json={"body": "Fremd"},
        headers=if_match(couple["token_a"], 1),
    )
    assert denied.status_code == 403

    updated = client.patch(
        detail,
        json={"body": "Neu"},
        headers=if_match(couple["token_b"], 1),
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2

    stale = client.delete(detail, headers=if_match(couple["token_b"], 1))
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    deleted = client.delete(detail, headers=if_match(couple["token_b"], 2))
    assert deleted.status_code == 204


def test_cursor_is_bound_to_parent_and_space(client, couple) -> None:  # type: ignore[no-untyped-def]
    first = memory(client, couple)
    second = memory(client, couple)
    first_path = comment_path(couple["space"].id, "memories", first["id"])
    second_path = comment_path(couple["space"].id, "memories", second["id"])
    for index in range(2):
        client.post(
            first_path,
            json={"body": f"C{index}"},
            headers=auth(couple["token_b"]),
        )

    page = client.get(f"{first_path}?limit=1", headers=auth(couple["token_b"])).json()
    cursor = page["nextCursor"]
    assert cursor is not None

    wrong_parent = client.get(
        f"{second_path}?limit=1&cursor={cursor}",
        headers=auth(couple["token_b"]),
    )
    assert wrong_parent.status_code == 400
    assert wrong_parent.json()["code"] == "INVALID_CURSOR"


@pytest.mark.parametrize(
    ("factory", "segment"),
    [(memory, "memories"), (milestone, "milestones"), (heart, "heart-moments")],
)
def test_parent_delete_removes_comments_atomically(
    client,
    couple,
    session,
    factory,
    segment,
) -> None:  # type: ignore[no-untyped-def]
    parent = factory(client, couple)
    path = comment_path(couple["space"].id, segment, parent["id"])
    comment = client.post(
        path,
        json={"body": "weg"},
        headers=auth(couple["token_b"]),
    ).json()

    deleted = client.delete(
        f"{base_path(couple['space'].id)}/{segment}/{parent['id']}",
        headers=if_match(couple["token_a"], 1),
    )
    assert deleted.status_code == 204
    assert session.get(Comment, UUID(comment["id"])) is None


def test_shared_to_private_removes_comments_and_resurrects_nothing(
    client,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    heart_moment = heart(client, couple)
    path = comment_path(couple["space"].id, "heart-moments", heart_moment["id"])
    client.post(
        path,
        json={"body": "verschwindet"},
        headers=auth(couple["token_b"]),
    )

    privacy_path = f"{base_path(couple['space'].id)}/heart-moments/{heart_moment['id']}/visibility"
    private = client.patch(
        privacy_path,
        json={"visibility": "PRIVATE"},
        headers=if_match(couple["token_a"], 1),
    )
    assert private.status_code == 200

    shared = client.patch(
        privacy_path,
        json={"visibility": "SHARED"},
        headers=if_match(couple["token_a"], 2),
    )
    assert shared.status_code == 200
    listed = client.get(path, headers=auth(couple["token_a"]))
    assert listed.status_code == 200
    assert listed.json()["items"] == []


def test_comment_created_event_is_content_free_and_only_for_other_parent(
    client,
    couple,
    session,
) -> None:  # type: ignore[no-untyped-def]
    parent = memory(client, couple)
    path = comment_path(couple["space"].id, "memories", parent["id"])
    own = client.post(
        path,
        json={"body": "eigener"},
        headers=auth(couple["token_a"]),
    )
    assert own.status_code == 201
    other = client.post(
        path,
        json={"body": SECRET},
        headers=auth(couple["token_b"]),
    )
    assert other.status_code == 201

    events = list(
        session.execute(
            select(OutboxEvent).where(OutboxEvent.event_type == "COMMENT_CREATED")
        ).scalars()
    )
    assert len(events) == 1
    event = events[0]
    assert event.actor_id == couple["ben"].id
    assert event.payload.recipient_id == couple["anna"].id
    assert event.payload.target_type == "MEMORY"
    assert event.payload.target_id == UUID(parent["id"])
    assert SECRET not in repr(event.payload.model_dump())


class RecordingSink:
    def __init__(self) -> None:
        self.keys: list[str] = []

    def send_comment_notification(
        self,
        *,
        idempotency_key: str,
        recipient_id: UUID,
        target_type: str,
        target_id: UUID,
    ) -> None:
        del recipient_id, target_type, target_id
        self.keys.append(idempotency_key)


class RetrySafeSink:
    def __init__(self) -> None:
        self.attempts: list[str] = []
        self.deliveries: set[str] = set()
        self.fail_after_first_delivery = True

    def send_comment_notification(
        self,
        *,
        idempotency_key: str,
        recipient_id: UUID,
        target_type: str,
        target_id: UUID,
    ) -> None:
        del recipient_id, target_type, target_id
        self.attempts.append(idempotency_key)
        self.deliveries.add(idempotency_key)
        if self.fail_after_first_delivery:
            self.fail_after_first_delivery = False
            raise RuntimeError("simulated crash after external delivery")


def test_notification_hook_uses_stable_outbox_id_as_idempotency_key(
    client,
    couple,
    session,
) -> None:  # type: ignore[no-untyped-def]
    parent = memory(client, couple)
    path = comment_path(couple["space"].id, "memories", parent["id"])
    client.post(path, json={"body": SECRET}, headers=auth(couple["token_b"]))
    event = session.execute(
        select(OutboxEvent).where(OutboxEvent.event_type == "COMMENT_CREATED")
    ).scalar_one()

    sink = RecordingSink()
    assert deliver(event, sink) is True
    assert sink.keys == [str(event.id)]
    assert event.processed_at is not None


def test_notification_retry_creates_no_duplicate_domain_delivery(
    client,
    couple,
    session,
) -> None:  # type: ignore[no-untyped-def]
    parent = memory(client, couple)
    path = comment_path(couple["space"].id, "memories", parent["id"])
    client.post(path, json={"body": SECRET}, headers=auth(couple["token_b"]))
    event = session.execute(
        select(OutboxEvent).where(OutboxEvent.event_type == "COMMENT_CREATED")
    ).scalar_one()

    key = str(event.id)
    sink = RetrySafeSink()
    with pytest.raises(RuntimeError, match="simulated crash"):
        deliver(event, sink)

    assert event.processed_at is None
    assert sink.deliveries == {key}

    assert deliver(event, sink) is True
    assert sink.attempts == [key, key]
    assert sink.deliveries == {key}
    assert event.processed_at is not None


def test_unknown_parent_remains_privacy_safe_404(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        comment_path(couple["space"].id, "memories", str(uuid4())),
        json={"body": "x"},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "COMMENT_TARGET_NOT_AVAILABLE"
