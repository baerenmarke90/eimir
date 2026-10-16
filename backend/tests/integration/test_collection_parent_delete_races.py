"""Real PostgreSQL parent-delete races required by the M3 security matrix."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.collections import service as collection_service
from eimir.collections.models import Collection, CollectionItem
from eimir.core.errors import DomainError
from eimir.private_collections import service as private_collection_service
from eimir.private_collections.models import PrivateCollection, PrivateCollectionItem
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _concurrently(first, second):  # type: ignore[no-untyped-def]
    gate = Barrier(2, timeout=10)

    def run(fn):  # type: ignore[no-untyped-def]
        gate.wait()
        try:
            return fn()
        except DomainError as error:
            return f"ERROR:{error.code}"

    with ThreadPoolExecutor(max_workers=2) as pool:
        first_result = pool.submit(run, first)
        second_result = pool.submit(run, second)
        return first_result.result(timeout=20), second_result.result(timeout=20)


def _shared_world(production_client):  # type: ignore[no-untyped-def]
    _client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Shared Anna")
        ben = make_account(session, "Shared Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        anna_context = AuthorizationContext(anna.id, space.id)
        ben_context = AuthorizationContext(ben.id, space.id)
        collection = collection_service.create_collection(
            session,
            anna_context,
            title="Shared delete race",
        )
        first = collection_service.create_item(
            session,
            anna_context,
            collection.id,
            title="First",
            completed=False,
        )
        second = collection_service.create_item(
            session,
            ben_context,
            collection.id,
            title="Second",
            completed=False,
        )
        return {
            "maker": maker,
            "anna": anna_context,
            "ben": ben_context,
            "collection_id": collection.id,
            "first_id": first.id,
            "second_id": second.id,
        }


def _private_world(production_client):  # type: ignore[no-untyped-def]
    _client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Private Anna")
        ben = make_account(session, "Private Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        owner = AuthorizationContext(anna.id, space.id)
        collection = private_collection_service.create_collection(
            session,
            owner,
            title="Private delete race",
        )
        first = private_collection_service.create_item(
            session,
            owner,
            collection.id,
            title="First private",
            completed=False,
        )
        second = private_collection_service.create_item(
            session,
            owner,
            collection.id,
            title="Second private",
            completed=False,
        )
        return {
            "maker": maker,
            "owner": owner,
            "collection_id": collection.id,
            "first_id": first.id,
            "second_id": second.id,
        }


def _shared_state(world):  # type: ignore[no-untyped-def]
    with world["maker"]() as session:
        collection = session.get(Collection, world["collection_id"])
        items = list(
            session.execute(
                select(CollectionItem)
                .where(CollectionItem.collection_id == world["collection_id"])
                .order_by(CollectionItem.position)
            ).scalars()
        )
        return collection, items


def _private_state(world):  # type: ignore[no-untyped-def]
    with world["maker"]() as session:
        collection = session.get(PrivateCollection, world["collection_id"])
        items = list(
            session.execute(
                select(PrivateCollectionItem)
                .where(PrivateCollectionItem.collection_id == world["collection_id"])
                .order_by(PrivateCollectionItem.position)
            ).scalars()
        )
        return collection, items


def _assert_contiguous(items) -> None:  # type: ignore[no-untyped-def]
    assert [item.position for item in items] == list(range(len(items)))
    assert len({item.id for item in items}) == len(items)


def _assert_exactly_one_success(results: tuple[str, str], *successes: str) -> str:
    successful = [result for result in results if result in successes]
    assert len(successful) == 1, results
    assert any(result.startswith("ERROR:") for result in results), results
    return successful[0]


class TestSharedCollectionParentDeleteRaces:
    def test_parent_delete_vs_item_create_has_no_orphan_or_partial_aggregate(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        world = _shared_world(production_client)
        maker = world["maker"]

        def delete_parent() -> str:
            with maker.begin() as session:
                collection_service.delete_collection(
                    session,
                    world["anna"],
                    world["collection_id"],
                    expected_version=3,
                )
                return "DELETED"

        def create_item() -> str:
            with maker.begin() as session:
                collection_service.create_item(
                    session,
                    world["ben"],
                    world["collection_id"],
                    title="Concurrent third",
                    completed=False,
                )
                return "CREATED"

        results = _concurrently(delete_parent, create_item)
        winner = _assert_exactly_one_success(results, "DELETED", "CREATED")
        collection, items = _shared_state(world)

        if winner == "DELETED":
            assert collection is None
            assert items == []
        else:
            assert collection is not None
            assert collection.version == 4
            assert len(items) == 3
            _assert_contiguous(items)

    def test_parent_delete_vs_reorder_has_no_orphan_or_invalid_order(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        world = _shared_world(production_client)
        maker = world["maker"]

        def delete_parent() -> str:
            with maker.begin() as session:
                collection_service.delete_collection(
                    session,
                    world["ben"],
                    world["collection_id"],
                    expected_version=3,
                )
                return "DELETED"

        def reorder() -> str:
            with maker.begin() as session:
                collection_service.reorder_items(
                    session,
                    world["anna"],
                    world["collection_id"],
                    expected_version=3,
                    item_ids=[world["second_id"], world["first_id"]],
                )
                return "REORDERED"

        results = _concurrently(delete_parent, reorder)
        winner = _assert_exactly_one_success(results, "DELETED", "REORDERED")
        collection, items = _shared_state(world)

        if winner == "DELETED":
            assert collection is None
            assert items == []
        else:
            assert collection is not None
            assert collection.version == 4
            assert [item.id for item in items] == [world["second_id"], world["first_id"]]
            _assert_contiguous(items)


class TestPrivateCollectionParentDeleteRaces:
    def test_parent_delete_vs_item_create_has_no_orphan_or_partial_aggregate(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        world = _private_world(production_client)
        maker = world["maker"]

        def delete_parent() -> str:
            with maker.begin() as session:
                private_collection_service.delete_collection(
                    session,
                    world["owner"],
                    world["collection_id"],
                    expected_version=3,
                )
                return "DELETED"

        def create_item() -> str:
            with maker.begin() as session:
                private_collection_service.create_item(
                    session,
                    world["owner"],
                    world["collection_id"],
                    title="Concurrent private third",
                    completed=False,
                )
                return "CREATED"

        results = _concurrently(delete_parent, create_item)
        winner = _assert_exactly_one_success(results, "DELETED", "CREATED")
        collection, items = _private_state(world)

        if winner == "DELETED":
            assert collection is None
            assert items == []
        else:
            assert collection is not None
            assert collection.version == 4
            assert len(items) == 3
            _assert_contiguous(items)

    def test_parent_delete_vs_reorder_has_no_orphan_or_invalid_order(
        self, production_client
    ) -> None:  # type: ignore[no-untyped-def]
        world = _private_world(production_client)
        maker = world["maker"]

        def delete_parent() -> str:
            with maker.begin() as session:
                private_collection_service.delete_collection(
                    session,
                    world["owner"],
                    world["collection_id"],
                    expected_version=3,
                )
                return "DELETED"

        def reorder() -> str:
            with maker.begin() as session:
                private_collection_service.reorder_items(
                    session,
                    world["owner"],
                    world["collection_id"],
                    expected_version=3,
                    item_ids=[world["second_id"], world["first_id"]],
                )
                return "REORDERED"

        results = _concurrently(delete_parent, reorder)
        winner = _assert_exactly_one_success(results, "DELETED", "REORDERED")
        collection, items = _private_state(world)

        if winner == "DELETED":
            assert collection is None
            assert items == []
        else:
            assert collection is not None
            assert collection.version == 4
            assert [item.id for item in items] == [world["second_id"], world["first_id"]]
            _assert_contiguous(items)
