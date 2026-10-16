"""Acceptance coverage for #838 date-only Plan scheduling."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

DAY = "2031-06-15"
TIMED = "2031-06-15T18:30:00+02:00"


@pytest.fixture
def planning_couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    anna.timezone = "Pacific/Honolulu"
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "space": space,
        "token": sign_in(session, anna),
    }


def collection(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/plans"


def version_headers(couple, version: int) -> dict[str, str]:  # type: ignore[no-untyped-def]
    return {**auth(couple["token"]), "If-Match": f'"{version}"'}


def create(client, couple, *, schedule=None):  # type: ignore[no-untyped-def]
    payload = {"title": "Inselwochenende"}
    if schedule is not None:
        payload["schedule"] = schedule
    return client.post(collection(couple), json=payload, headers=auth(couple["token"]))


def schedule(client, couple, plan: dict, payload: dict):  # type: ignore[no-untyped-def]
    return client.post(
        f"{collection(couple)}/{plan['id']}/schedule",
        json=payload,
        headers=version_headers(couple, plan["version"]),
    )


def test_unscheduled_plan_remains_valid(client, planning_couple) -> None:  # type: ignore[no-untyped-def]
    response = create(client, planning_couple)
    assert response.status_code == 201
    plan = response.json()
    assert plan["status"] == "IDEA"
    assert plan["plannedOn"] is None
    assert plan["plannedStart"] is None
    assert plan["plannedEnd"] is None


def test_direct_create_accepts_date_only_without_timezone_drift(  # type: ignore[no-untyped-def]
    client,
    planning_couple,
) -> None:
    created = create(client, planning_couple, schedule={"plannedOn": DAY})
    assert created.status_code == 201
    plan = created.json()
    assert plan["status"] == "PLANNED"
    assert plan["plannedOn"] == DAY
    assert plan["plannedStart"] is None
    assert plan["plannedEnd"] is None

    # The account is intentionally west of UTC. Reading the Plan again must
    # preserve the exact calendar day rather than shift to June 14.
    read = client.get(
        f"{collection(planning_couple)}/{plan['id']}",
        headers=auth(planning_couple["token"]),
    )
    assert read.status_code == 200
    assert read.json()["plannedOn"] == DAY


def test_direct_create_accepts_real_timed_schedule(client, planning_couple) -> None:  # type: ignore[no-untyped-def]
    created = create(client, planning_couple, schedule={"plannedStart": TIMED})
    assert created.status_code == 201
    plan = created.json()
    assert plan["status"] == "PLANNED"
    assert plan["plannedOn"] is None
    actual = datetime.fromisoformat(plan["plannedStart"])
    expected = datetime.fromisoformat(TIMED)
    assert actual.astimezone(UTC) == expected.astimezone(UTC)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"plannedOn": DAY, "plannedStart": TIMED},
        {"plannedOn": DAY, "plannedEnd": "2031-06-15T20:00:00+02:00"},
        {"plannedTime": "18:30"},
    ],
)
def test_invalid_schedule_shapes_are_rejected(  # type: ignore[no-untyped-def]
    client,
    planning_couple,
    payload: dict,
) -> None:
    created = create(client, planning_couple)
    plan = created.json()
    response = schedule(client, planning_couple, plan, payload)
    assert response.status_code == 422


def test_schedule_can_move_date_only_to_timed_and_back_without_sentinel(  # type: ignore[no-untyped-def]
    client,
    planning_couple,
) -> None:
    plan = create(client, planning_couple).json()

    date_only_response = schedule(
        client,
        planning_couple,
        plan,
        {"plannedOn": DAY},
    )
    assert date_only_response.status_code == 200
    date_only = date_only_response.json()
    assert date_only["plannedOn"] == DAY
    assert date_only["plannedStart"] is None

    timed_response = schedule(
        client,
        planning_couple,
        date_only,
        {"plannedStart": TIMED},
    )
    assert timed_response.status_code == 200
    timed = timed_response.json()
    assert timed["plannedOn"] is None
    assert timed["plannedStart"] is not None

    back_response = schedule(
        client,
        planning_couple,
        timed,
        {"plannedOn": DAY},
    )
    assert back_response.status_code == 200
    back = back_response.json()
    assert back["plannedOn"] == DAY
    assert back["plannedStart"] is None
    assert back["plannedEnd"] is None


def test_clearing_schedule_keeps_date_only_out_of_idea_state(  # type: ignore[no-untyped-def]
    client,
    planning_couple,
) -> None:
    plan = create(client, planning_couple, schedule={"plannedOn": DAY}).json()
    response = client.post(
        f"{collection(planning_couple)}/{plan['id']}/unschedule",
        json={},
        headers=version_headers(planning_couple, plan["version"]),
    )
    assert response.status_code == 200
    unscheduled = response.json()
    assert unscheduled["status"] == "IDEA"
    assert unscheduled["plannedOn"] is None
    assert unscheduled["plannedStart"] is None
    assert unscheduled["plannedEnd"] is None
