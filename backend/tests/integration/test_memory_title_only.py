"""Focused acceptance for the minimal valid Memory create payload."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def test_memory_can_be_created_with_title_only(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    space = make_space(session, account)
    session.flush()
    token = sign_in(session, account)

    response = client.post(
        f"/api/v1/spaces/{space.id}/memories",
        json={"title": "Title only"},
        headers=auth(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Title only"
    assert body["body"] == ""
    assert body["happenedOn"] is None
    assert body["attachments"] == []
