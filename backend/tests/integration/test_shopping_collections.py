"""PostgreSQL/HTTP coverage for the shopping variant of shared Collections (#1808).

Covers the Collection kind, the optional free-text item quantity, who completed
an item and when, and reading several known lists in one request.
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
)
from eimir.collections.service import ITEM_QUANTITY_MAX_LENGTH
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_QUANTITY = "7 secret-quantity-text"


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
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def make_collection(client, couple, *, kind: str | None = "SHOPPING", title: str = "Einkauf"):  # type: ignore[no-untyped-def]
    body: dict[str, object] = {"title": title}
    if kind is not None:
        body["kind"] = kind
    response = client.post(path(couple["space"].id), json=body, headers=auth(couple["token_a"]))
    assert response.status_code == 201, response.text
    return response.json()


def make_item(client, couple, collection_id: str, **body):  # type: ignore[no-untyped-def]
    return client.post(
        f"{path(couple['space'].id)}/{collection_id}/items",
        json=body,
        headers=auth(couple["token_a"]),
    )


def patch_item(client, couple, collection_id: str, item: dict, body: dict, *, token_key="token_a"):  # type: ignore[no-untyped-def]
    return client.patch(
        f"{path(couple['space'].id)}/{collection_id}/items/{item['id']}",
        json=body,
        headers=if_match(couple[token_key], item["version"]),
    )


class TestCollectionKind:
    def test_collections_are_generic_unless_a_kind_is_chosen_at_creation(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        assert make_collection(client, couple, kind=None)["kind"] == "GENERIC"
        assert make_collection(client, couple, kind="GENERIC")["kind"] == "GENERIC"
        shopping = make_collection(client, couple, kind="SHOPPING")
        assert shopping["kind"] == "SHOPPING"

        read = client.get(
            f"{path(couple['space'].id)}/{shopping['id']}", headers=auth(couple["token_b"])
        )
        assert read.json()["kind"] == "SHOPPING"

    def test_unknown_kind_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={"title": "x", "kind": "RECIPES"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_kind_cannot_be_changed_after_creation(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple, kind="GENERIC")
        response = client.patch(
            f"{path(couple['space'].id)}/{collection['id']}",
            json={"kind": "SHOPPING"},
            headers=if_match(couple["token_a"], collection["version"]),
        )
        assert response.status_code == 422

    def test_kind_column_rejects_unknown_values(self, session, couple) -> None:  # type: ignore[no-untyped-def]
        collection = Collection(
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            privacy_class="SPACE_SHARED",
            kind="RECIPES",
            payload=CollectionPayload(title="x"),
        )
        session.add(collection)
        with pytest.raises(IntegrityError), session.begin_nested():
            session.flush()


class TestItemQuantity:
    def test_shopping_item_keeps_trimmed_free_text_quantity(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        created = make_item(client, couple, collection["id"], title="Hafermilch", quantity="  2 l ")
        assert created.status_code == 201, created.text
        assert created.json()["quantity"] == "2 l"

        read = client.get(
            f"{path(couple['space'].id)}/{collection['id']}", headers=auth(couple["token_b"])
        )
        assert [item["quantity"] for item in read.json()["items"]] == ["2 l"]

    def test_quantity_is_optional_and_blank_means_none(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        without = make_item(client, couple, collection["id"], title="Tomaten")
        blank = make_item(client, couple, collection["id"], title="Brot", quantity="   ")
        assert without.json()["quantity"] is None
        assert blank.json()["quantity"] is None

    def test_over_long_quantity_is_rejected_without_creating_the_item(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        response = make_item(
            client,
            couple,
            collection["id"],
            title="Tomaten",
            quantity="x" * (ITEM_QUANTITY_MAX_LENGTH + 1),
        )
        assert response.status_code == 422
        read = client.get(
            f"{path(couple['space'].id)}/{collection['id']}", headers=auth(couple["token_a"])
        )
        assert read.json()["items"] == []
        exact = make_item(
            client,
            couple,
            collection["id"],
            title="Tomaten",
            quantity="x" * ITEM_QUANTITY_MAX_LENGTH,
        )
        assert exact.status_code == 201

    def test_generic_lists_do_not_accept_a_quantity(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple, kind="GENERIC")
        rejected = make_item(client, couple, collection["id"], title="Sandalen", quantity="2")
        assert rejected.status_code == 422
        assert rejected.json()["code"] == "COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED"
        accepted = make_item(client, couple, collection["id"], title="Sandalen", quantity=None)
        assert accepted.status_code == 201
        assert accepted.json()["quantity"] is None

        update = patch_item(client, couple, collection["id"], accepted.json(), {"quantity": "2"})
        assert update.status_code == 422
        assert update.json()["code"] == "COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED"

    def test_changing_title_keeps_quantity_and_changing_quantity_keeps_title(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch", quantity="1 l").json()

        renamed = patch_item(client, couple, collection["id"], item, {"title": "Hafermilch"})
        assert renamed.status_code == 200, renamed.text
        assert (renamed.json()["title"], renamed.json()["quantity"]) == ("Hafermilch", "1 l")

        requantified = patch_item(
            client, couple, collection["id"], renamed.json(), {"quantity": "2 l"}
        )
        assert (requantified.json()["title"], requantified.json()["quantity"]) == (
            "Hafermilch",
            "2 l",
        )

    def test_null_or_blank_quantity_clears_it(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch", quantity="1 l").json()
        cleared = patch_item(client, couple, collection["id"], item, {"quantity": None})
        assert cleared.status_code == 200
        assert cleared.json()["quantity"] is None

        again = make_item(client, couple, collection["id"], title="Brot", quantity="1").json()
        blank = patch_item(client, couple, collection["id"], again, {"quantity": "  "})
        assert blank.json()["quantity"] is None

    def test_completing_an_item_keeps_its_quantity(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch", quantity="1 l").json()
        done = patch_item(client, couple, collection["id"], item, {"completed": True})
        assert done.json()["quantity"] == "1 l"

    def test_items_stored_before_quantities_existed_read_as_having_none(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        row = session.get(CollectionItem, item["id"])
        # A payload as stored before ``quantity`` was added to the model.
        row.payload = CollectionItemPayload.model_validate({"title": "Milch"})
        session.flush()
        read = client.get(
            f"{path(couple['space'].id)}/{collection['id']}", headers=auth(couple["token_a"])
        )
        assert read.json()["items"][0]["quantity"] is None

    def test_quantity_text_never_enters_outbox_events(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(
            client, couple, collection["id"], title="Milch", quantity=SECRET_QUANTITY
        ).json()
        patch_item(client, couple, collection["id"], item, {"completed": True})
        events = session.scalars(select(OutboxEvent)).all()
        assert events
        assert SECRET_QUANTITY not in json.dumps([event.payload for event in events], default=str)


class TestCompletionDetails:
    def test_open_items_have_no_completion_details(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        assert (item["completedBy"], item["completedAt"], item["completer"]) == (None, None, None)

    def test_the_partner_who_completes_an_item_is_recorded_with_the_time(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        done = patch_item(
            client, couple, collection["id"], item, {"completed": True}, token_key="token_b"
        )
        assert done.status_code == 200, done.text
        body = done.json()
        assert body["createdBy"] == str(couple["anna"].id)
        assert body["completedBy"] == str(couple["ben"].id)
        assert body["completer"]["displayName"] == "Ben"
        assert isinstance(
            datetime.fromisoformat(body["completedAt"].replace("Z", "+00:00")), datetime
        )

    def test_the_actor_comes_from_the_session_not_the_request(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        response = patch_item(
            client,
            couple,
            collection["id"],
            item,
            {"completed": True, "completedBy": str(couple["anna"].id)},
            token_key="token_b",
        )
        assert response.status_code == 422

    def test_completing_again_keeps_the_first_completer(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        first = patch_item(
            client, couple, collection["id"], item, {"completed": True}, token_key="token_b"
        ).json()
        again = patch_item(
            client, couple, collection["id"], first, {"completed": True}, token_key="token_a"
        )
        assert again.json()["completedBy"] == str(couple["ben"].id)
        assert again.json()["completedAt"] == first["completedAt"]

    def test_reopening_clears_the_details_and_the_next_completer_wins(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        done = patch_item(
            client, couple, collection["id"], item, {"completed": True}, token_key="token_b"
        ).json()
        reopened = patch_item(client, couple, collection["id"], done, {"completed": False}).json()
        assert (reopened["completedBy"], reopened["completedAt"], reopened["completer"]) == (
            None,
            None,
            None,
        )
        again = patch_item(client, couple, collection["id"], reopened, {"completed": True}).json()
        assert again["completedBy"] == str(couple["anna"].id)

    def test_an_item_created_as_completed_records_its_creator(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        created = make_item(client, couple, collection["id"], title="Milch", completed=True).json()
        assert created["completedBy"] == str(couple["anna"].id)
        assert created["completedAt"] is not None

    def test_listing_resolves_completers_with_the_batched_authors(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        patch_item(client, couple, collection["id"], item, {"completed": True}, token_key="token_b")
        page = client.get(path(couple["space"].id), headers=auth(couple["token_a"])).json()
        listed = page["items"][0]["items"][0]
        assert listed["completer"]["displayName"] == "Ben"

    def test_details_without_completion_are_rejected_by_the_database(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        row = session.get(CollectionItem, item["id"])
        row.completed_by = couple["ben"].id
        with pytest.raises(IntegrityError), session.begin_nested():
            session.flush()

    def test_deleting_the_completing_account_keeps_the_item(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        temporary = make_account(session, "Temporary")
        session.flush()
        collection = make_collection(client, couple)
        item = make_item(client, couple, collection["id"], title="Milch").json()
        done = patch_item(client, couple, collection["id"], item, {"completed": True})
        assert done.status_code == 200
        row = session.get(CollectionItem, item["id"])
        row.completed_by = temporary.id
        session.flush()

        session.delete(temporary)
        session.flush()
        session.refresh(row)
        assert row.completed is True
        assert row.completed_by is None


class TestReadingSeveralKnownLists:
    def test_ids_limit_the_listing_to_the_requested_collections(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        first = make_collection(client, couple, title="Einkauf")
        second = make_collection(client, couple, kind="GENERIC", title="Packliste")
        make_collection(client, couple, kind="GENERIC", title="Bucket List")
        response = client.get(
            path(couple["space"].id),
            params=[("ids", first["id"]), ("ids", second["id"])],
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200, response.text
        assert {item["title"] for item in response.json()["items"]} == {"Einkauf", "Packliste"}

    def test_ids_from_another_space_are_not_returned_or_revealed(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        foreign = client.post(
            path(couple["foreign_space"].id),
            json={"title": "Secret"},
            headers=auth(couple["foreign_token"]),
        ).json()
        own = make_collection(client, couple)
        response = client.get(
            path(couple["space"].id),
            params=[("ids", foreign["id"]), ("ids", own["id"])],
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["items"]] == [own["id"]]

    def test_a_cursor_is_bound_to_the_requested_ids(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = [make_collection(client, couple, kind="GENERIC", title=f"L{n}") for n in range(3)]
        ids = [("ids", item["id"]) for item in created]
        first = client.get(
            path(couple["space"].id), params=[*ids, ("limit", "1")], headers=auth(couple["token_a"])
        ).json()
        assert first["hasMore"] is True
        reused = client.get(
            path(couple["space"].id),
            params=[("ids", created[0]["id"]), ("cursor", first["nextCursor"])],
            headers=auth(couple["token_a"]),
        )
        assert reused.status_code == 400
        same = client.get(
            path(couple["space"].id),
            params=[*ids, ("cursor", first["nextCursor"])],
            headers=auth(couple["token_a"]),
        )
        assert same.status_code == 200

    def test_more_than_fifty_ids_are_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        ids = [("ids", f"00000000-0000-4000-8000-{n:012d}") for n in range(51)]
        response = client.get(path(couple["space"].id), params=ids, headers=auth(couple["token_a"]))
        assert response.status_code == 422
