"""Concurrency around typed content relations.

M3-D26 defines the lock order: parent first, target second. Every test here
verifies both that two concurrent requests reach a domain outcome instead of a
deadlock or 500, and that the final state violates none of the guarantees from
M3-D09.

The most important case is the last one: Relation creation against a
HeartMoment privacy transition. Exactly two final states are allowed: shared
with a relation, or private without a relation. The third state, private with a
relation, would prove the existence of private content to the partner and must
not occur under any transaction interleaving.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.core.errors import DomainError
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.relations import service as relation_service
from eimir.relations.models import PlaceHeartMoment, PlaceMemory
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

TODAY = date(2026, 8, 27)


def _setup(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        token = sign_in(session, anna)
        space_id = space.id
        anna_id = anna.id
        ben_id = ben.id

    headers = auth(token)
    place = client.post(
        f"/api/v1/spaces/{space_id}/places",
        json={"name": "Unser Cafe"},
        headers=headers,
    )
    assert place.status_code == 201
    memory = client.post(
        f"/api/v1/spaces/{space_id}/memories",
        json={"title": "Erster Abend", "body": "Es regnete."},
        headers=headers,
    )
    assert memory.status_code == 201
    heart_moment = client.post(
        f"/api/v1/spaces/{space_id}/heart-moments",
        json={
            "text": "Danke fuer heute.",
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": TODAY.isoformat(),
        },
        headers=headers,
    )
    assert heart_moment.status_code == 201

    return {
        "maker": maker,
        "space_id": space_id,
        "anna": AuthorizationContext(account_id=anna_id, space_id=space_id),
        "ben": AuthorizationContext(account_id=ben_id, space_id=space_id),
        "place_id": UUID(place.json()["id"]),
        "memory_id": UUID(memory.json()["id"]),
        "heart_moment_id": UUID(heart_moment.json()["id"]),
    }


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


def _count(maker, model) -> int:  # type: ignore[no-untyped-def]
    with maker() as session:
        return session.execute(select(func.count()).select_from(model)).scalar_one()


def test_parent_delete_against_relation_create(production_client) -> None:  # type: ignore[no-untyped-def]
    """The Place disappears while another request links content to it.

    Both operations lock the Place first. One therefore waits instead of both
    waiting for each other. The waiting operation then revalidates and either
    finds the Place gone or links to a Place that still exists. No transaction
    order may create an orphaned join row.
    """
    world = _setup(production_client)
    maker = world["maker"]

    def delete():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            place_service.delete_place(
                session,
                world["anna"],
                world["place_id"],
                expected_version=1,
            )
            return "DELETED"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["place_id"],
                world["memory_id"],
                relation_service.PLACE_MEMORIES,
            )
            return "LINKED"

    results = set(_concurrently(delete, link))
    assert results <= {
        "DELETED",
        "LINKED",
        "PLACE_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        place = verification.get(Place, world["place_id"])
        memory = verification.get(Memory, world["memory_id"])

    # The Memory survives in every case because it is an original resource.
    assert memory is not None

    if place is None:
        assert _count(maker, PlaceMemory) == 0
    else:
        assert "LINKED" in results
        assert _count(maker, PlaceMemory) == 1


def test_target_delete_against_relation_create(production_client) -> None:  # type: ignore[no-untyped-def]
    """The target disappears while another request creates a reference.

    Creation holds the target with `FOR SHARE`; deletion requires the exclusive
    lock and waits. If deletion wins first, creation subsequently finds no
    target and returns 404 rather than leaking a database foreign-key error.
    """
    world = _setup(production_client)
    maker = world["maker"]

    def delete():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            from eimir.memories import service as memory_service

            memory_service.delete_memory(
                session,
                world["anna"],
                world["memory_id"],
                expected_version=1,
            )
            return "DELETED"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["place_id"],
                world["memory_id"],
                relation_service.PLACE_MEMORIES,
            )
            return "LINKED"

    results = set(_concurrently(delete, link))
    assert results <= {
        "DELETED",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        memory = verification.get(Memory, world["memory_id"])

    if memory is None:
        assert _count(maker, PlaceMemory) == 0
    else:
        assert _count(maker, PlaceMemory) == 1


def test_two_identical_creates_produce_one_row(production_client) -> None:  # type: ignore[no-untyped-def]
    """Both partners tap the same button concurrently.

    There is no conflict, no error, and exactly one row. The primary key plus
    `ON CONFLICT DO NOTHING` provides this guarantee; a preceding `SELECT`
    would create exactly the race window exercised here.
    """
    world = _setup(production_client)
    maker = world["maker"]

    def link(context):  # type: ignore[no-untyped-def]
        def run():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                relation_service.link(
                    session,
                    context,
                    world["place_id"],
                    world["memory_id"],
                    relation_service.PLACE_MEMORIES,
                )
                return "LINKED"

        return run

    results = set(_concurrently(link(world["anna"]), link(world["ben"])))
    assert results == {"LINKED"}
    assert _count(maker, PlaceMemory) == 1


def test_privacy_transition_against_relation_create_never_leaks(  # type: ignore[no-untyped-def]
    production_client,
) -> None:
    """The central race for this slice (M3-D09, M3-D26).

    Exactly two final states are valid:

    - the HeartMoment is shared and the relation exists;
    - the HeartMoment is private and the relation does not exist.

    The third state, private with a relation, would prove to the partner that
    the HeartMoment exists even though it is unreadable. No interleaving of the
    two transactions may produce that state.
    """
    world = _setup(production_client)
    maker = world["maker"]

    def make_private():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            heart_moment_service.change_visibility(
                session,
                world["anna"],
                world["heart_moment_id"],
                expected_version=1,
                visibility=ContentVisibility.PRIVATE,
            )
            return "PRIVATE"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["place_id"],
                world["heart_moment_id"],
                relation_service.PLACE_HEART_MOMENTS,
            )
            return "LINKED"

    results = set(_concurrently(make_private, link))

    # No deadlock and no constraint error escapes: both sides report a domain
    # result.
    assert results <= {
        "PRIVATE",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        heart_moment = verification.get(HeartMoment, world["heart_moment_id"])
        assert heart_moment is not None
        is_private = heart_moment.privacy_class == "OWNER_ONLY"

    relations = _count(maker, PlaceHeartMoment)

    if is_private:
        assert relations == 0, "private HeartMoment retained a shared relation"
    else:
        assert relations == 1


def test_privacy_transition_against_create_in_reverse_order(  # type: ignore[no-untyped-def]
    production_client,
) -> None:
    """The same guarantee when the relation already exists.

    The join row exists before the race. The transition must remove it while a
    second create concurrently tries to restore it. This still may not end in
    the invalid state "private with relation".
    """
    world = _setup(production_client)
    maker = world["maker"]

    with maker.begin() as session:
        relation_service.link(
            session,
            world["anna"],
            world["place_id"],
            world["heart_moment_id"],
            relation_service.PLACE_HEART_MOMENTS,
        )
    assert _count(maker, PlaceHeartMoment) == 1

    def make_private():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            heart_moment_service.change_visibility(
                session,
                world["anna"],
                world["heart_moment_id"],
                expected_version=1,
                visibility=ContentVisibility.PRIVATE,
            )
            return "PRIVATE"

    def relink():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["place_id"],
                world["heart_moment_id"],
                relation_service.PLACE_HEART_MOMENTS,
            )
            return "LINKED"

    results = set(_concurrently(make_private, relink))
    assert results <= {
        "PRIVATE",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        heart_moment = verification.get(HeartMoment, world["heart_moment_id"])
        assert heart_moment is not None
        is_private = heart_moment.privacy_class == "OWNER_ONLY"

    if is_private:
        assert _count(maker, PlaceHeartMoment) == 0
