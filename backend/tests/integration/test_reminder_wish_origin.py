"""Reminders show the Wish behind a Plan reminder (#1816)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from eimir.reminders import runtime
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)
PLANNED_START = "2026-09-05T18:00:00Z"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "space": space,
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
    }


def _base(couple, resource: str) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/{resource}"


def _if_match(couple, version: int) -> dict[str, str]:  # type: ignore[no-untyped-def]
    return {**auth(couple["anna_token"]), "If-Match": f'"{version}"'}


def _plan_reminders(client, couple, token_key: str = "anna_token") -> list[dict]:  # type: ignore[no-untyped-def]
    response = client.get(_base(couple, "reminders"), headers=auth(couple[token_key]))
    assert response.status_code == 200, response.text
    return [item for item in response.json()["items"] if item["sourceType"] == "PLAN"]


def _schedule(client, couple, plan: dict) -> dict:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{_base(couple, 'plans')}/{plan['id']}/schedule",
        json={"plannedStart": PLANNED_START},
        headers=_if_match(couple, plan["version"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _wish_to_scheduled_plan(client, couple, wish: dict) -> dict:  # type: ignore[no-untyped-def]
    converted = client.post(
        f"{_base(couple, 'wishes')}/{wish['id']}/plan",
        json={},
        headers=_if_match(couple, wish["version"]),
    )
    assert converted.status_code == 201, converted.text
    return _schedule(client, couple, converted.json()["plan"])


def _create_wish(client, couple) -> dict:  # type: ignore[no-untyped-def]
    response = client.post(
        _base(couple, "wishes"),
        json={"title": "Baltic Sea weekend"},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_plan_reminder_names_the_wish_it_grew_out_of(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    wish = _create_wish(client, couple)
    _wish_to_scheduled_plan(client, couple, wish)

    for token_key in ("anna_token", "ben_token"):
        reminders = _plan_reminders(client, couple, token_key)
        assert len(reminders) == 1
        assert reminders[0]["originWish"] == {"wishId": wish["id"], "seriesPosition": 1}

    fetched = client.get(
        f"{_base(couple, 'reminders')}/{reminders[0]['id']}",
        headers=auth(couple["anna_token"]),
    )
    assert fetched.status_code == 200
    assert fetched.json()["originWish"]["wishId"] == wish["id"]


def test_plan_of_a_repeated_wish_reports_its_series_position(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    first = _create_wish(client, couple)
    completed = client.post(
        f"{_base(couple, 'wishes')}/{first['id']}/complete",
        headers=_if_match(couple, first["version"]),
    )
    assert completed.status_code == 200
    repeated = client.post(
        f"{_base(couple, 'wishes')}/{first['id']}/repeat",
        headers=auth(couple["anna_token"]),
    ).json()
    _wish_to_scheduled_plan(client, couple, repeated)

    reminders = _plan_reminders(client, couple)

    assert len(reminders) == 1
    assert reminders[0]["originWish"] == {"wishId": repeated["id"], "seriesPosition": 2}


def test_direct_plan_reminder_has_no_wish(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    created = client.post(
        _base(couple, "plans"),
        json={"title": "Dinner"},
        headers=auth(couple["anna_token"]),
    )
    assert created.status_code == 201
    _schedule(client, couple, created.json())

    reminders = _plan_reminders(client, couple)

    assert len(reminders) == 1
    assert reminders[0]["originWish"] is None


def test_reminder_disappears_when_the_plan_returns_to_its_wish(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    wish = _create_wish(client, couple)
    plan = _wish_to_scheduled_plan(client, couple, wish)
    assert len(_plan_reminders(client, couple)) == 1

    returned = client.post(
        f"{_base(couple, 'plans')}/{plan['id']}/return-to-wish",
        headers=_if_match(couple, plan["version"]),
    )
    assert returned.status_code == 200, returned.text

    assert _plan_reminders(client, couple) == []


def test_manual_reminder_has_no_wish(client, couple) -> None:  # type: ignore[no-untyped-def]
    created = client.post(
        _base(couple, "reminders"),
        json={
            "title": "Call mum",
            "schedule": {"type": "ONCE", "at": "2026-12-01T10:00:00Z"},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert created.status_code == 201, created.text
    assert created.json()["originWish"] is None
