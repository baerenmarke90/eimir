"""PostgreSQL and HTTP coverage for finishing a shopping trip and its suggestions (#1808)."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.collections import service as collection_service
from eimir.collections.models import CollectionSuggestion
from eimir.outbox.models import OutboxEvent
from eimir.relationship import configuration as relationship_configuration
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_TITLE = "secret-title-in-a-trip"


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


def make_collection(client, couple, *, kind: str = "SHOPPING"):  # type: ignore[no-untyped-def]
    response = client.post(
        path(couple["space"].id),
        json={"title": "Einkauf", "kind": kind},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_item(client, couple, collection_id: str, title: str, **body):  # type: ignore[no-untyped-def]
    response = client.post(
        f"{path(couple['space'].id)}/{collection_id}/items",
        json={"title": title, **body},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def check(client, couple, collection_id: str, item: dict, *, completed: bool = True):  # type: ignore[no-untyped-def]
    response = client.patch(
        f"{path(couple['space'].id)}/{collection_id}/items/{item['id']}",
        json={"completed": completed},
        headers=if_match(couple["token_a"], item["version"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


def finish(client, couple, collection_id: str, ids: list[str], *, token_key="token_a"):  # type: ignore[no-untyped-def]
    return client.post(
        f"{path(couple['space'].id)}/{collection_id}/finish",
        json={"itemIds": ids},
        headers=auth(couple[token_key]),
    )


def suggestions(client, couple, collection_id: str, *, token_key="token_b"):  # type: ignore[no-untyped-def]
    response = client.get(
        f"{path(couple['space'].id)}/{collection_id}/suggestions",
        headers=auth(couple[token_key]),
    )
    assert response.status_code == 200, response.text
    return response.json()["items"]


def read(client, couple, collection_id: str):  # type: ignore[no-untyped-def]
    return client.get(
        f"{path(couple['space'].id)}/{collection_id}", headers=auth(couple["token_a"])
    ).json()


class TestFinishShopping:
    def test_finishing_takes_the_named_checked_entries_out_of_the_cart(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch", quantity="2 l")
        bread = add_item(client, couple, collection["id"], "Brot")
        apples = add_item(client, couple, collection["id"], "Äpfel")
        check(client, couple, collection["id"], milk)
        check(client, couple, collection["id"], apples)

        response = finish(client, couple, collection["id"], [milk["id"], bread["id"], apples["id"]])

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["finishedCount"] == 2
        assert [item["title"] for item in body["collection"]["items"]] == ["Brot"]
        assert [item["position"] for item in body["collection"]["items"]] == [0]
        assert response.headers["ETag"] == f'"{body["collection"]["version"]}"'
        assert [item["title"] for item in read(client, couple, collection["id"])["items"]] == [
            "Brot"
        ]

    def test_the_finished_titles_become_suggestions_the_partner_can_read(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch", quantity="2 l")
        check(client, couple, collection["id"], milk)
        finish(client, couple, collection["id"], [milk["id"]])

        # Ben did not add or finish anything, and reads the same suggestions.
        found = suggestions(client, couple, collection["id"], token_key="token_b")

        assert [(item["title"], item["quantity"], item["timesBought"]) for item in found] == [
            ("Milch", "2 l", 1)
        ]

    def test_repeating_the_request_finds_nothing_left_and_changes_nothing(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], milk)
        first = finish(client, couple, collection["id"], [milk["id"]])
        again = finish(client, couple, collection["id"], [milk["id"]])

        assert (
            first.json()["finishedCount"],
            again.status_code,
            again.json()["finishedCount"],
        ) == (
            1,
            200,
            0,
        )
        assert [item["timesBought"] for item in suggestions(client, couple, collection["id"])] == [
            1
        ]

    def test_the_partner_finishing_the_same_cart_loses_nothing_and_duplicates_nothing(  # type: ignore[no-untyped-def]
        self, client, couple
    ) -> None:
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        bread = add_item(client, couple, collection["id"], "Brot")
        check(client, couple, collection["id"], milk)
        check(client, couple, collection["id"], bread)
        ids = [milk["id"], bread["id"]]

        by_anna = finish(client, couple, collection["id"], ids, token_key="token_a")
        by_ben = finish(client, couple, collection["id"], ids, token_key="token_b")

        assert (by_anna.json()["finishedCount"], by_ben.json()["finishedCount"]) == (2, 0)
        assert read(client, couple, collection["id"])["items"] == []
        assert sorted(item["title"] for item in suggestions(client, couple, collection["id"])) == [
            "Brot",
            "Milch",
        ]

    def test_an_entry_checked_after_the_client_read_the_list_stays(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        bread = add_item(client, couple, collection["id"], "Brot")
        check(client, couple, collection["id"], milk)

        # The cart the person saw held only the milk; the bread is checked next.
        check(client, couple, collection["id"], bread)
        result = finish(client, couple, collection["id"], [milk["id"]])

        assert result.json()["finishedCount"] == 1
        left = read(client, couple, collection["id"])["items"]
        assert [(item["title"], item["completed"]) for item in left] == [("Brot", True)]

    def test_a_named_entry_that_is_open_again_is_neither_finished_nor_suggested(  # type: ignore[no-untyped-def]
        self, client, couple
    ) -> None:
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        checked = check(client, couple, collection["id"], milk)
        check(client, couple, collection["id"], checked, completed=False)

        result = finish(client, couple, collection["id"], [milk["id"]])

        assert result.json()["finishedCount"] == 0
        assert [item["title"] for item in read(client, couple, collection["id"])["items"]] == [
            "Milch"
        ]
        assert suggestions(client, couple, collection["id"]) == []

    def test_naming_nothing_or_unknown_entries_is_a_harmless_no_op(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], milk)

        empty = finish(client, couple, collection["id"], [])
        unknown = finish(client, couple, collection["id"], ["00000000-0000-0000-0000-00000000dead"])

        assert (empty.json()["finishedCount"], unknown.json()["finishedCount"]) == (0, 0)
        assert read(client, couple, collection["id"])["items"][0]["completed"] is True

    def test_the_remaining_entries_keep_their_order(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        items = [add_item(client, couple, collection["id"], title) for title in "ABCDE"]
        check(client, couple, collection["id"], items[1])
        check(client, couple, collection["id"], items[3])

        finish(client, couple, collection["id"], [items[1]["id"], items[3]["id"]])

        left = read(client, couple, collection["id"])["items"]
        assert [(item["title"], item["position"]) for item in left] == [
            ("A", 0),
            ("C", 1),
            ("E", 2),
        ]

    def test_too_many_entries_in_one_request_are_rejected(
        self, client, couple, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        monkeypatch.setattr(collection_service, "FINISH_MAX_ITEMS", 2)
        ids = [f"00000000-0000-0000-0000-00000000000{n}" for n in range(3)]

        response = finish(client, couple, collection["id"], ids)

        assert response.status_code == 422
        assert response.json()["code"] == "COLLECTION_FINISH_TOO_MANY_ITEMS"


class TestSuggestions:
    def test_buying_the_same_thing_again_keeps_one_suggestion_with_the_latest_wording(  # type: ignore[no-untyped-def]
        self, client, couple
    ) -> None:
        collection = make_collection(client, couple)
        for title, quantity in (("Milch", "1 l"), ("  milch ", "2 l")):
            item = add_item(client, couple, collection["id"], title, quantity=quantity)
            check(client, couple, collection["id"], item)
            finish(client, couple, collection["id"], [item["id"]])

        found = suggestions(client, couple, collection["id"])

        assert len(found) == 1
        assert (found[0]["title"], found[0]["quantity"], found[0]["timesBought"]) == (
            "milch",
            "2 l",
            2,
        )

    def test_the_most_recently_bought_comes_first(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        for title in ("Milch", "Brot", "Käse"):
            item = add_item(client, couple, collection["id"], title)
            check(client, couple, collection["id"], item)
            finish(client, couple, collection["id"], [item["id"]])

        assert [item["title"] for item in suggestions(client, couple, collection["id"])] == [
            "Käse",
            "Brot",
            "Milch",
        ]

    def test_a_suggestion_is_removed_on_its_own_and_the_list_is_untouched(
        self, client, couple
    ) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        for title in ("Milch", "Brot"):
            item = add_item(client, couple, collection["id"], title)
            check(client, couple, collection["id"], item)
            finish(client, couple, collection["id"], [item["id"]])
        remaining = add_item(client, couple, collection["id"], "Käse")
        milk = next(
            item
            for item in suggestions(client, couple, collection["id"])
            if item["title"] == "Milch"
        )

        removed = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}/suggestions/{milk['id']}",
            headers=auth(couple["token_b"]),
        )

        assert removed.status_code == 204
        assert [item["title"] for item in suggestions(client, couple, collection["id"])] == ["Brot"]
        assert [item["id"] for item in read(client, couple, collection["id"])["items"]] == [
            remaining["id"]
        ]

    def test_removing_an_unknown_suggestion_is_not_found(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        response = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}/suggestions/"
            "00000000-0000-0000-0000-00000000dead",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "COLLECTION_SUGGESTION_NOT_FOUND"

    def test_deleting_the_list_deletes_its_suggestions(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], item)
        finish(client, couple, collection["id"], [item["id"]])
        current = read(client, couple, collection["id"])
        assert session.scalar(select(func.count()).select_from(CollectionSuggestion)) == 1

        deleted = client.delete(
            f"{path(couple['space'].id)}/{collection['id']}",
            headers=if_match(couple["token_a"], current["version"]),
        )

        assert deleted.status_code == 204, deleted.text
        assert session.scalar(select(func.count()).select_from(CollectionSuggestion)) == 0

    def test_a_list_keeps_a_bounded_number_and_drops_the_least_recently_bought(  # type: ignore[no-untyped-def]
        self, client, couple, monkeypatch
    ) -> None:
        collection = make_collection(client, couple)
        monkeypatch.setattr(collection_service, "SUGGESTIONS_MAX_PER_COLLECTION", 3)
        for title in ("A", "B", "C", "D", "E"):
            item = add_item(client, couple, collection["id"], title)
            check(client, couple, collection["id"], item)
            finish(client, couple, collection["id"], [item["id"]])

        assert [item["title"] for item in suggestions(client, couple, collection["id"])] == [
            "E",
            "D",
            "C",
        ]


class TestOnlyShoppingListsAndOnlyTheCouple:
    def test_a_plain_list_has_no_trip_and_no_suggestions(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        plain = make_collection(client, couple, kind="GENERIC")
        space = path(couple["space"].id)
        headers = auth(couple["token_a"])

        responses = [
            client.post(f"{space}/{plain['id']}/finish", json={"itemIds": []}, headers=headers),
            client.get(f"{space}/{plain['id']}/suggestions", headers=headers),
            client.delete(
                f"{space}/{plain['id']}/suggestions/00000000-0000-0000-0000-00000000dead",
                headers=headers,
            ),
        ]

        # A plain list has no trip to finish and nothing to list; a suggestion that
        # cannot exist there is simply not found.
        assert [response.status_code for response in responses] == [422, 422, 404]
        assert [response.json()["code"] for response in responses] == [
            "COLLECTION_SHOPPING_NOT_SUPPORTED",
            "COLLECTION_SHOPPING_NOT_SUPPORTED",
            "COLLECTION_SUGGESTION_NOT_FOUND",
        ]

    def test_someone_outside_the_couple_cannot_read_finish_or_remove(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        item = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], item)
        finish(client, couple, collection["id"], [item["id"]])
        known = suggestions(client, couple, collection["id"])[0]
        foreign = auth(couple["foreign_token"])
        space = path(couple["foreign_space"].id)

        responses = [
            client.get(f"{space}/{collection['id']}/suggestions", headers=foreign),
            client.post(
                f"{space}/{collection['id']}/finish", json={"itemIds": []}, headers=foreign
            ),
            client.delete(f"{space}/{collection['id']}/suggestions/{known['id']}", headers=foreign),
        ]

        assert [response.status_code for response in responses] == [404, 404, 404]
        assert len(suggestions(client, couple, collection["id"])) == 1


class TestEvents:
    def test_finishing_records_one_deletion_per_entry_without_any_title(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        collection = make_collection(client, couple)
        items = [
            add_item(client, couple, collection["id"], f"{SECRET_TITLE}-{n}") for n in range(2)
        ]
        for item in items:
            check(client, couple, collection["id"], item)
        before = session.scalar(select(func.count()).select_from(OutboxEvent)) or 0

        finish(client, couple, collection["id"], [item["id"] for item in items])

        events = session.scalars(select(OutboxEvent).order_by(OutboxEvent.created_at)).all()[
            before:
        ]
        types = [event.event_type for event in events]
        assert types.count("COLLECTION_ITEM_DELETED") == 2
        assert types.count("COLLECTION_UPDATED") == 1
        assert SECRET_TITLE not in json.dumps([event.payload for event in events], default=str)


class TestSharedMoment:
    def _enable(self, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
        configuration = relationship_configuration.load(session, couple["space"].id)
        assert configuration is not None
        configuration.shared_achievements_enabled = True
        session.flush()

    def test_finishing_the_last_entries_is_a_shared_moment_when_the_couple_enabled_it(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        self._enable(session, couple)
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], milk)

        response = finish(client, couple, collection["id"], [milk["id"]])

        assert response.headers["X-Eimir-Shared-Achievement"] == "collection-completed"

    def test_it_is_not_a_moment_when_entries_are_still_open_or_nothing_was_finished(  # type: ignore[no-untyped-def]
        self, client, couple, session
    ) -> None:
        self._enable(session, couple)
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        add_item(client, couple, collection["id"], "Brot")
        check(client, couple, collection["id"], milk)

        partly = finish(client, couple, collection["id"], [milk["id"]])
        nothing = finish(client, couple, collection["id"], [milk["id"]])

        assert "X-Eimir-Shared-Achievement" not in partly.headers
        assert "X-Eimir-Shared-Achievement" not in nothing.headers

    def test_it_is_never_sent_when_the_couple_did_not_enable_it(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        collection = make_collection(client, couple)
        milk = add_item(client, couple, collection["id"], "Milch")
        check(client, couple, collection["id"], milk)

        response = finish(client, couple, collection["id"], [milk["id"]])

        assert response.json()["finishedCount"] == 1
        assert "X-Eimir-Shared-Achievement" not in response.headers
