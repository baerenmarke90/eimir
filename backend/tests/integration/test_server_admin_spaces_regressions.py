"""Regression coverage for ServerAdmin Space lifecycle projections."""

from __future__ import annotations

from datetime import datetime

import pytest

from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.relationship import service as relationship
from eimir.relationship.models import Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator-spaces-regression@example.test"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin_token(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Space regression operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=ADMIN_EMAIL,
            is_primary=True,
            verified_at=now(),
        )
    )
    session.flush()
    return sign_in(session, account)


def _parse_api_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_first_membership_timestamp_survives_relationship_end(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    token = _admin_token(session)
    owner = make_account(session, "Departed owner")
    space = make_space(session, owner)
    membership = relationship.require_membership(session, owner, space.id)
    original_created_at = membership.created_at

    relationship.end_membership(session, membership)
    session.flush()

    response = client.get(
        f"/api/v1/server-admin/spaces/{space.id}",
        headers=auth(token),
    )

    assert response.status_code == 200
    assert _parse_api_datetime(response.json()["firstMembershipAt"]) == original_created_at


def test_space_directory_pagination_is_stable_for_equal_created_at(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    token = _admin_token(session)
    tied_created_at = now()
    spaces = [Space(), Space(), Space()]
    session.add_all(spaces)
    session.flush()
    for space in spaces:
        space.created_at = tied_created_at
    session.flush()

    expected_ids = [
        str(space.id) for space in sorted(spaces, key=lambda item: item.id, reverse=True)
    ]
    page_ids: list[str] = []
    for offset in range(len(spaces)):
        response = client.get(
            f"/api/v1/server-admin/spaces?status=empty&limit=1&offset={offset}",
            headers=auth(token),
        )
        assert response.status_code == 200
        assert response.json()["total"] == len(spaces)
        page_ids.append(response.json()["items"][0]["id"])

    assert page_ids == expected_ids
    assert len(set(page_ids)) == len(spaces)
