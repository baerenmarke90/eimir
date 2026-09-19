"""Ephemeral partner presence stays distinct from durable Membership."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.relationship import presence
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpacePresence
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
START = datetime(2026, 9, 19, 18, 0, tzinfo=UTC)


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/presence"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "outsider_space": outsider_space,
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
        "outsider_token": sign_in(session, outsider),
    }


def test_membership_alone_is_not_presence(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.get(path(couple["space"].id), headers=auth(couple["anna_token"]))
    assert response.status_code == 200
    assert response.json() == {"state": None}


def test_heartbeat_sets_presence_for_the_partner(client, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(presence.clock, "now", lambda: START)
    assert client.post(path(couple["space"].id), headers=auth(couple["ben_token"])).json() == {
        "state": None
    }
    assert client.get(path(couple["space"].id), headers=auth(couple["anna_token"])).json() == {
        "state": "ACTIVE"
    }


def test_presence_thresholds_are_semantic_and_need_no_cleanup(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    now = [START]
    monkeypatch.setattr(presence.clock, "now", lambda: now[0])
    client.post(path(couple["space"].id), headers=auth(couple["ben_token"]))

    for delta, expected in (
        (timedelta(minutes=1, seconds=59), "ACTIVE"),
        (timedelta(minutes=2), "RECENT"),
        (timedelta(minutes=10), "RECENT"),
        (timedelta(minutes=10, microseconds=1), None),
    ):
        now[0] = START + delta
        response = client.get(path(couple["space"].id), headers=auth(couple["anna_token"]))
        assert response.json() == {"state": expected}

    stored = session.execute(
        select(SpacePresence).where(
            SpacePresence.space_id == couple["space"].id,
            SpacePresence.account_id == couple["ben"].id,
        )
    ).scalar_one()
    assert stored.last_active_at is not None


def test_ended_partner_membership_is_never_exposed_as_presence(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(presence.clock, "now", lambda: START)
    client.post(path(couple["space"].id), headers=auth(couple["ben_token"]))
    membership = relationship_service.require_membership(session, couple["ben"], couple["space"].id)
    relationship_service.end_membership(session, membership)
    session.flush()
    assert client.get(path(couple["space"].id), headers=auth(couple["anna_token"])).json() == {
        "state": None
    }


def test_no_partner_returns_no_presence_claim(client, session: Session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    solo = make_account(session, "Solo")
    space = make_space(session, solo)
    token = sign_in(session, solo)
    monkeypatch.setattr(presence.clock, "now", lambda: START)
    assert client.get(path(space.id), headers=auth(token)).json() == {"state": None}
    assert client.post(path(space.id), headers=auth(token)).json() == {"state": None}


def test_presence_is_space_scoped_for_reads_and_heartbeats(client, couple) -> None:  # type: ignore[no-untyped-def]
    responses = (
        client.get(path(couple["space"].id), headers=auth(couple["outsider_token"])),
        client.post(path(couple["space"].id), headers=auth(couple["outsider_token"])),
        client.post(path(couple["outsider_space"].id), headers=auth(couple["anna_token"])),
    )
    for response in responses:
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"
