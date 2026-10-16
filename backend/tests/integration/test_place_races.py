"""Concurrency around Place deletion and Plan assignment.

The canonical lock order in the M3 core is `Place -> Wish -> Plan`. The Plan is
always locked last. If an operation locked the Place after the Plan, two
requests could block each other and PostgreSQL would abort one with a deadlock,
turning a normal domain operation into a 500.

The suite therefore verifies both that concurrent calls reach an allowed
outcome and that the final state never contains a Plan pointing at a deleted
Place.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.core.errors import DomainError
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.plans import service as plan_service
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


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

    place = client.post(
        f"/api/v1/spaces/{space_id}/places",
        json={"name": "Unser Cafe", "latitude": 52.520008, "longitude": 13.404954},
        headers=auth(token),
    )
    assert place.status_code == 201
    plan = client.post(
        f"/api/v1/spaces/{space_id}/plans",
        json={"title": "Abendessen"},
        headers=auth(token),
    )
    assert plan.status_code == 201

    return {
        "maker": maker,
        "space_id": space_id,
        "anna": AuthorizationContext(account_id=anna_id, space_id=space_id),
        "ben": AuthorizationContext(account_id=ben_id, space_id=space_id),
        "place_id": UUID(place.json()["id"]),
        "plan_id": UUID(plan.json()["id"]),
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


def test_place_delete_against_plan_assignment_ends_consistently(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    """This case would deadlock under the opposite lock order.

    One request deletes the Place and locks Place then Plan. The other assigns
    that exact Place to the Plan and also locks Place then Plan. With the same
    order one request waits rather than both waiting for each other.
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

    def assign():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            plan_service.update_plan(
                session,
                world["ben"],
                world["plan_id"],
                expected_version=1,
                changed_fields=frozenset({"place_id"}),
                title=None,
                description=None,
                place_id=world["place_id"],
                experienced_on=None,
            )
            return "ASSIGNED"

    results = set(_concurrently(delete, assign))

    with maker() as verification:
        place = verification.get(Place, world["place_id"])
        plan = verification.get(Plan, world["plan_id"])

    # No deadlock and no 500: both sides report a domain result.
    assert results <= {
        "DELETED",
        "ASSIGNED",
        "PLACE_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    if place is None:
        # The Place is gone. No Plan may still point at it, regardless of
        # whether assignment happened before or after deletion.
        assert plan.place_id is None
    else:
        assert "ASSIGNED" in results
        assert plan.place_id == world["place_id"]


def test_two_plans_may_assign_same_place_concurrently(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    """The read lock on the Place preserves existence, not write ownership.

    `FOR UPDATE` instead of `FOR SHARE` would make one request wait
    unnecessarily and serialize many Plans around a popular Place without a
    domain reason.
    """
    world = _setup(production_client)
    maker = world["maker"]

    with maker.begin() as session:
        second = plan_service.create_plan(
            session,
            world["anna"],
            title="Fruehstueck",
            description=None,
            place_id=None,
        )
        second_id = second.id

    def assign(plan_id):  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            plan_service.update_plan(
                session,
                world["anna"],
                plan_id,
                expected_version=1,
                changed_fields=frozenset({"place_id"}),
                title=None,
                description=None,
                place_id=world["place_id"],
                experienced_on=None,
            )
            return "ASSIGNED"

    results = _concurrently(
        lambda: assign(world["plan_id"]),
        lambda: assign(second_id),
    )
    assert set(results) == {"ASSIGNED"}

    with maker() as verification:
        plans = list(verification.execute(select(Plan)).scalars())
    assert {plan.place_id for plan in plans} == {world["place_id"]}


def test_deleted_place_is_not_assigned_again(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    """Forced order: deletion wins and assignment waits."""
    world = _setup(production_client)
    maker = world["maker"]

    blocker = maker()
    transaction = blocker.begin()
    place = blocker.execute(
        select(Place).where(Place.id == world["place_id"]).with_for_update()
    ).scalar_one()
    blocker.delete(place)
    blocker.flush()

    def assign():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            plan_service.update_plan(
                session,
                world["ben"],
                world["plan_id"],
                expected_version=1,
                changed_fields=frozenset({"place_id"}),
                title=None,
                description=None,
                place_id=world["place_id"],
                experienced_on=None,
            )
            return "ASSIGNED"

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_result, assign)
            transaction.commit()
            assert future.result(timeout=10) == "PLACE_NOT_FOUND"
    finally:
        if transaction.is_active:
            transaction.rollback()
        blocker.close()

    with maker() as verification:
        assert verification.get(Plan, world["plan_id"]).place_id is None
