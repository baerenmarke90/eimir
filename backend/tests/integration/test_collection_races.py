"""Exercise real PostgreSQL races for M3-S6 Collection structure and Items."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.collections import service
from eimir.collections.models import Collection, CollectionItem
from eimir.core.errors import DomainError
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _setup(production_client):  # type: ignore[no-untyped-def]
    _client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        anna_context = AuthorizationContext(anna.id, space.id)
        ben_context = AuthorizationContext(ben.id, space.id)
        collection = service.create_collection(
            session,
            anna_context,
            title="Race list",
        )
        first = service.create_item(
            session,
            anna_context,
            collection.id,
            title="First",
            completed=False,
        )
        second = service.create_item(
            session,
            ben_context,
            collection.id,
            title="Second",
            completed=False,
        )
        world = {
            "maker": maker,
            "space_id": space.id,
            "anna": anna_context,
            "ben": ben_context,
            "collection_id": collection.id,
            "first_id": first.id,
            "second_id": second.id,
        }
    return world


def _result(fn):  # type: ignore[no-untyped-def]
    try:
        return fn()
    except DomainError as error:
        return error.code


def _concurrently(first, second):  # type: ignore[no-untyped-def]
    gate = Barrier(2, timeout=10)

    def run(fn):  # type: ignore[no-untyped-def]
        gate.wait()
        return _result(fn)

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(run, first)
        b = pool.submit(run, second)
        return a.result(timeout=20), b.result(timeout=20)


def _state(world):  # type: ignore[no-untyped-def]
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


def _assert_contiguous(items: list[CollectionItem]) -> None:
    assert [item.position for item in items] == list(range(len(items)))
    assert len({item.id for item in items}) == len(items)


class TestCollectionOrderRaces:
    def test_two_parallel_reorders_have_exactly_one_winner(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def reorder(context: AuthorizationContext, order: list):  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                result = service.reorder_items(
                    session,
                    context,
                    world["collection_id"],
                    expected_version=3,
                    item_ids=order,
                )
                return f"REORDERED:{result.version}"

        first, second = _concurrently(
            lambda: reorder(world["anna"], [world["second_id"], world["first_id"]]),
            lambda: reorder(world["ben"], [world["first_id"], world["second_id"]]),
        )
        results = [first, second]
        assert results.count("COLLECTION_ORDER_CONFLICT") == 1
        assert sum(result == "REORDERED:4" for result in results) == 1

        collection, items = _state(world)
        assert collection.version == 4
        _assert_contiguous(items)
        assert {item.id for item in items} == {world["first_id"], world["second_id"]}
        # Reordering aggregate structure must not consume Item content versions.
        assert [item.version for item in items] == [1, 1]

    def test_reorder_against_create_is_serialized_by_root_version(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def reorder():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                service.reorder_items(
                    session,
                    world["anna"],
                    world["collection_id"],
                    expected_version=3,
                    item_ids=[world["second_id"], world["first_id"]],
                )
                return "REORDERED"

        def create():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                item = service.create_item(
                    session,
                    world["ben"],
                    world["collection_id"],
                    title="Third",
                    completed=False,
                )
                return f"CREATED:{item.id}"

        first, second = _concurrently(reorder, create)
        results = {first.split(":")[0], second.split(":")[0]}
        assert results in (
            {"REORDERED", "CREATED"},
            {"COLLECTION_ORDER_CONFLICT", "CREATED"},
        )

        collection, items = _state(world)
        assert collection.version in (4, 5)
        assert len(items) == 3
        _assert_contiguous(items)

    def test_reorder_against_delete_never_leaves_a_position_gap(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def reorder():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                service.reorder_items(
                    session,
                    world["anna"],
                    world["collection_id"],
                    expected_version=3,
                    item_ids=[world["second_id"], world["first_id"]],
                )
                return "REORDERED"

        def delete():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                service.delete_item(
                    session,
                    world["ben"],
                    world["collection_id"],
                    world["first_id"],
                    expected_version=1,
                )
                return "DELETED"

        results = set(_concurrently(reorder, delete))
        assert "DELETED" in results
        assert results in (
            {"DELETED", "REORDERED"},
            {"DELETED", "COLLECTION_ORDER_CONFLICT"},
        )

        collection, items = _state(world)
        assert collection.version in (4, 5)
        assert [item.id for item in items] == [world["second_id"]]
        _assert_contiguous(items)
        assert items[0].version == 1

    def test_reorder_and_completion_keep_independent_versions(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def reorder():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                service.reorder_items(
                    session,
                    world["anna"],
                    world["collection_id"],
                    expected_version=3,
                    item_ids=[world["second_id"], world["first_id"]],
                )
                return "REORDERED"

        def complete():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                item = service.update_item(
                    session,
                    world["ben"],
                    world["collection_id"],
                    world["first_id"],
                    expected_version=1,
                    changed_fields=frozenset({"completed"}),
                    title=None,
                    completed=True,
                )
                return f"COMPLETED:{item.version}"

        results = set(_concurrently(reorder, complete))
        assert results == {"REORDERED", "COMPLETED:2"}

        collection, items = _state(world)
        assert collection.version == 4
        _assert_contiguous(items)
        by_id = {item.id: item for item in items}
        assert by_id[world["first_id"]].completed is True
        assert by_id[world["first_id"]].version == 2
        assert by_id[world["second_id"]].version == 1
