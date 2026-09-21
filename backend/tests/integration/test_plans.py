"""PostgreSQL/HTTP acceptance coverage for the M3-S2 plan scope.

This file covers everything a plan can do on its own: direct creation per
M3-D30, CRUD, the state machine from M3-D04 with its date invariants, and the
plan rows of the delete matrix from M3-D05.

Interactions between two aggregates - conversion, completion of a source
plan, and `return-to-wish` - are covered in `test_wish_to_plan`.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.core.clock import today_in
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpaceConfiguration
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET = "Ein Plan, der nicht in Ereignisse gehoert."

# Time zone of the test account. `experiencedOn` is evaluated against its
# calendar day, not UTC - see M3-D04.
ZONE = "Europe/Berlin"


def today() -> str:
    return today_in(ZONE).isoformat()


def yesterday() -> str:
    return (today_in(ZONE) - timedelta(days=1)).isoformat()


def tomorrow() -> str:
    return (today_in(ZONE) + timedelta(days=1)).isoformat()


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/plans"


def body(
    *,
    title: str = "Wochenende in Kopenhagen",
    description: str | None = "Mit dem Zug hin.",
) -> dict[str, Any]:
    return {"title": title, "description": description}


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    relationship_service.add_member(session, outsider_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def create_plan(  # type: ignore[no-untyped-def]
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):
    return client.post(
        path(couple["space"].id),
        json=body(**overrides),
        headers=auth(couple[token_key]),
    )


def perform_action(  # type: ignore[no-untyped-def]
    client,
    couple,
    plan_id: str,
    name: str,
    version: int,
    json: dict[str, Any] | None = None,
):
    return client.post(
        f"{path(couple['space'].id)}/{plan_id}/{name}",
        json=json if json is not None else {},
        headers=if_match(couple["token_a"], version),
    )


class TestDirectCreate:
    """M3-D30: a plan may be created without a wish."""

    def test_direct_plan_starts_as_idea_without_dates(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        created = create_plan(client, couple)
        assert created.status_code == 201
        p = created.json()
        assert UUID(p["id"]).version == 7
        assert p["title"] == "Wochenende in Kopenhagen"
        assert p["description"] == "Mit dem Zug hin."
        assert p["status"] == "IDEA"
        assert p["sourceWishId"] is None
        assert p["plannedStart"] is None
        assert p["plannedEnd"] is None
        assert p["experiencedOn"] is None
        assert p["createdBy"] == str(couple["anna"].id)
        assert p["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": False,
        }
        assert created.headers["ETag"] == '"1"'

    @pytest.mark.parametrize(
        "field",
        ["status", "sourceWishId", "plannedStart", "plannedEnd", "experiencedOn", "createdBy"],
    )
    def test_server_managed_field_is_rejected_from_request(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        field: str,
    ) -> None:
        values = {
            "status": "COMPLETED",
            "sourceWishId": str(uuid4()),
            "plannedStart": "2026-09-01T18:00:00Z",
            "plannedEnd": "2026-09-02T18:00:00Z",
            "experiencedOn": yesterday(),
            "createdBy": str(uuid4()),
        }
        response = client.post(
            path(couple["space"].id),
            json={**body(), field: values[field]},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_empty_title_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        assert create_plan(client, couple, title="   ").status_code == 422


class TestCrud:
    def test_read_update_delete(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        p = create_plan(client, couple).json()

        read_response = client.get(
            f"{path(couple['space'].id)}/{p['id']}",
            headers=auth(couple["token_a"]),
        )
        assert read_response.status_code == 200
        assert read_response.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"title": "  Kopenhagen im Herbst  ", "description": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Kopenhagen im Herbst"
        assert updated.json()["description"] is None

        deleted = client.delete(
            f"{path(couple['space'].id)}/{p['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        after_delete = client.get(
            f"{path(couple['space'].id)}/{p['id']}",
            headers=auth(couple["token_a"]),
        )
        assert after_delete.status_code == 404
        assert after_delete.json()["code"] == "PLAN_NOT_FOUND"

    def test_partner_can_update_and_created_by_is_preserved(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """M3-D01 applies to plans in the same way as wishes."""
        p = create_plan(client, couple).json()
        updated = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"title": "Von Ben umbenannt"},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["createdBy"] == str(couple["anna"].id)

    def test_patch_cannot_set_status(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        for forbidden_payload in (
            {"status": "COMPLETED"},
            {"plannedStart": "2026-09-01T18:00:00Z"},
        ):
            response = client.patch(
                f"{path(couple['space'].id)}/{p['id']}",
                json=forbidden_payload,
                headers=if_match(couple["token_a"], 1),
            )
            assert response.status_code == 422

    def test_list_filters_by_status(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        idea = create_plan(client, couple, title="Idee").json()
        planned = create_plan(client, couple, title="Geplant").json()
        perform_action(
            client,
            couple,
            planned["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )

        ideas = client.get(
            f"{path(couple['space'].id)}?status=IDEA",
            headers=auth(couple["token_a"]),
        ).json()
        assert [entry["id"] for entry in ideas["items"]] == [idea["id"]]

        plans = client.get(
            f"{path(couple['space'].id)}?status=PLANNED",
            headers=auth(couple["token_a"]),
        ).json()
        assert [entry["id"] for entry in plans["items"]] == [planned["id"]]

    def test_cursor_only_applies_to_its_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_plan(client, couple, title="Erster")
        create_plan(client, couple, title="Zweiter")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        ).json()

        response = client.get(
            f"{path(couple['outsider_space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"


class TestSchedule:
    def test_idea_becomes_planned_by_scheduling(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {
                "plannedStart": "2026-09-01T18:00:00Z",
                "plannedEnd": "2026-09-03T12:00:00Z",
            },
        )
        assert response.status_code == 200
        planned = response.json()
        assert planned["status"] == "PLANNED"
        assert planned["plannedStart"] == "2026-09-01T18:00:00Z"
        assert planned["plannedEnd"] == "2026-09-03T12:00:00Z"
        assert planned["version"] == 2
        assert response.headers["ETag"] == '"2"'

    def test_end_is_optional(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )
        assert response.status_code == 200
        assert response.json()["plannedEnd"] is None

    def test_rescheduling_only_changes_dates(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """`PLANNED -> PLANNED` is a correction, not a status transition."""
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )

        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            2,
            {"plannedStart": "2026-09-08T18:00:00Z"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "PLANNED"
        assert response.json()["plannedStart"] == "2026-09-08T18:00:00Z"
        assert response.json()["version"] == 3

    def test_end_before_start_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {
                "plannedStart": "2026-09-03T18:00:00Z",
                "plannedEnd": "2026-09-01T12:00:00Z",
            },
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PLAN_DATE_RANGE_INVALID"

    def test_without_start_is_not_scheduled(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(client, couple, p["id"], "schedule", 1, {})
        assert response.status_code == 422

    def test_completed_plan_cannot_be_scheduled_again(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            2,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"

    def test_stale_version_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )

        response = perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-08T18:00:00Z"},
        )
        assert response.status_code == 409
        assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"


class TestUnschedule:
    def test_dates_are_discarded(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {
                "plannedStart": "2026-09-01T18:00:00Z",
                "plannedEnd": "2026-09-03T12:00:00Z",
            },
        )

        response = perform_action(client, couple, p["id"], "unschedule", 2)
        assert response.status_code == 200
        back_to_idea = response.json()
        assert back_to_idea["status"] == "IDEA"
        assert back_to_idea["plannedStart"] is None
        assert back_to_idea["plannedEnd"] is None

    def test_idea_cannot_be_unscheduled(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(client, couple, p["id"], "unschedule", 1)
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"

    def test_completed_plan_cannot_be_unscheduled(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            2,
            {"experiencedOn": yesterday()},
        )

        response = perform_action(client, couple, p["id"], "unschedule", 3)
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"


class TestComplete:
    def test_shared_achievement_projection_is_server_gated(
        self,
        client,
        couple,
        session: Session,
    ) -> None:  # type: ignore[no-untyped-def]
        disabled_plan = create_plan(client, couple).json()
        disabled = perform_action(
            client,
            couple,
            disabled_plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )
        assert disabled.status_code == 200
        assert "X-Eimir-Shared-Achievement" not in disabled.headers

        configuration = session.get(SpaceConfiguration, couple["space"].id)
        assert configuration is not None
        configuration.shared_achievements_enabled = True
        session.flush()

        enabled_plan = create_plan(client, couple).json()
        enabled = perform_action(
            client,
            couple,
            enabled_plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )
        assert enabled.status_code == 200
        assert enabled.headers["X-Eimir-Shared-Achievement"] == "plan-completed"

    def test_completed_retry_does_not_replay_shared_achievement(
        self,
        client,
        couple,
        session: Session,
    ) -> None:  # type: ignore[no-untyped-def]
        configuration = session.get(SpaceConfiguration, couple["space"].id)
        assert configuration is not None
        configuration.shared_achievements_enabled = True
        session.flush()

        plan = create_plan(client, couple).json()
        first = perform_action(
            client,
            couple,
            plan["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )
        retry = perform_action(
            client,
            couple,
            plan["id"],
            "complete",
            2,
            {"experiencedOn": yesterday()},
        )

        assert first.status_code == 200
        assert first.headers["X-Eimir-Shared-Achievement"] == "plan-completed"
        assert retry.status_code == 409
        assert "X-Eimir-Shared-Achievement" not in retry.headers

    def test_completion_from_idea_is_allowed(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """Not every shared experience is planned beforehand (M3-D04)."""
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )
        assert response.status_code == 200
        completed = response.json()
        assert completed["status"] == "COMPLETED"
        assert completed["experiencedOn"] == yesterday()
        assert completed["plannedStart"] is None

    def test_completion_from_planned_keeps_planned_times(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {
                "plannedStart": "2026-09-01T18:00:00Z",
                "plannedEnd": "2026-09-03T12:00:00Z",
            },
        )
        response = perform_action(
            client,
            couple,
            p["id"],
            "complete",
            2,
            {"experiencedOn": yesterday()},
        )
        assert response.status_code == 200
        completed = response.json()
        assert completed["status"] == "COMPLETED"
        # Preserve history instead of cleaning up: scheduled times stay readable.
        assert completed["plannedStart"] == "2026-09-01T18:00:00Z"
        assert completed["plannedEnd"] == "2026-09-03T12:00:00Z"

    def test_today_is_allowed(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": today()},
        )
        assert response.status_code == 200

    def test_future_day_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": tomorrow()},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PLAN_EXPERIENCED_ON_IN_FUTURE"
        assert "X-Eimir-Shared-Achievement" not in response.headers

    def test_without_day_cannot_be_completed(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = perform_action(client, couple, p["id"], "complete", 1, {})
        assert response.status_code == 422

    def test_completed_is_terminal(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = perform_action(
            client,
            couple,
            p["id"],
            "complete",
            2,
            {"experiencedOn": yesterday()},
        )
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"

    def test_direct_plan_does_not_create_wish(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        from eimir.wishes.models import Wish

        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        assert list(session.execute(select(Wish)).scalars()) == []


class TestCorrectionOnCompletedPlan:
    def test_experienced_day_can_be_corrected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": today()},
        )

        response = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"experiencedOn": yesterday()},
            headers=if_match(couple["token_a"], 2),
        )
        assert response.status_code == 200
        assert response.json()["experiencedOn"] == yesterday()
        # A correction is not a reopening.
        assert response.json()["status"] == "COMPLETED"

    def test_correction_also_cannot_be_in_future(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"experiencedOn": tomorrow()},
            headers=if_match(couple["token_a"], 2),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PLAN_EXPERIENCED_ON_IN_FUTURE"

    def test_open_plan_cannot_have_experienced_day(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """Otherwise the PATCH would anticipate completion."""
        p = create_plan(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"experiencedOn": yesterday()},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "PLAN_STATUS_TRANSITION_INVALID"

    def test_experienced_day_cannot_be_cleared(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": yesterday()},
        )

        response = client.patch(
            f"{path(couple['space'].id)}/{p['id']}",
            json={"experiencedOn": None},
            headers=if_match(couple["token_a"], 2),
        )
        assert response.status_code == 422


class TestDatabaseBoundaries:
    """The M3-D04 invariants are enforced by the schema as well as the service."""

    @pytest.mark.parametrize(
        ("sql", "reason"),
        [
            (
                "UPDATE plans SET planned_end = now() WHERE id = :id",
                "an end without a start",
            ),
            (
                "UPDATE plans SET planned_start = now(), "
                "planned_end = now() - interval '1 day' WHERE id = :id",
                "an end before the start",
            ),
            (
                "UPDATE plans SET status = 'PLANNED' WHERE id = :id",
                "planned without a start",
            ),
            (
                "UPDATE plans SET status = 'COMPLETED' WHERE id = :id",
                "completed without an experienced day",
            ),
            (
                "UPDATE plans SET planned_start = now() WHERE id = :id",
                "an idea with a scheduled time",
            ),
        ],
    )
    def test_violated_invariant_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
        sql: str,
        reason: str,
    ) -> None:
        p = create_plan(client, couple).json()
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(text(sql), {"id": p["id"]})

    def test_fabricated_status_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        p = create_plan(client, couple).json()
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(
                text("UPDATE plans SET status = 'ERFUNDEN' WHERE id = :id"),
                {"id": p["id"]},
            )


class TestTenant:
    def test_outsider_cannot_see_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_plan(client, couple)
        response = client.get(
            path(couple["space"].id),
            headers=auth(couple["token_outsider"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_id_from_other_space_remains_hidden(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        p = create_plan(client, couple).json()
        response = client.get(
            f"{path(couple['outsider_space'].id)}/{p['id']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PLAN_NOT_FOUND"

    def test_foreign_lifecycle_action_changes_nothing(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        p = create_plan(client, couple).json()
        response = client.post(
            f"{path(couple['outsider_space'].id)}/{p['id']}/complete",
            json={"experiencedOn": yesterday()},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 404
        assert "X-Eimir-Shared-Achievement" not in response.headers

        session.expire_all()
        assert session.get(Plan, UUID(p["id"])).status == PlanStatus.IDEA.value


class TestEvents:
    def test_events_do_not_contain_plan_text(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        p = create_plan(client, couple, title=SECRET, description=SECRET).json()
        perform_action(
            client,
            couple,
            p["id"],
            "schedule",
            1,
            {"plannedStart": "2026-09-01T18:00:00Z"},
        )
        perform_action(client, couple, p["id"], "unschedule", 2)
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            3,
            {"experiencedOn": yesterday()},
        )
        client.delete(
            f"{path(couple['space'].id)}/{p['id']}",
            headers=if_match(couple["token_a"], 4),
        )

        rows = list(
            session.execute(select(OutboxEvent).where(OutboxEvent.subject_type == "plan")).scalars()
        )
        assert [row.event_type for row in rows] == [
            "PLAN_CREATED",
            "PLAN_UPDATED",
            "PLAN_UPDATED",
            "PLAN_COMPLETED",
            "PLAN_DELETED",
        ]
        for row in rows:
            raw_payload = repr(row.payload.model_dump())
            assert SECRET not in raw_payload
            assert row.resource_version is not None

    def test_rejected_action_creates_no_event(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        p = create_plan(client, couple).json()
        perform_action(
            client,
            couple,
            p["id"],
            "complete",
            1,
            {"experiencedOn": tomorrow()},
        )

        rows = list(
            session.execute(select(OutboxEvent).where(OutboxEvent.subject_type == "plan")).scalars()
        )
        assert [row.event_type for row in rows] == ["PLAN_CREATED"]
