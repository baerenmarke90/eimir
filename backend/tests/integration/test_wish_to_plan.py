"""The Wish-to-Plan lifecycle from M3-D02, M3-D03, and M3-D05.

Everything here touches two aggregates at the same time. The recurring proof is
therefore not merely that an operation does something, but that it leaves no
partial lifecycle: no second Plan, no `PLANNED` Wish without a Plan, and no
completed Plan next to an open Wish.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import today_in
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ZONE = "Europe/Berlin"


def yesterday() -> str:
    return (today_in(ZONE) - timedelta(days=1)).isoformat()


def wishes(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/wishes"


def plans(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/plans"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def wish(  # type: ignore[no-untyped-def]
    client,
    pair,
    *,
    title: str = "Nordlichter sehen",
) -> dict[str, Any]:
    response = client.post(
        wishes(pair["space"].id),
        json={"title": title},
        headers=auth(pair["token_a"]),
    )
    assert response.status_code == 201
    return response.json()


def convert(  # type: ignore[no-untyped-def]
    client,
    pair,
    wish_id: str,
    *,
    version: int = 1,
    token_key: str = "token_a",
    **fields,
):
    return client.post(
        f"{wishes(pair['space'].id)}/{wish_id}/plan",
        json=dict(fields),
        headers=if_match(pair[token_key], version),
    )


def action(  # type: ignore[no-untyped-def]
    client,
    pair,
    plan_id: str,
    name: str,
    version: int,
    json: dict[str, Any] | None = None,
    token_key: str = "token_a",
):
    return client.post(
        f"{plans(pair['space'].id)}/{plan_id}/{name}",
        json=json if json is not None else {},
        headers=if_match(pair[token_key], version),
    )


class TestExistingPlanWishLink:
    @pytest.mark.parametrize("token_key", ["token_a", "token_b"])
    def test_link_preserves_plan_and_completes_wish(self, client, pair, session, token_key):  # type: ignore[no-untyped-def]
        desired = wish(client, pair, title="A weekend away")
        created = client.post(
            plans(pair["space"].id),
            json={
                "title": "Already arranged",
                "description": "Keep this prose",
                "schedule": {"plannedOn": "2026-09-01"},
            },
            headers=auth(pair["token_a"]),
        )
        original = created.json()
        linked = action(
            client,
            pair,
            original["id"],
            "wish",
            original["version"],
            {"wishId": desired["id"], "wishVersion": desired["version"]},
            token_key=token_key,
        )
        assert linked.status_code == 200, linked.text
        plan = linked.json()["plan"]
        assert plan["sourceWishId"] == desired["id"]
        assert linked.json()["wish"]["status"] == "PLANNED"
        assert plan["id"] == original["id"]
        for field in ("title", "description", "plannedOn", "createdBy", "placeId"):
            assert plan[field] == original[field]
        assert plan["version"] > original["version"]
        assert plan["capabilities"]["canDelete"] is False
        replay = action(
            client,
            pair,
            plan["id"],
            "wish",
            original["version"],
            {"wishId": desired["id"], "wishVersion": desired["version"]},
        )
        assert replay.status_code == 200
        assert replay.json()["plan"]["version"] == plan["version"]
        assert replay.json()["wish"]["version"] == linked.json()["wish"]["version"]
        session.expire_all()
        assert len(list(session.scalars(select(Plan)))) == 1
        done = action(
            client, pair, plan["id"], "complete", plan["version"], {"experiencedOn": yesterday()}
        )
        assert done.status_code == 200
        read_wish = client.get(
            f"{wishes(pair['space'].id)}/{desired['id']}", headers=auth(pair["token_b"])
        )
        assert read_wish.json()["status"] == "COMPLETED"

    @pytest.mark.parametrize("stale_field", ["plan", "wish"])
    def test_stale_version_has_no_partial_link(self, client, pair, stale_field):  # type: ignore[no-untyped-def]
        desired = wish(client, pair)
        plan = client.post(
            plans(pair["space"].id),
            json={"title": "Already planned"},
            headers=auth(pair["token_a"]),
        ).json()
        if stale_field == "wish":
            client.patch(
                f"{wishes(pair['space'].id)}/{desired['id']}",
                json={"title": "Changed wish"},
                headers=if_match(pair["token_a"], 1),
            )
        else:
            client.patch(
                f"{plans(pair['space'].id)}/{plan['id']}",
                json={"title": "Changed plan"},
                headers=if_match(pair["token_a"], 1),
            )
        response = action(
            client, pair, plan["id"], "wish", 1, {"wishId": desired["id"], "wishVersion": 1}
        )
        assert response.status_code == 409
        assert (
            client.get(
                f"{plans(pair['space'].id)}/{plan['id']}", headers=auth(pair["token_a"])
            ).json()["sourceWishId"]
            is None
        )
        assert (
            client.get(
                f"{wishes(pair['space'].id)}/{desired['id']}", headers=auth(pair["token_a"])
            ).json()["status"]
            == "OPEN"
        )

    def test_existing_link_cannot_be_replaced_and_return_reopens_original(self, client, pair):  # type: ignore[no-untyped-def]
        first, second = wish(client, pair), wish(client, pair, title="Another wish")
        plan = convert(client, pair, first["id"]).json()["plan"]
        denied = action(
            client,
            pair,
            plan["id"],
            "wish",
            plan["version"],
            {"wishId": second["id"], "wishVersion": 1},
        )
        assert denied.status_code == 409
        returned = action(client, pair, plan["id"], "return-to-wish", plan["version"])
        assert returned.status_code == 200
        assert returned.json()["wish"]["id"] == first["id"]
        assert returned.json()["wish"]["status"] == "OPEN"

    def test_completed_plan_and_already_planned_wish_are_rejected(self, client, pair):  # type: ignore[no-untyped-def]
        desired = wish(client, pair)
        convert(client, pair, desired["id"])
        direct = client.post(
            plans(pair["space"].id),
            json={"title": "Independent plan"},
            headers=auth(pair["token_a"]),
        ).json()
        denied = action(
            client, pair, direct["id"], "wish", 1, {"wishId": desired["id"], "wishVersion": 2}
        )
        assert denied.status_code == 409
        completed = action(
            client, pair, direct["id"], "complete", 1, {"experiencedOn": yesterday()}
        ).json()
        open_wish = wish(client, pair, title="Still open")
        denied = action(
            client,
            pair,
            direct["id"],
            "wish",
            completed["version"],
            {"wishId": open_wish["id"], "wishVersion": 1},
        )
        assert denied.status_code == 409

    @pytest.mark.parametrize("target", ["plan", "wish"])
    def test_foreign_or_absent_target_is_not_disclosed(self, client, pair, session, target):  # type: ignore[no-untyped-def]
        desired = wish(client, pair)
        direct = client.post(
            plans(pair["space"].id), json={"title": "Own plan"}, headers=auth(pair["token_a"])
        ).json()
        outsider = make_account(session, "Another account")
        other = make_space(session, outsider)
        token = sign_in(session, outsider)
        foreign_wish = client.post(
            wishes(other.id), json={"title": "Foreign wish"}, headers=auth(token)
        ).json()
        foreign_plan = client.post(
            plans(other.id), json={"title": "Foreign plan"}, headers=auth(token)
        ).json()
        for foreign_id in (
            [foreign_plan["id"], str(uuid4())]
            if target == "plan"
            else [foreign_wish["id"], str(uuid4())]
        ):
            response = action(
                client,
                pair,
                foreign_id if target == "plan" else direct["id"],
                "wish",
                1,
                {"wishId": foreign_id if target == "wish" else desired["id"], "wishVersion": 1},
            )
            assert response.status_code == 404


class TestRequiredFlow:
    def test_wish_becomes_plan_and_is_completed(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        """The required flow from section 5 of the M3 delivery plan.

        ```text
        Wish Create -> Convert -> exactly one Plan -> Complete
        -> Wish + Plan consistently COMPLETED
        ```
        """
        wish_data = wish(client, pair)
        assert wish_data["status"] == "OPEN"

        converted = convert(client, pair, wish_data["id"])
        assert converted.status_code == 201
        plan = converted.json()["plan"]
        assert converted.json()["wish"]["status"] == "PLANNED"
        assert plan["status"] == "IDEA"
        assert plan["sourceWishId"] == wish_data["id"]

        # Exactly one Plan, not merely at least one.
        assert len(list(session.execute(select(Plan)).scalars())) == 1

        completed = action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == "COMPLETED"

        session.expire_all()
        wish_row = session.get(Wish, UUID(wish_data["id"]))
        plan_row = session.get(Plan, UUID(plan["id"]))
        assert wish_row.status == WishStatus.COMPLETED.value
        assert plan_row.status == PlanStatus.COMPLETED.value


class TestConversion:
    def test_plan_inherits_wish_title_without_own_title(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair, title="Polarlichter")
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        assert plan["title"] == "Polarlichter"
        assert plan["description"] is None

    def test_explicit_title_wins(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish_data = wish(client, pair)
        plan = convert(
            client,
            pair,
            wish_data["id"],
            title="Tromsoe im Februar",
            description="Sechs Naechte.",
        ).json()["plan"]
        assert plan["title"] == "Tromsoe im Februar"
        assert plan["description"] == "Sechs Naechte."

    def test_wish_and_plan_evolve_independently_after_conversion(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        """M3-D01: renaming one side does not synchronize the other direction."""
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        client.patch(
            f"{wishes(pair['space'].id)}/{wish_data['id']}",
            json={"title": "Ganz anderer Wunsch"},
            headers=if_match(pair["token_a"], 2),
        )
        retrieved = client.get(
            f"{plans(pair['space'].id)}/{plan['id']}",
            headers=auth(pair["token_a"]),
        ).json()
        assert retrieved["title"] == "Nordlichter sehen"

    def test_partner_may_convert(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        response = convert(client, pair, wish_data["id"], token_key="token_b")
        assert response.status_code == 201
        # The Plan is attributed to Ben while the Wish remains attributed to Anna.
        assert response.json()["plan"]["createdBy"] == str(pair["ben"].id)
        assert response.json()["wish"]["createdBy"] == str(pair["anna"].id)

    @pytest.mark.parametrize("field", ["sourceWishId", "status", "plannedStart", "experiencedOn"])
    def test_server_owned_fields_are_rejected_from_request(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        field: str,
    ) -> None:
        wish_data = wish(client, pair)
        values = {
            "sourceWishId": str(uuid4()),
            "status": "COMPLETED",
            "plannedStart": "2026-09-01T18:00:00Z",
            "experiencedOn": yesterday(),
        }
        response = convert(client, pair, wish_data["id"], **{field: values[field]})
        assert response.status_code == 422

    def test_stale_wish_creates_no_plan(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        client.patch(
            f"{wishes(pair['space'].id)}/{wish_data['id']}",
            json={"title": "Inzwischen umbenannt"},
            headers=if_match(pair["token_a"], 1),
        )

        response = convert(client, pair, wish_data["id"], version=1)
        assert response.status_code == 409
        assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"
        assert list(session.execute(select(Plan)).scalars()) == []

    def test_completed_wish_is_not_converted_again(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = convert(client, pair, wish_data["id"], version=3)
        assert response.status_code == 409
        assert response.json()["code"] == "WISH_ALREADY_COMPLETED"

    def test_foreign_wish_remains_invisible(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        response = convert(client, pair, str(uuid4()))
        assert response.status_code == 404
        assert response.json()["code"] == "WISH_NOT_FOUND"


class TestIdempotency:
    def test_retry_returns_same_plan(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        """The client lost the first response and retries the request."""
        wish_data = wish(client, pair)
        first = convert(client, pair, wish_data["id"])
        assert first.status_code == 201

        # Deliberately use the old Wish version: that is exactly what a client
        # has when its response was lost in transit.
        second = convert(client, pair, wish_data["id"], version=1)
        assert second.status_code == 200
        assert second.json()["plan"]["id"] == first.json()["plan"]["id"]

        assert len(list(session.execute(select(Plan)).scalars())) == 1

    def test_retry_with_different_payload_overwrites_nothing(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        first = convert(client, pair, wish_data["id"], title="Erster Titel")

        second = convert(
            client,
            pair,
            wish_data["id"],
            version=1,
            title="Anderer Titel",
        )
        assert second.status_code == 200
        assert second.json()["plan"]["title"] == "Erster Titel"
        assert second.json()["plan"]["version"] == first.json()["plan"]["version"]

    def test_retry_creates_no_second_event(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        convert(client, pair, wish_data["id"])
        convert(client, pair, wish_data["id"], version=1)

        event_types = [
            event.event_type
            for event in session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.event_type.in_(["PLAN_CREATED", "WISH_PLANNED"])
                )
            ).scalars()
        ]
        assert event_types == ["PLAN_CREATED", "WISH_PLANNED"]


class TestSourceCompletion:
    def test_plan_and_wish_complete_together(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        session.expire_all()
        assert session.get(Wish, UUID(wish_data["id"])).status == WishStatus.COMPLETED.value

    def test_both_mutations_share_one_commit(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        """The events prove ordering and the shared transaction boundary."""
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        event_types = [
            event.event_type
            for event in session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.event_type.in_(["PLAN_COMPLETED", "WISH_COMPLETED"])
                )
            ).scalars()
        ]
        assert event_types == ["PLAN_COMPLETED", "WISH_COMPLETED"]

    def test_future_day_leaves_wish_unchanged(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        tomorrow = (today_in(ZONE) + timedelta(days=1)).isoformat()
        response = action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": tomorrow},
        )
        assert response.status_code == 422

        session.expire_all()
        assert session.get(Wish, UUID(wish_data["id"])).status == WishStatus.PLANNED.value
        assert session.get(Plan, UUID(plan["id"])).status == PlanStatus.IDEA.value


class TestReturnToWish:
    def test_wish_reopens_and_plan_disappears(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        response = action(client, pair, plan["id"], "return-to-wish", 1)
        assert response.status_code == 200
        returned = response.json()
        assert returned["wish"]["status"] == "OPEN"
        assert returned["removedPlanId"] == plan["id"]

        session.expire_all()
        assert session.get(Plan, UUID(plan["id"])) is None
        retrieved = client.get(
            f"{plans(pair['space'].id)}/{plan['id']}",
            headers=auth(pair["token_a"]),
        )
        assert retrieved.status_code == 404

    def test_also_works_from_scheduled_state(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )

        response = action(client, pair, plan["id"], "return-to-wish", 2)
        assert response.status_code == 200
        assert response.json()["wish"]["status"] == "OPEN"

    def test_plan_text_is_not_copied_back_to_wish(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        """M3-D03: divergent payloads are not silently overwritten."""
        wish_data = wish(client, pair, title="Urspruenglicher Wunsch")
        plan = convert(
            client,
            pair,
            wish_data["id"],
            title="Inzwischen ganz anders",
        ).json()["plan"]

        returned = action(client, pair, plan["id"], "return-to-wish", 1).json()
        assert returned["wish"]["title"] == "Urspruenglicher Wunsch"

    def test_wish_can_be_converted_again_after_return(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        """`UNIQUE(source_wish_id)` must not block the Wish permanently."""
        wish_data = wish(client, pair)
        first = convert(client, pair, wish_data["id"]).json()["plan"]
        action(client, pair, first["id"], "return-to-wish", 1)

        second = convert(client, pair, wish_data["id"], version=3)
        assert second.status_code == 201
        assert second.json()["plan"]["id"] != first["id"]
        assert len(list(session.execute(select(Plan)).scalars())) == 1

    def test_direct_plan_cannot_return_to_wish(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        direct = client.post(
            plans(pair["space"].id),
            json={"title": "Ohne Wunsch entstanden"},
            headers=auth(pair["token_a"]),
        ).json()

        response = action(client, pair, direct["id"], "return-to-wish", 1)
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_SOURCE_WISH_REQUIRED"

    def test_completed_plan_cannot_return_to_wish(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = action(client, pair, plan["id"], "return-to-wish", 2)
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"

    def test_stale_version_returns_nothing_to_wish(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        response = action(client, pair, plan["id"], "return-to-wish", 99)
        assert response.status_code == 409
        assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        session.expire_all()
        assert session.get(Plan, UUID(plan["id"])) is not None
        assert session.get(Wish, UUID(wish_data["id"])).status == WishStatus.PLANNED.value

    def test_events_name_both_effects(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(client, pair, plan["id"], "return-to-wish", 1, token_key="token_b")

        latest = list(
            session.execute(
                select(OutboxEvent).where(
                    OutboxEvent.event_type.in_(["PLAN_DELETED", "WISH_REOPENED"])
                )
            ).scalars()
        )
        assert [event.event_type for event in latest] == ["PLAN_DELETED", "WISH_REOPENED"]
        assert all(event.actor_id == pair["ben"].id for event in latest)


class TestPlanDeleteMatrix:
    """The Plan rows from M3-D05."""

    def test_open_source_plan_is_not_deleted(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]

        response = client.delete(
            f"{plans(pair['space'].id)}/{plan['id']}",
            headers=if_match(pair["token_a"], 1),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_HAS_SOURCE_WISH"

        session.expire_all()
        assert session.get(Plan, UUID(plan["id"])) is not None

    def test_scheduled_source_plan_is_not_deleted(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )

        response = client.delete(
            f"{plans(pair['space'].id)}/{plan['id']}",
            headers=if_match(pair["token_a"], 2),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_HAS_SOURCE_WISH"

    def test_completed_source_plan_may_be_deleted(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        session,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = client.delete(
            f"{plans(pair['space'].id)}/{plan['id']}",
            headers=if_match(pair["token_a"], 2),
        )
        assert response.status_code == 204

        # No cascade in the opposite direction: the Wish remains.
        session.expire_all()
        assert session.get(Wish, UUID(wish_data["id"])).status == WishStatus.COMPLETED.value

    def test_capabilities_reflect_matrix(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        wish_data = wish(client, pair)
        plan = convert(client, pair, wish_data["id"]).json()["plan"]
        assert plan["capabilities"]["canDelete"] is False

        completed = action(
            client,
            pair,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        ).json()
        assert completed["capabilities"]["canDelete"] is True
