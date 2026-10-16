"""Authenticated Account-to-Space discovery for M5 clients."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def test_account_memberships_requires_authentication(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/api/v1/auth/memberships")

    assert response.status_code == 401


def test_account_memberships_returns_only_callers_active_spaces(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    first = make_space(session, anna)
    ended = make_space(session, anna)

    ben = make_account(session, "Ben")
    foreign = make_space(session, ben)

    ended_membership = session.execute(
        select(Membership).where(
            Membership.account_id == anna.id,
            Membership.space_id == ended.id,
        )
    ).scalar_one()
    ended_membership.status = MembershipStatus.LEFT.value
    session.flush()

    token = sign_in(session, anna)
    response = client.get("/api/v1/auth/memberships", headers=auth(token))

    assert response.status_code == 200
    assert response.json() == [
        {
            "spaceId": str(first.id),
            "role": "PARTNER",
            "status": "ACTIVE",
        }
    ]
    assert str(ended.id) not in response.text
    assert str(foreign.id) not in response.text
