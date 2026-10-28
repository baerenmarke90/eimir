"""Photo reactions persist through the shared Memory's authorization boundary."""

from uuid import UUID, uuid4

import pytest

from eimir.memories.models import Memory
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_attachment_binding import (
    base_path,
    if_match,
    memory,
    ready_attachment,
)
from tests.integration.test_attachment_binding import (
    couple as _couple,
)

pytestmark = [pytest.mark.integration, requires_database]
couple = _couple


@pytest.fixture
def photo_memory(client, couple, session):  # type: ignore[no-untyped-def]
    photo = ready_attachment(client, couple, session)
    created = memory(client, couple)
    path = f"{base_path(couple['space'].id)}/memories/{created['id']}"
    bound = client.put(
        f"{path}/attachments",
        json={"attachments": [{"attachmentId": photo, "position": 0, "isSensitive": True}]},
        headers=if_match(couple["token_a"], created["version"]),
    )
    assert bound.status_code == 200
    return path, photo, bound.json()


def test_each_partner_sets_replaces_and_removes_only_their_own_reaction(
    client, couple, photo_memory
):  # type: ignore[no-untyped-def]
    path, photo, _ = photo_memory
    endpoint = f"{path}/attachments/{photo}/reaction"
    first = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_b"]))
    assert first.status_code == 200
    assert first.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": True}
    ]
    replay = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_b"]))
    assert replay.json()["version"] == first.json()["version"]
    other = client.get(path, headers=auth(couple["token_a"]))
    assert other.json()["attachments"][0]["reactions"][0]["own"] is False
    both = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_a"]))
    assert both.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 2, "own": True}
    ]
    replaced = client.put(endpoint, json={"reaction": "LIKE"}, headers=auth(couple["token_b"]))
    assert replaced.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": False},
        {"reaction": "LIKE", "count": 1, "own": True},
    ]
    removed = client.put(endpoint, json={"reaction": None}, headers=auth(couple["token_b"]))
    assert removed.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": False}
    ]
    replay = client.put(endpoint, json={"reaction": None}, headers=auth(couple["token_b"]))
    assert replay.json()["version"] == removed.json()["version"]


def test_editor_preserves_reactions_and_detaching_prunes_them(
    client, couple, session, photo_memory
):  # type: ignore[no-untyped-def]
    path, photo, initial = photo_memory
    reacted = client.put(
        f"{path}/attachments/{photo}/reaction",
        json={"reaction": "CELEBRATE"},
        headers=auth(couple["token_b"]),
    ).json()
    stale = client.patch(
        path, json={"title": "Edited"}, headers=if_match(couple["token_a"], initial["version"])
    )
    assert stale.status_code == 409
    edited = client.patch(
        path, json={"title": "Edited"}, headers=if_match(couple["token_a"], reacted["version"])
    )
    assert edited.status_code == 200
    assert edited.json()["attachments"][0]["reactions"][0]["reaction"] == "CELEBRATE"
    detached = client.put(
        f"{path}/attachments",
        json={"attachments": []},
        headers=if_match(couple["token_a"], edited.json()["version"]),
    )
    assert detached.status_code == 200
    session.expire_all()
    assert session.get(Memory, UUID(initial["id"])).payload.photo_reactions == []


def test_rejects_foreign_unbound_missing_and_invalid_photo_targets(
    client, couple, session, photo_memory
):  # type: ignore[no-untyped-def]
    path, photo, _ = photo_memory
    unbound = ready_attachment(client, couple, session)
    for target in [unbound, str(uuid4()), "invalid"]:
        result = client.put(
            f"{path}/attachments/{target}/reaction",
            json={"reaction": "LOVE"},
            headers=auth(couple["token_b"]),
        )
        assert result.status_code == 404
    other_memory = memory(client, couple)
    other_path = f"{base_path(couple['space'].id)}/memories/{other_memory['id']}"
    assert (
        client.put(
            f"{other_path}/attachments/{photo}/reaction",
            json={"reaction": "LOVE"},
            headers=auth(couple["token_a"]),
        ).status_code
        == 404
    )
    outsider = make_account(session, "Outside")
    make_space(session, outsider)
    token = sign_in(session, outsider)
    endpoint = f"{path}/attachments/{photo}/reaction"
    assert client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(token)).status_code == 404
    assert client.put(endpoint, json={"reaction": "LOVE"}).status_code == 401
    for body in [
        {"reaction": "CUSTOM"},
        {},
        {"reaction": "LOVE", "accountId": str(couple["anna"].id)},
    ]:
        assert client.put(endpoint, json=body, headers=auth(couple["token_b"])).status_code == 422
    assert (
        client.get(path, headers=auth(couple["token_a"])).json()["attachments"][0]["reactions"]
        == []
    )
