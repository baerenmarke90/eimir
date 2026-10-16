"""PostgreSQL/HTTP acceptance coverage for M3-S8 PrivateCollections."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
from eimir.private_collections.models import PrivateCollectionItem
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_COLLECTION_TITLE = "Private plans for December"
SECRET_ITEM_TITLE = "Book the hidden surprise"


def collection_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/private/collections"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Foreign")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "foreign": foreign,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def create_collection(
    client,
    couple,
    *,
    token_key: str = "token_a",
    space_key: str = "space",
    title: str = SECRET_COLLECTION_TITLE,
):  # type: ignore[no-untyped-def]
    return client.post(
        collection_path(couple[space_key].id),
        json={"title": title},
        headers=auth(couple[token_key]),
    )


def item_path(couple, collection_id: str) -> str:  # type: ignore[no-untyped-def]
    return f"{collection_path(couple['space'].id)}/{collection_id}/items"


class TestPrivateCollection:
    def test_owner_can_manage_root_items_order_and_versions(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create_collection(client, couple)
        assert created.status_code == 201
        collection = created.json()
        assert collection["ownerId"] == str(couple["anna"].id)
        assert collection["spaceId"] == str(couple["space"].id)
        assert collection["title"] == SECRET_COLLECTION_TITLE
        assert collection["items"] == []
        assert collection["version"] == 1
        assert created.headers["ETag"] == '"1"'

        first = client.post(
            item_path(couple, collection["id"]),
            json={"title": SECRET_ITEM_TITLE},
            headers=auth(couple["token_a"]),
        )
        assert first.status_code == 201
        assert first.json()["position"] == 0
        assert first.json()["version"] == 1

        second = client.post(
            item_path(couple, collection["id"]),
            json={"title": "Second private item", "completed": False},
            headers=auth(couple["token_a"]),
        )
        assert second.status_code == 201
        assert second.json()["position"] == 1

        root = client.get(
            f"{collection_path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        )
        assert root.status_code == 200
        assert root.json()["version"] == 3

        updated_item = client.patch(
            f"{item_path(couple, collection['id'])}/{first.json()['id']}",
            json={"title": "  Updated hidden item  ", "completed": True},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated_item.status_code == 200
        assert updated_item.json()["title"] == "Updated hidden item"
        assert updated_item.json()["completed"] is True
        assert updated_item.json()["version"] == 2

        item_get = client.get(
            f"{item_path(couple, collection['id'])}/{first.json()['id']}",
            headers=auth(couple["token_a"]),
        )
        assert item_get.status_code == 200
        assert item_get.headers["ETag"] == '"2"'

        reordered = client.put(
            f"{collection_path(couple['space'].id)}/{collection['id']}/order",
            json={"itemIds": [second.json()["id"], first.json()["id"]]},
            headers=if_match(couple["token_a"], 3),
        )
        assert reordered.status_code == 200
        assert reordered.json()["version"] == 4
        assert [item["position"] for item in reordered.json()["items"]] == [0, 1]
        assert [item["id"] for item in reordered.json()["items"]] == [
            second.json()["id"],
            first.json()["id"],
        ]

        stale_reorder = client.put(
            f"{collection_path(couple['space'].id)}/{collection['id']}/order",
            json={"itemIds": [first.json()["id"], second.json()["id"]]},
            headers=if_match(couple["token_a"], 3),
        )
        assert stale_reorder.status_code == 409
        assert stale_reorder.json()["code"] == "PRIVATE_COLLECTION_ORDER_CONFLICT"

        deleted_item = client.delete(
            f"{item_path(couple, collection['id'])}/{second.json()['id']}",
            headers=if_match(couple["token_a"], 1),
        )
        assert deleted_item.status_code == 204

        after_delete = client.get(
            f"{collection_path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert after_delete["version"] == 5
        assert [item["id"] for item in after_delete["items"]] == [first.json()["id"]]
        assert after_delete["items"][0]["position"] == 0

        deleted_root = client.delete(
            f"{collection_path(couple['space'].id)}/{collection['id']}",
            headers=if_match(couple["token_a"], 5),
        )
        assert deleted_root.status_code == 204

    def test_stale_item_update_and_delete_fail_without_mutation(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        item = client.post(
            item_path(couple, collection["id"]),
            json={"title": "Versioned item"},
            headers=auth(couple["token_a"]),
        ).json()

        updated = client.patch(
            f"{item_path(couple, collection['id'])}/{item['id']}",
            json={"completed": True},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["version"] == 2

        stale_update = client.patch(
            f"{item_path(couple, collection['id'])}/{item['id']}",
            json={"title": "Must not win"},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale_update.status_code == 409
        assert stale_update.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        stale_delete = client.delete(
            f"{item_path(couple, collection['id'])}/{item['id']}",
            headers=if_match(couple["token_a"], 1),
        )
        assert stale_delete.status_code == 409
        assert stale_delete.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        current = client.get(
            f"{item_path(couple, collection['id'])}/{item['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert current["title"] == "Versioned item"
        assert current["completed"] is True
        assert current["version"] == 2

    def test_partner_root_and_child_paths_are_privacy_safe(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        item = client.post(
            item_path(couple, collection["id"]),
            json={"title": SECRET_ITEM_TITLE},
            headers=auth(couple["token_a"]),
        ).json()
        partner_headers = auth(couple["token_b"])
        root_base = f"{collection_path(couple['space'].id)}/{collection['id']}"

        real = client.get(root_base, headers=partner_headers)
        unknown = client.get(
            f"{collection_path(couple['space'].id)}/{uuid4()}",
            headers=partner_headers,
        )
        assert real.status_code == unknown.status_code == 404
        assert real.json() == unknown.json()
        assert real.json()["code"] == "PRIVATE_COLLECTION_NOT_FOUND"

        child_real = client.get(
            f"{root_base}/items/{item['id']}",
            headers=partner_headers,
        )
        child_unknown_parent = client.get(
            f"{collection_path(couple['space'].id)}/{uuid4()}/items/{item['id']}",
            headers=partner_headers,
        )
        assert child_real.status_code == child_unknown_parent.status_code == 404
        assert child_real.json() == child_unknown_parent.json()
        assert child_real.json()["code"] == "PRIVATE_COLLECTION_NOT_FOUND"

        page = client.get(collection_path(couple["space"].id), headers=partner_headers)
        assert page.status_code == 200
        assert page.json()["items"] == []
        assert SECRET_COLLECTION_TITLE not in page.text
        assert SECRET_ITEM_TITLE not in page.text

    def test_each_partner_list_contains_only_own_private_collections(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        anna = create_collection(client, couple, title="Anna private collection").json()
        ben = create_collection(
            client,
            couple,
            token_key="token_b",
            title="Ben private collection",
        ).json()

        anna_page = client.get(
            collection_path(couple["space"].id),
            headers=auth(couple["token_a"]),
        ).json()
        ben_page = client.get(
            collection_path(couple["space"].id),
            headers=auth(couple["token_b"]),
        ).json()
        assert [entry["id"] for entry in anna_page["items"]] == [anna["id"]]
        assert [entry["id"] for entry in ben_page["items"]] == [ben["id"]]
        assert "Ben private collection" not in str(anna_page)
        assert "Anna private collection" not in str(ben_page)

    def test_foreign_space_collection_is_indistinguishable_from_unknown(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        foreign = create_collection(
            client,
            couple,
            token_key="foreign_token",
            space_key="foreign_space",
            title="Foreign private collection",
        ).json()
        foreign_response = client.get(
            f"{collection_path(couple['space'].id)}/{foreign['id']}",
            headers=auth(couple["token_a"]),
        )
        unknown = client.get(
            f"{collection_path(couple['space'].id)}/{uuid4()}",
            headers=auth(couple["token_a"]),
        )
        assert foreign_response.status_code == unknown.status_code == 404
        assert foreign_response.json() == unknown.json()

    def test_owner_and_privacy_fields_are_server_derived(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            collection_path(couple["space"].id),
            json={
                "title": "No",
                "ownerId": str(couple["ben"].id),
                "spaceId": str(couple["space"].id),
                "privacyClass": "SPACE_SHARED",
            },
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_parent_delete_cascades_only_private_items(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        item = client.post(
            item_path(couple, collection["id"]),
            json={"title": "Cascade child"},
            headers=auth(couple["token_a"]),
        ).json()
        deleted = client.delete(
            f"{collection_path(couple['space'].id)}/{collection['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        session.expire_all()
        assert session.get(PrivateCollectionItem, item["id"]) is None


class TestPrivateCollectionEventRedaction:
    def test_private_collection_content_never_enters_event_payload(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        client.post(
            item_path(couple, collection["id"]),
            json={"title": SECRET_ITEM_TITLE, "completed": True},
            headers=auth(couple["token_a"]),
        )
        session.expire_all()
        events = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.space_id == couple["space"].id)
            ).scalars()
        )
        private_events = [
            event for event in events if event.event_type.startswith("PRIVATE_COLLECTION_")
        ]
        assert private_events
        serialized = "\n".join(
            f"{event.event_type} {event.subject_type} {event.payload.model_dump_json()}"
            for event in private_events
        )
        for secret in (
            SECRET_COLLECTION_TITLE,
            SECRET_ITEM_TITLE,
        ):
            assert secret not in serialized
