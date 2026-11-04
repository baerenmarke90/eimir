"""Anticipation must remain correct without exhausting the user's Plan history."""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import pytest

from eimir.core import clock
from eimir.plans import browse
from eimir.plans.models import Plan
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def overview(client, session, monkeypatch):  # type: ignore[no-untyped-def]
    current = datetime(2031, 11, 4, 23, 30, tzinfo=UTC)
    monkeypatch.setattr(
        browse, "clock", SimpleNamespace(now=lambda: current, resolve_zone=clock.resolve_zone)
    )
    account = make_account(session, "Plan author")
    account.timezone = "Europe/Berlin"
    space = make_space(session, account)
    token = sign_in(session, account)
    path = f"/api/v1/spaces/{space.id}/plans"

    def create(title, schedule=None):  # type: ignore[no-untyped-def]
        body = {"title": title}
        if schedule is not None:
            body["schedule"] = schedule
        response = client.post(path, json=body, headers=auth(token))
        assert response.status_code == 201, response.text
        return response.json()

    date_only = create("Oldest, but next", {"plannedOn": "2031-11-05"})
    soon = create("After midnight", {"plannedStart": "2031-11-05T00:45:00+01:00"})
    later = create("Later", {"plannedOn": "2031-11-06"})
    ideas = [create(f"Idea {index}") for index in range(23)]
    past = create("Past intention", {"plannedOn": "2031-11-04"})
    completed = create("Already experienced")
    row = session.get(Plan, UUID(completed["id"]))
    row.status = "COMPLETED"
    row.experienced_on = date(2031, 11, 2)
    session.flush()
    return {
        "path": path,
        "token": token,
        "space": space,
        "create": create,
        "next": date_only,
        "soon": soon,
        "later": later,
        "ideas": ideas,
        "past": past,
        "completed": completed,
        "at": current,
    }


def test_overview_pages_keep_the_true_next_plan_and_complete_the_loaded_range(
    client, overview, monkeypatch
):  # type: ignore[no-untyped-def]
    params = {"overviewScope": "OPEN", "limit": 2}
    pages = []
    cursors = set()
    while True:
        response = client.get(overview["path"], params=params, headers=auth(overview["token"]))
        assert response.status_code == 200, response.text
        page = response.json()
        assert len(page["items"]) <= 2
        pages.extend(page["items"])
        cursor = page["nextCursor"]
        if not cursor:
            break
        assert cursor not in cursors
        cursors.add(cursor)
        params["cursor"] = cursor
        # Crossing a day must not move cursor buckets halfway through a browse.
        monkeypatch.setattr(browse.clock, "now", lambda: overview["at"] + timedelta(days=3))
    assert [item["id"] for item in pages[:3]] == [
        overview["next"]["id"],
        overview["soon"]["id"],
        overview["later"]["id"],
    ]
    expected = {item["id"] for item in overview["ideas"]} | {
        overview[key]["id"] for key in ("next", "soon", "later", "past")
    }
    assert len(pages) == len(expected)
    assert {item["id"] for item in pages} == expected
    assert pages[-1]["id"] == overview["past"]["id"]


def test_overview_cursor_is_bound_to_scope_account_space_and_order(client, session, overview):  # type: ignore[no-untyped-def]
    response = client.get(
        overview["path"],
        params={"overviewScope": "OPEN", "limit": 1},
        headers=auth(overview["token"]),
    )
    cursor = response.json()["nextCursor"]
    assert cursor
    for params in (
        {"overviewScope": "COMPLETED", "cursor": cursor},
        {"cursor": cursor},
        {"overviewScope": "OPEN", "cursor": cursor + "x"},
    ):
        denied = client.get(overview["path"], params=params, headers=auth(overview["token"]))
        assert denied.status_code == 400
        assert denied.json()["code"] == "INVALID_CURSOR"
    outsider = make_account(session, "Other author")
    other_space = make_space(session, outsider)
    other_token = sign_in(session, outsider)
    denied = client.get(
        f"/api/v1/spaces/{other_space.id}/plans",
        params={"overviewScope": "OPEN", "cursor": cursor},
        headers=auth(other_token),
    )
    assert denied.status_code == 400
    completed = client.get(
        overview["path"],
        params={"overviewScope": "COMPLETED", "limit": 1},
        headers=auth(overview["token"]),
    )
    assert [item["id"] for item in completed.json()["items"]] == [overview["completed"]["id"]]
    mixed = client.get(
        overview["path"],
        params={"overviewScope": "OPEN", "status": "PLANNED"},
        headers=auth(overview["token"]),
    )
    assert mixed.status_code == 422
