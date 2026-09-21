"""PostgreSQL/HTTP acceptance coverage for M3-S6 shared Collections."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.collections.models import CollectionItem
from eimir.outbox.models import OutboxEvent
from eimir.relationship import configuration as relationship_configuration
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_COLLECTION_TITLE = "A title that must never enter an event"
SECRET_ITEM_TITLE = "An item title that must never enter an event"
COLLECTION_COMPLETION_TRANSITION_HEADER = "X-Eimir-Collection-Completion-Transition"


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/collections"


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
    # Ben belongs to both spaces so cross-space resource checks reach the
    # Collection authorization boundary instead of stopping at Membership.
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


def create_collection(client, couple, *, token_key: str = "token_a", title: str = "Trips"):  # type: ignore[no-untyped-def]
    return client.post(
        path(couple["space"].id),
        json={"title": title},
        headers=auth(couple[token_key]),
    )


def create_item(client, couple, collection_id: str, title: str, *, token_key: str = "token_a"):  # type: ignore[no-untyped-def]
    return client.post(
        f"{path(couple['space'].id)}/{collection_id}/items",
        json={"title": title},
        headers=auth(couple[token_key]),
    )


class TestCollectionCrud:
    def test_partner_can_update_and_delete_without_changing_created_by(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_collection(client, couple)
        assert created.status_code == 201
        collection = created.json()
        assert UUID(collection["id"]).version == 7
        assert collection["title"] == "Trips"
        assert collection["items"] == []
        assert collection["createdBy"] == str(couple["anna"].id)
        assert collection["creator"]["displayName"] == "Anna"
        assert collection["version"] == 1
        assert created.headers["ETag"] == '"1"'

        read = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_b"]),
        )
        assert read.status_code == 200
        assert read.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}",
            json={"title": "  Weekend trips  "},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Weekend trips"
        assert updated.json()["createdBy"] == str(couple["anna"].id)
        assert updated.json()["version"] == 2

        stale = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}",
            json={"title": "Stale"},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        deleted = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=if_match(couple["token_b"], 2),
        )
        assert deleted.status_code == 204

    def test_created_by_is_server_derived(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={"title": "Trips", "createdBy": str(couple["ben"].id)},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_list_cursor_is_space_bound(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        first = create_collection(client, couple, title="First").json()
        second = create_collection(client, couple, title="Second").json()
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        ).json()
        assert [entry["id"] for entry in page["items"]] == [second["id"]]
        assert page["hasMore"] is True

        foreign = client.get(
            f"{path(couple['foreign_space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert foreign.status_code == 400
        assert foreign.json()["code"] == "INVALID_CURSOR"
        assert first["id"] != second["id"]

    def test_list_collections_batch_resolves_authors_and_items(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        c1 = create_collection(client, couple, token_key="token_a", title="List 1").json()
        c2 = create_collection(client, couple, token_key="token_b", title="List 2").json()
        item1 = create_item(client, couple, c1["id"], "Item A by Anna", token_key="token_a").json()
        item2 = create_item(client, couple, c1["id"], "Item B by Ben", token_key="token_b").json()
        item3 = create_item(client, couple, c2["id"], "Item C by Ben", token_key="token_b").json()

        page = client.get(
            f"{path(couple['space'].id)}",
            headers=auth(couple["token_a"]),
        ).json()

        items_by_id = {c["id"]: c for c in page["items"]}
        assert c1["id"] in items_by_id
        assert c2["id"] in items_by_id

        col1 = items_by_id[c1["id"]]
        assert col1["creator"]["displayName"] == "Anna"
        assert len(col1["items"]) == 2
        col1_item_creators = {item["id"]: item["creator"]["displayName"] for item in col1["items"]}
        assert col1_item_creators[item1["id"]] == "Anna"
        assert col1_item_creators[item2["id"]] == "Ben"

        col2 = items_by_id[c2["id"]]
        assert col2["creator"]["displayName"] == "Ben"
        assert len(col2["items"]) == 1
        assert col2["items"][0]["creator"]["displayName"] == "Ben"
        assert col2["items"][0]["id"] == item3["id"]

    def test_cross_space_collection_id_fails_closed(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        foreign_collection = client.post(
            path(couple["foreign_space"].id),
            json={"title": "Other space"},
            headers=auth(couple["token_b"]),
        ).json()
        response = client.get(
            f"{path(couple['space'].id)}/{foreign_collection['id']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "COLLECTION_NOT_FOUND"


class TestCollectionItems:
    def test_item_content_and_order_have_separate_versions(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        first = create_item(client, couple, collection["id"], "Passport").json()
        second = create_item(
            client,
            couple,
            collection["id"],
            "Hotel",
            token_key="token_b",
        ).json()
        assert first["position"] == 0
        assert second["position"] == 1
        assert first["version"] == second["version"] == 1
        assert first["createdBy"] == str(couple["anna"].id)
        assert second["createdBy"] == str(couple["ben"].id)

        aggregate = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert aggregate["version"] == 3

        completed = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{first['id']}",
            json={"completed": True},
            headers=if_match(couple["token_b"], 1),
        )
        assert completed.status_code == 200
        assert completed.json()["completed"] is True
        assert completed.json()["version"] == 2
        assert completed.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "false"

        after_completion = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert after_completion["version"] == 3

        reordered = client.put(
            f"{path(couple['space'].id)}/{collection['id']}/order",
            json={"itemIds": [second["id"], first["id"]]},
            headers=if_match(couple["token_b"], 3),
        )
        assert reordered.status_code == 200
        assert reordered.json()["version"] == 4
        assert [(item["id"], item["position"]) for item in reordered.json()["items"]] == [
            (second["id"], 0),
            (first["id"], 1),
        ]
        versions = {item["id"]: item["version"] for item in reordered.json()["items"]}
        assert versions == {second["id"]: 1, first["id"]: 2}

        stale_item = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{first['id']}",
            json={"completed": False},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale_item.status_code == 409
        assert stale_item.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        stale_order = client.put(
            f"{path(couple['space'].id)}/{collection['id']}/order",
            json={"itemIds": [first["id"], second["id"]]},
            headers=if_match(couple["token_a"], 3),
        )
        assert stale_order.status_code == 409
        assert stale_order.json()["code"] == "COLLECTION_ORDER_CONFLICT"

    def test_completion_transition_header_is_authoritative_and_not_replayed(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        first = create_item(client, couple, collection["id"], "Milk").json()
        second = create_item(client, couple, collection["id"], "Bread").json()

        partial = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{first['id']}",
            json={"completed": True},
            headers=if_match(couple["token_b"], first["version"]),
        )
        assert partial.status_code == 200
        assert partial.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "false"

        final = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{second['id']}",
            json={"completed": True},
            headers=if_match(couple["token_a"], second["version"]),
        )
        assert final.status_code == 200
        assert final.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "true"
        assert "X-Eimir-Shared-Achievement" not in final.headers

        stale_retry = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{second['id']}",
            json={"completed": True},
            headers=if_match(couple["token_a"], second["version"]),
        )
        assert stale_retry.status_code == 409
        assert COLLECTION_COMPLETION_TRANSITION_HEADER not in stale_retry.headers

        reopened = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{second['id']}",
            json={"completed": False},
            headers=if_match(couple["token_b"], final.json()["version"]),
        )
        assert reopened.status_code == 200
        assert reopened.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "false"

        completed_again = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{second['id']}",
            json={"completed": True},
            headers=if_match(couple["token_b"], reopened.json()["version"]),
        )
        assert completed_again.status_code == 200
        assert completed_again.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "true"

    def test_completion_celebration_is_server_gated(
        self,
        client,
        couple,
        session: Session,
    ) -> None:  # type: ignore[no-untyped-def]
        configuration = relationship_configuration.load(session, couple["space"].id)
        assert configuration is not None
        configuration.shared_achievements_enabled = True
        session.flush()

        collection = create_collection(client, couple).json()
        item = create_item(client, couple, collection["id"], "Milk").json()
        completed = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{item['id']}",
            json={"completed": True},
            headers=if_match(couple["token_b"], item["version"]),
        )

        assert completed.status_code == 200
        assert completed.headers[COLLECTION_COMPLETION_TRANSITION_HEADER] == "true"
        assert completed.headers["X-Eimir-Shared-Achievement"] == "collection-completed"

    def test_delete_compacts_positions_without_changing_remaining_item_versions(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        first = create_item(client, couple, collection["id"], "One").json()
        second = create_item(client, couple, collection["id"], "Two").json()
        third = create_item(client, couple, collection["id"], "Three").json()

        deleted = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}/items/{second['id']}",
            headers=if_match(couple["token_b"], 1),
        )
        assert deleted.status_code == 204

        aggregate = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert aggregate["version"] == 5
        assert [(item["id"], item["position"]) for item in aggregate["items"]] == [
            (first["id"], 0),
            (third["id"], 1),
        ]
        assert [item["version"] for item in aggregate["items"]] == [1, 1]

    @pytest.mark.parametrize(
        "order_kind",
        ["duplicate", "missing", "unknown", "other_collection"],
    )
    def test_reorder_requires_exact_current_item_set(self, client, couple, order_kind: str) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        first = create_item(client, couple, collection["id"], "One").json()
        second = create_item(client, couple, collection["id"], "Two").json()
        other = create_collection(client, couple, title="Other").json()
        other_item = create_item(client, couple, other["id"], "Other Item").json()

        orders = {
            "duplicate": [first["id"], first["id"]],
            "missing": [first["id"]],
            "unknown": [first["id"], str(uuid4())],
            "other_collection": [first["id"], other_item["id"]],
        }
        response = client.put(
            f"{path(couple['space'].id)}/{collection['id']}/order",
            json={"itemIds": orders[order_kind]},
            headers=if_match(couple["token_a"], 3),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "COLLECTION_ORDER_INVALID"

        unchanged = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert [(item["id"], item["position"]) for item in unchanged["items"]] == [
            (first["id"], 0),
            (second["id"], 1),
        ]
        assert unchanged["version"] == 3

    def test_item_from_another_collection_is_not_addressable(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        other = create_collection(client, couple, title="Other").json()
        other_item = create_item(client, couple, other["id"], "Other Item").json()

        response = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}/items/{other_item['id']}",
            json={"completed": True},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "COLLECTION_ITEM_NOT_FOUND"
        assert COLLECTION_COMPLETION_TRANSITION_HEADER not in response.headers

    def test_item_created_by_is_server_derived(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        response = client.post(
            f"{path(couple['space'].id)}/{collection['id']}/items",
            json={"title": "No", "createdBy": str(couple["ben"].id)},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422


class TestCollectionLifecycle:
    def test_parent_delete_cascades_only_collection_items(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple).json()
        item = create_item(client, couple, collection["id"], "Child").json()
        root = client.get(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=auth(couple["token_a"]),
        ).json()

        response = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=if_match(couple["token_b"], root["version"]),
        )
        assert response.status_code == 204
        session.expire_all()
        assert session.get(CollectionItem, UUID(item["id"])) is None

    def test_collection_and_item_titles_never_enter_outbox_payloads(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = create_collection(client, couple, title=SECRET_COLLECTION_TITLE).json()
        create_item(client, couple, collection["id"], SECRET_ITEM_TITLE)
        session.expire_all()
        events = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.space_id == couple["space"].id)
            ).scalars()
        )
        assert events
        serialized = "\n".join(
            f"{event.event_type} {event.subject_type} {event.payload.model_dump_json()}"
            for event in events
        )
        assert SECRET_COLLECTION_TITLE not in serialized
        assert SECRET_ITEM_TITLE not in serialized
