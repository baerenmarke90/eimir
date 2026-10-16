"""PostgreSQL/HTTP acceptance tests for M4-A global Search."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.chapters.models import Chapter, ChapterPayload
from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
)
from eimir.gift_ideas.models import GiftIdea, GiftIdeaPayload
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
from eimir.places.models import Place, PlacePayload
from eimir.plans.models import Plan, PlanPayload
from eimir.private_collections.models import (
    PrivateCollection,
    PrivateCollectionItem,
    PrivateCollectionItemPayload,
    PrivateCollectionPayload,
)
from eimir.private_notes.models import PrivateNote, PrivateNotePayload
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishPayload
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def _shared(couple, owner_id):  # type: ignore[no-untyped-def]
    return {
        "space_id": couple["space"].id,
        "owner_id": owner_id,
        "privacy_class": PrivacyClass.SPACE_SHARED.value,
    }


def _private(couple, owner_id):  # type: ignore[no-untyped-def]
    return {
        "space_id": couple["space"].id,
        "owner_id": owner_id,
        "privacy_class": PrivacyClass.OWNER_ONLY.value,
    }


def _seed_all_targets(session: Session, couple):  # type: ignore[no-untyped-def]
    anna_id = couple["anna"].id
    shared = _shared(couple, anna_id)
    private = _private(couple, anna_id)

    memory = Memory(
        **shared,
        happened_on=date(2025, 5, 1),
        payload=MemoryPayload(title="Needle memory", body="Shared needle body"),
    )
    shared_heart = HeartMoment(
        **shared,
        happened_on=date(2025, 5, 2),
        payload=HeartMomentPayload(text="Needle heart", emotion=HeartEmotion.LOVED),
    )
    private_heart = HeartMoment(
        **private,
        happened_on=date(2025, 5, 3),
        payload=HeartMomentPayload(text="Needle private heart", emotion=HeartEmotion.GRATEFUL),
    )
    milestone = Milestone(
        **shared,
        happened_on=date(2025, 5, 4),
        payload=MilestonePayload(title="Needle milestone", body="Needle milestone body"),
    )
    wish = Wish(**shared, payload=WishPayload(title="Needle wish"))
    plan = Plan(
        **shared,
        payload=PlanPayload(title="Needle plan", description="Needle planning details"),
    )
    place = Place(
        **shared,
        payload=PlacePayload(
            name="Needle place",
            description="Needle description",
            address="Needle street 1",
        ),
    )
    chapter = Chapter(
        **shared,
        payload=ChapterPayload(title="Needle chapter", description="Needle chapter details"),
    )
    collection = Collection(**shared, payload=CollectionPayload(title="Needle collection"))
    private_note = PrivateNote(
        **private,
        payload=PrivateNotePayload(title="Needle private note", body="Needle private note body"),
    )
    gift = GiftIdea(
        **private,
        payload=GiftIdeaPayload(
            title="Needle gift",
            description="Needle gift details",
            recipient="Needle recipient",
            occasion="Needle occasion",
            price_text="Needle budget",
            url="https://needle.example.invalid/not-indexed",
        ),
    )
    private_collection = PrivateCollection(
        **private,
        payload=PrivateCollectionPayload(title="Needle private collection"),
    )
    session.add_all(
        [
            memory,
            shared_heart,
            private_heart,
            milestone,
            wish,
            plan,
            place,
            chapter,
            collection,
            private_note,
            gift,
            private_collection,
        ]
    )
    session.flush()

    collection_item = CollectionItem(
        collection_id=collection.id,
        created_by=anna_id,
        completed=False,
        position=0,
        payload=CollectionItemPayload(title="Needle collection item"),
    )
    private_collection_item = PrivateCollectionItem(
        collection_id=private_collection.id,
        completed=False,
        position=0,
        payload=PrivateCollectionItemPayload(title="Needle private collection item"),
    )
    partner_private_note = PrivateNote(
        **_private(couple, couple["ben"].id),
        payload=PrivateNotePayload(
            title="Needle partner secret",
            body="Needle content Anna must never receive",
        ),
    )
    foreign = Memory(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2025, 5, 5),
        payload=MemoryPayload(title="Needle foreign", body="Needle foreign body"),
    )
    session.add_all([collection_item, private_collection_item, partner_private_note, foreign])
    session.flush()

    return {
        "memory": memory,
        "shared_heart": shared_heart,
        "private_heart": private_heart,
        "milestone": milestone,
        "wish": wish,
        "plan": plan,
        "place": place,
        "chapter": chapter,
        "collection": collection,
        "collection_item": collection_item,
        "private_note": private_note,
        "gift": gift,
        "private_collection": private_collection,
        "private_collection_item": private_collection_item,
        "partner_private_note": partner_private_note,
        "foreign": foreign,
    }


def _search(client, couple, *, token=None, q="needle", **parameters):  # type: ignore[no-untyped-def]
    params = {"q": q, **parameters}
    return client.get(
        f"/api/v1/spaces/{couple['space'].id}/search",
        params=params,
        headers=auth(token or couple["token_a"]),
    )


def _items(response):  # type: ignore[no-untyped-def]
    assert response.status_code == 200, response.text
    return response.json()["items"]


class TestSearchTargetsAndPrivacy:
    def test_all_decided_targets_are_searchable_with_correct_scope(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        items = _items(_search(client, couple, limit=50))
        by_id = {item["id"]: item for item in items}

        expected_shared = {
            seeded["memory"].id,
            seeded["shared_heart"].id,
            seeded["milestone"].id,
            seeded["wish"].id,
            seeded["plan"].id,
            seeded["place"].id,
            seeded["chapter"].id,
            seeded["collection"].id,
            seeded["collection_item"].id,
        }
        expected_private = {
            seeded["private_heart"].id,
            seeded["private_note"].id,
            seeded["gift"].id,
            seeded["private_collection"].id,
            seeded["private_collection_item"].id,
        }

        assert {str(value) for value in expected_shared | expected_private} <= set(by_id)
        assert all(by_id[str(value)]["scope"] == "SHARED" for value in expected_shared)
        assert all(by_id[str(value)]["scope"] == "PRIVATE" for value in expected_private)
        assert str(seeded["partner_private_note"].id) not in by_id
        assert str(seeded["foreign"].id) not in by_id

    def test_partner_receives_shared_content_and_only_their_own_private_content(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        items = _items(_search(client, couple, token=couple["token_b"], limit=50))
        ids = {item["id"] for item in items}

        assert str(seeded["memory"].id) in ids
        assert str(seeded["partner_private_note"].id) in ids
        assert str(seeded["private_note"].id) not in ids
        assert str(seeded["private_heart"].id) not in ids
        assert str(seeded["private_collection_item"].id) not in ids

    def test_private_collection_item_is_authorized_through_parent(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        item = next(
            entry
            for entry in _items(_search(client, couple, type=["PRIVATE_COLLECTION_ITEM"], limit=50))
            if entry["id"] == str(seeded["private_collection_item"].id)
        )
        assert item["parentId"] == str(seeded["private_collection"].id)
        assert item["scope"] == "PRIVATE"

        partner_ids = {
            entry["id"]
            for entry in _items(
                _search(
                    client,
                    couple,
                    token=couple["token_b"],
                    type=["PRIVATE_COLLECTION_ITEM"],
                    limit=50,
                )
            )
        }
        assert str(seeded["private_collection_item"].id) not in partner_ids

    def test_shared_collection_item_is_space_authorized_through_parent(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        items = _items(_search(client, couple, type=["COLLECTION_ITEM"], limit=50))
        item = next(entry for entry in items if entry["id"] == str(seeded["collection_item"].id))
        assert item["parentId"] == str(seeded["collection"].id)
        assert str(seeded["foreign"].id) not in {entry["id"] for entry in items}

    def test_visibility_transition_removes_partner_result_but_keeps_owner_result(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        heart_id = str(seeded["shared_heart"].id)

        partner_before = {
            item["id"]
            for item in _items(
                _search(client, couple, token=couple["token_b"], type=["HEART_MOMENT"])
            )
        }
        assert heart_id in partner_before

        seeded["shared_heart"].privacy_class = PrivacyClass.OWNER_ONLY.value
        session.flush()

        partner_after = {
            item["id"]
            for item in _items(
                _search(client, couple, token=couple["token_b"], type=["HEART_MOMENT"])
            )
        }
        owner_after = {
            item["id"] for item in _items(_search(client, couple, type=["HEART_MOMENT"]))
        }
        assert heart_id not in partner_after
        assert heart_id in owner_after

    def test_foreign_space_search_requires_membership(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        response = client.get(
            f"/api/v1/spaces/{couple['foreign_space'].id}/search",
            params={"q": "needle"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404


class TestSearchRequestContract:
    def test_type_filter_is_repeatable_and_canonical_for_cursor(
        self, client, session, couple
    ) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        first = _search(
            client,
            couple,
            type=["MEMORY", "WISH", "MEMORY"],
            limit=1,
            q="  needle  ",
        )
        assert first.status_code == 200, first.text
        cursor = first.json()["nextCursor"]
        assert cursor is not None

        second = _search(
            client,
            couple,
            type=["WISH", "MEMORY"],
            limit=10,
            cursor=cursor,
            q="needle",
        )
        assert second.status_code == 200, second.text

    def test_cursor_is_bound_to_account(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        first = _search(client, couple, type=["MEMORY", "WISH"], limit=1)
        cursor = first.json()["nextCursor"]
        assert cursor is not None

        response = _search(
            client,
            couple,
            token=couple["token_b"],
            type=["MEMORY", "WISH"],
            limit=1,
            cursor=cursor,
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_cursor_is_bound_to_query_and_filters(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        cursor = _search(client, couple, type=["MEMORY", "WISH"], limit=1).json()["nextCursor"]
        assert cursor is not None

        changed_query = _search(
            client,
            couple,
            q="memory",
            type=["MEMORY", "WISH"],
            cursor=cursor,
        )
        changed_filter = _search(
            client,
            couple,
            type=["MEMORY"],
            cursor=cursor,
        )
        assert changed_query.status_code == 400
        assert changed_filter.status_code == 400

    def test_tampered_cursor_is_rejected(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        cursor = _search(client, couple, limit=1).json()["nextCursor"]
        assert cursor is not None
        response = _search(client, couple, cursor=cursor[:-2] + "xy")
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_invalid_normalized_query_uses_stable_error_without_echo(
        self, client, couple, caplog
    ) -> None:  # type: ignore[no-untyped-def]
        secret = "private-search-secret-" + "x" * 200
        response = _search(client, couple, q=secret)
        assert response.status_code == 422
        assert response.json()["code"] == "SEARCH_QUERY_INVALID"
        assert secret not in response.text
        assert secret not in caplog.text

    def test_successful_query_never_reaches_access_or_application_logs(
        self, client, session, couple, caplog
    ) -> None:  # type: ignore[no-untyped-def]
        # A valid (200) Search request is the common case, and the one most
        # likely to actually contain OWNER_ONLY-derived text: unlike the
        # rejected-query test above, this one drives the request through the
        # real ASGI middleware stack (RequestLoggingMiddleware included), not
        # only the application's own error handling.
        import logging

        _seed_all_targets(session, couple)
        canary = "private-heart-moment-canary-" + "y" * 40

        with caplog.at_level(logging.INFO, logger="eimir.access"):
            response = _search(client, couple, q=canary)

        assert response.status_code == 200
        assert canary not in response.text
        assert canary not in caplog.text

    def test_response_is_not_cacheable(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        _seed_all_targets(session, couple)
        response = _search(client, couple)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"


class TestSearchPersistenceAndIndex:
    def test_rollback_removes_uncommitted_search_content(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        nested = session.begin_nested()
        temporary = Memory(
            **_shared(couple, couple["anna"].id),
            happened_on=date(2025, 6, 1),
            payload=MemoryPayload(title="Rollback needle", body="rollback needle"),
        )
        session.add(temporary)
        session.flush()
        temporary_id = str(temporary.id)
        assert temporary_id in {item["id"] for item in _items(_search(client, couple))}

        nested.rollback()
        assert temporary_id not in {item["id"] for item in _items(_search(client, couple))}

    def test_gift_url_is_not_a_search_lexeme(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        seeded = _seed_all_targets(session, couple)
        response = _search(client, couple, q="not-indexed", type=["GIFT_IDEA"])
        assert str(seeded["gift"].id) not in {item["id"] for item in _items(response)}
