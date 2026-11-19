"""Acceptance coverage for multi-day date-only Plans (#1895)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

FIRST = "2031-06-13"
LAST = "2031-06-15"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    anna.timezone = "Pacific/Honolulu"
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {"space": space, "anna": sign_in(session, anna), "ben": sign_in(session, ben)}


def plans(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/plans"


def create(client, couple, schedule):  # type: ignore[no-untyped-def]
    return client.post(
        plans(couple),
        json={"title": "Inselwochenende", "schedule": schedule},
        headers=auth(couple["anna"]),
    )


def test_date_only_plan_keeps_an_inclusive_last_day(client, couple) -> None:  # type: ignore[no-untyped-def]
    created = create(client, couple, {"plannedOn": FIRST, "plannedUntil": LAST})
    assert created.status_code == 201, created.text
    plan = created.json()
    assert (plan["status"], plan["plannedOn"], plan["plannedUntil"]) == ("PLANNED", FIRST, LAST)
    assert plan["plannedStart"] is None and plan["plannedEnd"] is None

    # The partner reads the same calendar days without a timezone shift.
    read = client.get(f"{plans(couple)}/{plan['id']}", headers=auth(couple["ben"]))
    assert read.json()["plannedUntil"] == LAST


def test_single_day_plans_stay_unchanged(client, couple) -> None:  # type: ignore[no-untyped-def]
    plan = create(client, couple, {"plannedOn": FIRST}).json()
    assert plan["plannedUntil"] is None


@pytest.mark.parametrize(
    "schedule",
    [
        {"plannedOn": LAST, "plannedUntil": FIRST},
        {"plannedUntil": LAST},
        {"plannedStart": "2031-06-13T18:00:00+02:00", "plannedUntil": LAST},
        {"plannedOn": FIRST, "plannedUntil": None},
    ],
)
def test_invalid_periods_are_rejected(client, couple, schedule) -> None:  # type: ignore[no-untyped-def]
    assert create(client, couple, schedule).status_code == 422


def test_rescheduling_replaces_or_clears_the_period(client, couple) -> None:  # type: ignore[no-untyped-def]
    plan = create(client, couple, {"plannedOn": FIRST, "plannedUntil": LAST}).json()
    timed = client.post(
        f"{plans(couple)}/{plan['id']}/schedule",
        json={"plannedStart": "2031-06-13T18:00:00+02:00"},
        headers={**auth(couple["anna"]), "If-Match": f'"{plan["version"]}"'},
    )
    assert timed.status_code == 200, timed.text
    assert timed.json()["plannedUntil"] is None

    patched = client.patch(
        f"{plans(couple)}/{plan['id']}",
        json={"schedule": {"plannedOn": FIRST, "plannedUntil": "2031-06-14"}},
        headers={**auth(couple["anna"]), "If-Match": f'"{timed.json()["version"]}"'},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["plannedUntil"] == "2031-06-14"

    unscheduled = client.post(
        f"{plans(couple)}/{plan['id']}/unschedule",
        headers={**auth(couple["anna"]), "If-Match": f'"{patched.json()["version"]}"'},
    )
    assert unscheduled.json()["plannedOn"] is None
    assert unscheduled.json()["plannedUntil"] is None


def test_idempotent_create_distinguishes_the_period(client, couple) -> None:  # type: ignore[no-untyped-def]
    headers = {**auth(couple["anna"]), "Idempotency-Key": str(uuid4())}
    body = {"title": "Ausflug", "schedule": {"plannedOn": FIRST, "plannedUntil": LAST}}
    first = client.post(plans(couple), json=body, headers=headers)
    replay = client.post(plans(couple), json=body, headers=headers)
    assert (first.status_code, replay.status_code) == (201, 200)
    assert replay.json()["id"] == first.json()["id"]
    changed = {"title": "Ausflug", "schedule": {"plannedOn": FIRST}}
    assert client.post(plans(couple), json=changed, headers=headers).status_code == 409


def test_running_period_stays_upcoming_through_its_last_day(  # type: ignore[no-untyped-def]
    session: Session, client, couple, monkeypatch
) -> None:
    period = create(client, couple, {"plannedOn": FIRST, "plannedUntil": LAST}).json()
    past = create(client, couple, {"plannedOn": FIRST}).json()
    # Make the finished single day the most recently edited entry, so it would
    # lead the non-upcoming bucket if the running period were not upcoming.
    session.execute(
        update(Plan)
        .where(Plan.id == past["id"])
        .values(updated_at=datetime(2031, 6, 14, 20, tzinfo=UTC))
    )
    session.flush()
    # Honolulu (UTC-10) is on June 14: the single day is over, the period runs.
    monkeypatch.setattr(clock, "now", lambda: datetime(2031, 6, 14, 22, tzinfo=UTC))
    page = client.get(plans(couple), params={"overviewScope": "OPEN"}, headers=auth(couple["anna"]))
    assert page.status_code == 200, page.text
    order = [item["id"] for item in page.json()["items"]]
    # Upcoming entries lead; the finished single day falls behind the period.
    assert order.index(period["id"]) < order.index(past["id"])


def test_database_rejects_a_period_without_a_date(session: Session, client, couple) -> None:  # type: ignore[no-untyped-def]
    plan = create(client, couple, {"plannedOn": FIRST, "plannedUntil": LAST}).json()
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(
            update(Plan).where(Plan.id == plan["id"]).values(planned_until=date(2031, 6, 1))
        )
        session.flush()
