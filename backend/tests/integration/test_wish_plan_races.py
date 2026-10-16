"""Exercise PostgreSQL races and rollbacks in the Wish-to-Plan lifecycle.

The guarantee from M3-D02 is strict: no race may leave a `PLANNED` Wish
without its originating Plan or create a second originating Plan. These tests
reproduce that behavior with concurrent transactions against the same database
rather than with mocks.

Each test verifies both that the calls return an allowed result and that the
final state is one of the permitted outcomes. Checking only the responses could
otherwise let a partial lifecycle pass as long as the diagnostics looked
plausible.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.core.clock import today_in
from eimir.core.errors import DomainError
from eimir.identity.models import Account
from eimir.plans import service as plan_service
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.wishes import service as wish_service
from eimir.wishes.models import Wish, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ZONE = "Europe/Berlin"


def _yesterday() -> object:
    return today_in(ZONE) - timedelta(days=1)


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

    response = client.post(
        f"/api/v1/spaces/{space_id}/wishes",
        json={"title": "Nordlichter sehen"},
        headers=auth(token),
    )
    assert response.status_code == 201
    return {
        "client": client,
        "maker": maker,
        "space_id": space_id,
        "anna": AuthorizationContext(account_id=anna_id, space_id=space_id),
        "ben": AuthorizationContext(account_id=ben_id, space_id=space_id),
        "wish_id": UUID(response.json()["id"]),
    }


def _token(world) -> str:  # type: ignore[no-untyped-def]
    """Issue a fresh access token for the HTTP path."""
    with world["maker"].begin() as session:
        account = session.get(Account, world["anna"].account_id)
        return sign_in(session, account)


def _result(fn):  # type: ignore[no-untyped-def]
    """Reduce a service call to its domain-level result."""
    try:
        return fn()
    except DomainError as error:
        return error.code


def _concurrently(first, second):  # type: ignore[no-untyped-def]
    """Start two calls as close together as possible."""
    gate = Barrier(2, timeout=10)

    def run(fn):  # type: ignore[no-untyped-def]
        gate.wait()
        return _result(fn)

    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(run, first)
        b = pool.submit(run, second)
        return a.result(timeout=20), b.result(timeout=20)


class TestConcurrentConvert:
    def test_two_concurrent_conversions_create_exactly_one_plan(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def convert(context: AuthorizationContext):  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                result = plan_service.convert_wish_to_plan(
                    session,
                    context,
                    world["wish_id"],
                    expected_version=1,
                    title=None,
                    description=None,
                    place_id=None,
                )
                return "CREATED" if result.created else f"RETRY:{result.plan.id}"

        first, second = _concurrently(
            lambda: convert(world["anna"]),
            lambda: convert(world["ben"]),
        )

        # One call creates the Plan and the other receives the same Plan
        # idempotently. Two `CREATED` results would mean two Plans.
        assert sorted([first.split(":")[0], second.split(":")[0]]) == ["CREATED", "RETRY"]

        with maker() as verification:
            plans = list(verification.execute(select(Plan)).scalars())
            wish = verification.get(Wish, world["wish_id"])
        assert len(plans) == 1
        assert plans[0].source_wish_id == world["wish_id"]
        assert wish.status == WishStatus.PLANNED.value

    def test_waiting_convert_gets_completed_plan(self, production_client) -> None:  # type: ignore[no-untyped-def]
        """Exercise the same race with a forced execution order.

        A blocker holds the Wish lock while the conversion is already running.
        The conversion may continue only after the lock is released and must
        then observe the existing Plan instead of creating a second one.
        """
        world = _setup(production_client)
        maker = world["maker"]

        blocker = maker()
        transaction = blocker.begin()
        wish = blocker.execute(
            select(Wish).where(Wish.id == world["wish_id"]).with_for_update()
        ).scalar_one()
        # The blocker performs the conversion while holding its own lock.
        plan = Plan(
            space_id=world["space_id"],
            owner_id=world["anna"].account_id,
            privacy_class="SPACE_SHARED",
            status=PlanStatus.IDEA.value,
            source_wish_id=wish.id,
            payload=plan_service.PlanPayload(title="Vom Blocker"),
        )
        blocker.add(plan)
        wish.status = WishStatus.PLANNED.value
        blocker.flush()
        blocked_plan = plan.id

        def convert():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                result = plan_service.convert_wish_to_plan(
                    session,
                    world["ben"],
                    world["wish_id"],
                    expected_version=1,
                    title=None,
                    description=None,
                    place_id=None,
                )
                return "CREATED" if result.created else str(result.plan.id)

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(_result, convert)
                transaction.commit()
                assert future.result(timeout=10) == str(blocked_plan)
        finally:
            if transaction.is_active:
                transaction.rollback()
            blocker.close()

        with maker() as verification:
            assert len(list(verification.execute(select(Plan)).scalars())) == 1


class TestRollback:
    def test_error_after_plan_insert_leaves_no_plan(self, production_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """Fail exactly between the two mutations.

        The Plan has been inserted but the Wish transition has not run yet. If
        anything survives the rollback, an originating Plan would be attached
        to a Wish that is still `OPEN`.
        """
        world = _setup(production_client)
        client = world["client"]

        def fail(*args: object, **kwargs: object) -> None:
            raise RuntimeError("Failure between Plan insert and Wish transition")

        monkeypatch.setattr(wish_service, "plan_created", fail)

        token = _token(world)
        response = client.post(
            f"/api/v1/spaces/{world['space_id']}/wishes/{world['wish_id']}/plan",
            json={},
            headers={"Authorization": f"Bearer {token}", "If-Match": '"1"'},
        )
        assert response.status_code == 500

        with world["maker"]() as verification:
            assert list(verification.execute(select(Plan)).scalars()) == []
            assert verification.get(Wish, world["wish_id"]).status == WishStatus.OPEN.value

    def test_error_after_plan_completion_leaves_no_partial_state(
        self, production_client, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        with maker.begin() as session:
            result = plan_service.convert_wish_to_plan(
                session,
                world["anna"],
                world["wish_id"],
                expected_version=1,
                title=None,
                description=None,
                place_id=None,
            )
            plan_id = result.plan.id

        def fail(*args: object, **kwargs: object) -> None:
            raise RuntimeError("Failure between Plan and Wish completion")

        monkeypatch.setattr(wish_service, "plan_completed", fail)

        with pytest.raises(RuntimeError), maker.begin() as session:
            plan_service.complete_plan(
                session,
                world["anna"],
                plan_id,
                expected_version=1,
                experienced_on=_yesterday(),
            )

        with maker() as verification:
            plan = verification.get(Plan, plan_id)
            wish = verification.get(Wish, world["wish_id"])
        assert plan.status == PlanStatus.IDEA.value
        assert plan.experienced_on is None
        assert wish.status == WishStatus.PLANNED.value


class TestDeleteAgainstLifecycle:
    def test_delete_wish_against_convert_ends_consistently(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        def delete():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                wish_service.delete_wish(
                    session, world["anna"], world["wish_id"], expected_version=1
                )
                return "DELETED"

        def convert():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                plan_service.convert_wish_to_plan(
                    session,
                    world["ben"],
                    world["wish_id"],
                    expected_version=1,
                    title=None,
                    description=None,
                    place_id=None,
                )
                return "CONVERTED"

        results = set(_concurrently(delete, convert))

        with maker() as verification:
            wish = verification.get(Wish, world["wish_id"])
            plans = list(verification.execute(select(Plan)).scalars())

        if wish is None:
            # Delete won the race. No Plan may refer to a Wish that no longer
            # exists.
            assert plans == []
            assert results == {"DELETED", "WISH_NOT_FOUND"}
        else:
            # Convert won the race. The Wish keeps its Plan and Delete fails
            # at the version check: Convert raised the Wish version to 2 while
            # Delete still supplied 1. The version check precedes the delete
            # matrix so a stale client cannot learn about the newly created
            # Plan through a domain-specific delete error.
            assert wish.status == WishStatus.PLANNED.value
            assert len(plans) == 1
            assert results == {"CONVERTED", "RESOURCE_VERSION_CONFLICT"}

    def test_complete_against_return_leaves_no_partial_lifecycle(self, production_client) -> None:  # type: ignore[no-untyped-def]
        world = _setup(production_client)
        maker = world["maker"]

        with maker.begin() as session:
            result = plan_service.convert_wish_to_plan(
                session,
                world["anna"],
                world["wish_id"],
                expected_version=1,
                title=None,
                description=None,
                place_id=None,
            )
            plan_id = result.plan.id

        def complete():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                plan_service.complete_plan(
                    session,
                    world["anna"],
                    plan_id,
                    expected_version=1,
                    experienced_on=_yesterday(),
                )
                return "COMPLETED"

        def return_to_wish():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                plan_service.return_to_wish(session, world["ben"], plan_id, expected_version=1)
                return "RETURNED"

        results = set(_concurrently(complete, return_to_wish))

        with maker() as verification:
            plan = verification.get(Plan, plan_id)
            wish = verification.get(Wish, world["wish_id"])

        if plan is None:
            # Returned to Wish: the Wish is open again and no completed Plan
            # remains alongside it.
            assert wish.status == WishStatus.OPEN.value
            assert "RETURNED" in results
        else:
            # Completed: both sides consistently report COMPLETED.
            assert plan.status == PlanStatus.COMPLETED.value
            assert wish.status == WishStatus.COMPLETED.value
            assert "COMPLETED" in results

        # A completed Plan may never remain next to an open Wish.
        assert not (plan is not None and wish.status == WishStatus.OPEN.value)
