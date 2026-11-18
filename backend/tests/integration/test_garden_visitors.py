"""HTTP/PostgreSQL acceptance tests for the garden's named visitors (#1907 H3 follow-up)."""

# The shared fixtures come from the core garden tests and are re-bound per test.
# ruff: noqa: F811

from __future__ import annotations

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.entitlements.models import EntitlementGrant
from eimir.garden.models import Garden, GardenVisitorName
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Space
from tests.conftest import auth, requires_database
from tests.integration.test_garden import (  # noqa: F401 (fixtures)
    DAY_ONE,
    _h,
    _url,
    couple,
    premium,
)

pytestmark = [pytest.mark.integration, requires_database]


def _visitor(client, couple, animal, name, who="a"):  # type: ignore[no-untyped-def]
    return client.put(
        _url(couple, f"/visitors/{animal}/name"), headers=_h(couple, who), json={"name": name}
    )


def _rows(session: Session, couple) -> list[tuple[str, str]]:  # type: ignore[no-untyped-def]
    rows = session.scalars(
        select(GardenVisitorName).where(GardenVisitorName.space_id == couple["space"].id)
    )
    return sorted((row.animal, row.name) for row in rows)


def test_naming_a_visitor_requires_the_games_capability(client, couple, session) -> None:  # type: ignore[no-untyped-def]
    response = _visitor(client, couple, "SNAIL", "Frieda")
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert _rows(session, couple) == []


def test_a_new_garden_has_no_visitor_names(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert client.get(_url(premium), headers=_h(premium)).json()["visitorNames"] == []


def test_either_partner_names_a_visitor_and_both_see_it(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    named = _visitor(client, premium, "SNAIL", "  Frieda  ")
    assert named.status_code == 200
    assert named.headers["cache-control"] == "private, no-store"
    assert named.json()["visitorNames"] == [{"animal": "SNAIL", "name": "Frieda"}]

    # The duck pair shares one name; the partner names it and both read the same list.
    assert _visitor(client, premium, "DUCKS", "Lotte   &  Otto", "b").status_code == 200
    expected = [
        {"animal": "SNAIL", "name": "Frieda"},
        {"animal": "DUCKS", "name": "Lotte & Otto"},
    ]
    assert client.get(_url(premium), headers=_h(premium)).json()["visitorNames"] == expected
    assert client.get(_url(premium), headers=_h(premium, "b")).json()["visitorNames"] == expected

    # Renaming replaces the one shared name instead of adding a second row.
    renamed = _visitor(client, premium, "SNAIL", "Turbo", "b")
    assert renamed.json()["visitorNames"][0] == {"animal": "SNAIL", "name": "Turbo"}
    assert _rows(session, premium) == [("DUCKS", "Lotte & Otto"), ("SNAIL", "Turbo")]
    # The garden's own name is independent of its visitors.
    assert renamed.json()["name"] is None
    assert session.get(Garden, premium["space"].id) is None


def test_clearing_a_visitor_name_removes_it(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _visitor(client, premium, "HEDGEHOG", "Pieks")
    _visitor(client, premium, "DEER", "Fenja")
    cleared = _visitor(client, premium, "HEDGEHOG", "   ", "b")
    assert cleared.status_code == 200
    assert cleared.json()["visitorNames"] == [{"animal": "DEER", "name": "Fenja"}]
    assert _rows(session, premium) == [("DEER", "Fenja")]
    # Clearing an unnamed visitor, or sending no name at all, is a quiet no-op.
    assert _visitor(client, premium, "RABBIT", None).status_code == 200
    empty = client.put(_url(premium, "/visitors/RABBIT/name"), headers=_h(premium), json={})
    assert empty.status_code == 200
    assert _rows(session, premium) == [("DEER", "Fenja")]


def test_visitor_name_validation(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    exact = _visitor(client, premium, "RABBIT", "x" * 40)
    assert exact.status_code == 200
    assert exact.json()["visitorNames"] == [{"animal": "RABBIT", "name": "x" * 40}]

    too_long = _visitor(client, premium, "RABBIT", "x" * 41)
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "GARDEN_VISITOR_NAME_TOO_LONG"
    for animal in ("UNICORN", "rabbit"):
        assert _visitor(client, premium, animal, "Hoppel").status_code == 422
    extra = client.put(
        _url(premium, "/visitors/RABBIT/name"),
        headers=_h(premium),
        json={"name": "Hoppel", "colour": "brown"},
    )
    assert extra.status_code == 422
    assert _rows(session, premium) == [("RABBIT", "x" * 40)]


def test_outsider_cannot_name_or_read_visitors(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _visitor(client, premium, "SNAIL", "Frieda")
    outsider = auth(premium["token_outsider"])
    write = client.put(
        _url(premium, "/visitors/SNAIL/name"), headers=outsider, json={"name": "Turbo"}
    )
    assert write.status_code in {403, 404}
    assert client.get(_url(premium), headers=outsider).status_code in {403, 404}
    assert _rows(session, premium) == [("SNAIL", "Frieda")]


def test_visitor_names_stay_stored_after_a_downgrade(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _visitor(client, premium, "SQUIRREL", "Flitzi")
    session.execute(
        delete(EntitlementGrant).where(EntitlementGrant.space_id == premium["space"].id)
    )
    session.flush()
    blocked = _visitor(client, premium, "SQUIRREL", "Eddi")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert client.get(_url(premium), headers=_h(premium)).status_code == 403
    # The name stays stored and returns with Pro.
    assert _rows(session, premium) == [("SQUIRREL", "Flitzi")]


def test_visitor_names_leave_with_the_couple(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _visitor(client, premium, "DUCKS", "Pip & Pünktchen")
    membership = next(
        member
        for member in relationship_service.active_memberships(session, premium["space"].id)
        if member.account_id == premium["ben"].id
    )
    relationship_service.end_membership(session, membership)
    session.flush()
    assert _rows(session, premium) == []


def test_visitor_names_cascade_with_the_space(session, premium) -> None:  # type: ignore[no-untyped-def]
    space_id = premium["space"].id
    session.add(
        GardenVisitorName(space_id=space_id, animal="DEER", name="Fenja", updated_at=DAY_ONE)
    )
    session.flush()
    session.execute(delete(Space).where(Space.id == space_id))
    session.expire_all()
    remaining = session.scalars(
        select(GardenVisitorName.animal).where(GardenVisitorName.space_id == space_id)
    ).all()
    assert remaining == []


@pytest.mark.parametrize(("animal", "name"), [("UNICORN", "Glitzer"), ("SNAIL", "  ")])
def test_visitor_name_constraints_hold_in_the_database(session, premium, animal, name) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            GardenVisitorName(
                space_id=premium["space"].id, animal=animal, name=name, updated_at=DAY_ONE
            )
        )
        session.flush()
