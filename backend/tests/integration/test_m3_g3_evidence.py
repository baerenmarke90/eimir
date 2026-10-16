"""Integrated real-HTTP/PostgreSQL evidence required by M3-D24 for G3.

Most M3 evidence remains in the slice-specific suites. This file deliberately
adds only cross-slice HTTP flows that were not already expressed end-to-end:
Chapter relation/delete preservation and a same-client Private Area owner to
partner to owner context switch.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


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


def space_path(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}"


def create_shared(client, couple, route: str, payload: dict):  # type: ignore[no-untyped-def]
    response = client.post(
        f"{space_path(couple)}/{route}",
        json=payload,
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def get_shared(client, couple, route: str, resource_id: str, *, token_key: str = "token_a"):  # type: ignore[no-untyped-def]
    return client.get(
        f"{space_path(couple)}/{route}/{resource_id}",
        headers=auth(couple[token_key]),
    )


def test_g3_chapter_relations_delete_preserves_originals_over_http(client, couple) -> None:  # type: ignore[no-untyped-def]
    """M3-D24 flow 3 through the production-like FastAPI/PostgreSQL stack."""
    chapter = create_shared(
        client,
        couple,
        "chapters",
        {
            "title": "G3 chapter",
            "startOn": "2026-01-01",
            "endOn": "2026-12-31",
        },
    )
    memory = create_shared(
        client,
        couple,
        "memories",
        {
            "title": "G3 memory",
            "body": "Preserved memory body",
            "happenedOn": "2026-01-15",
        },
    )
    heart = create_shared(
        client,
        couple,
        "heart-moments",
        {
            "text": "G3 shared heart moment",
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": "2026-02-15",
        },
    )
    milestone = create_shared(
        client,
        couple,
        "milestones",
        {
            "title": "G3 milestone",
            "happenedOn": "2026-03-15",
        },
    )

    chapter_base = f"{space_path(couple)}/chapters/{chapter['id']}"
    for slug, target in (
        ("milestones", milestone),
        ("heart-moments", heart),
        ("memories", memory),
    ):
        linked = client.put(
            f"{chapter_base}/{slug}/{target['id']}",
            headers=auth(couple["token_a"]),
        )
        assert linked.status_code == 204, linked.text

    ordered = client.get(
        f"{chapter_base}/content",
        headers=auth(couple["token_b"]),
    )
    assert ordered.status_code == 200
    assert ordered.json()["items"] == [
        {"targetType": "MEMORY", "targetId": memory["id"]},
        {"targetType": "HEART_MOMENT", "targetId": heart["id"]},
        {"targetType": "MILESTONE", "targetId": milestone["id"]},
    ]

    originals = {
        "memories": memory,
        "heart-moments": heart,
        "milestones": milestone,
    }
    for route, original in originals.items():
        before = get_shared(client, couple, route, original["id"], token_key="token_b")
        assert before.status_code == 200
        assert before.json()["id"] == original["id"]
        assert before.json()["version"] == original["version"] == 1

    deleted = client.delete(
        chapter_base,
        headers=if_match(couple["token_b"], 1),
    )
    assert deleted.status_code == 204
    assert client.get(chapter_base, headers=auth(couple["token_a"])).status_code == 404

    for route, original in originals.items():
        remaining = get_shared(client, couple, route, original["id"], token_key="token_b")
        assert remaining.status_code == 200
        assert remaining.json()["id"] == original["id"]
        assert remaining.json()["version"] == 1


def test_g3_private_area_owner_partner_owner_session_switch_is_isolated(client, couple) -> None:  # type: ignore[no-untyped-def]
    """M3-D24 flow 5 without relying on client-side hiding or cached ownership."""
    private_base = f"{space_path(couple)}/private"
    note_path = f"{private_base}/notes"
    gift_path = f"{private_base}/gift-ideas"
    collection_path = f"{private_base}/collections"

    note_response = client.post(
        note_path,
        json={"title": "G3 private note", "body": "Owner-only note", "pinned": True},
        headers=auth(couple["token_a"]),
    )
    assert note_response.status_code == 201
    note = note_response.json()

    gift_response = client.post(
        gift_path,
        json={
            "title": "G3 private gift",
            "description": "Owner-only gift",
            "recipient": "Ben",
            "occasion": "G3",
            "targetOn": date(2026, 12, 20).isoformat(),
            "priceText": "50 EUR",
            "url": "https://example.invalid/g3-private-gift",
            "pinned": True,
        },
        headers=auth(couple["token_a"]),
    )
    assert gift_response.status_code == 201
    gift = gift_response.json()

    collection_response = client.post(
        collection_path,
        json={"title": "G3 private collection"},
        headers=auth(couple["token_a"]),
    )
    assert collection_response.status_code == 201
    collection = collection_response.json()
    item_path = f"{collection_path}/{collection['id']}/items"
    item_response = client.post(
        item_path,
        json={"title": "G3 private item"},
        headers=auth(couple["token_a"]),
    )
    assert item_response.status_code == 201
    item = item_response.json()

    updated_note = client.patch(
        f"{note_path}/{note['id']}",
        json={"pinned": False},
        headers=if_match(couple["token_a"], 1),
    )
    assert updated_note.status_code == 200
    assert updated_note.json()["version"] == 2

    updated_gift = client.patch(
        f"{gift_path}/{gift['id']}",
        json={"status": "BOUGHT"},
        headers=if_match(couple["token_a"], 1),
    )
    assert updated_gift.status_code == 200
    assert updated_gift.json()["status"] == "BOUGHT"
    assert updated_gift.json()["version"] == 2

    updated_item = client.patch(
        f"{item_path}/{item['id']}",
        json={"completed": True},
        headers=if_match(couple["token_a"], 1),
    )
    assert updated_item.status_code == 200
    assert updated_item.json()["completed"] is True
    assert updated_item.json()["version"] == 2

    # The same ASGI client now switches account context. No ownership state may
    # survive on the server from the preceding owner's requests.
    partner_headers = auth(couple["token_b"])
    for list_path in (note_path, gift_path, collection_path):
        page = client.get(list_path, headers=partner_headers)
        assert page.status_code == 200
        assert page.json()["items"] == []

    owner_resources = (
        (f"{note_path}/{note['id']}", "PRIVATE_NOTE_NOT_FOUND"),
        (f"{gift_path}/{gift['id']}", "GIFT_IDEA_NOT_FOUND"),
        (f"{collection_path}/{collection['id']}", "PRIVATE_COLLECTION_NOT_FOUND"),
        (f"{item_path}/{item['id']}", "PRIVATE_COLLECTION_NOT_FOUND"),
    )
    for resource_path, expected_code in owner_resources:
        hidden = client.get(resource_path, headers=partner_headers)
        assert hidden.status_code == 404
        assert hidden.json()["code"] == expected_code

    assert (
        client.patch(
            f"{note_path}/{note['id']}",
            json={"pinned": True},
            headers=if_match(couple["token_b"], 2),
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"{gift_path}/{gift['id']}",
            json={"pinned": False},
            headers=if_match(couple["token_b"], 2),
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"{item_path}/{item['id']}",
            json={"completed": False},
            headers=if_match(couple["token_b"], 2),
        ).status_code
        == 404
    )

    # Switching the same client back to the owner restores access only because
    # the request carries the owner's current authorization context.
    owner_headers = auth(couple["token_a"])
    note_after = client.get(f"{note_path}/{note['id']}", headers=owner_headers)
    gift_after = client.get(f"{gift_path}/{gift['id']}", headers=owner_headers)
    collection_after = client.get(f"{collection_path}/{collection['id']}", headers=owner_headers)
    item_after = client.get(f"{item_path}/{item['id']}", headers=owner_headers)
    assert note_after.status_code == gift_after.status_code == 200
    assert collection_after.status_code == item_after.status_code == 200
    assert note_after.json()["pinned"] is False
    assert gift_after.json()["status"] == "BOUGHT"
    assert item_after.json()["completed"] is True
