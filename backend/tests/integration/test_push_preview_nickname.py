"""The push preview names the partner the way the recipient chose to call them."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.engagement import push_preview
from tests.conftest import auth, requires_database
from tests.integration.test_partner_profiles import couple as couple
from tests.integration.test_partner_profiles import nickname_path

pytestmark = [pytest.mark.integration, requires_database]


def set_nickname(client, couple, token_key: str, nickname: str) -> None:  # type: ignore[no-untyped-def]
    path = nickname_path(couple["space"].id)
    response = client.put(
        path,
        json={"nickname": nickname},
        headers={**auth(couple[token_key]), "If-Match": '"0"'},
    )
    assert response.status_code == 200, response.text


def context_for(couple, account_key: str) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    return AuthorizationContext(account_id=couple[account_key].id, space_id=couple["space"].id)


def test_recipient_nickname_for_the_partner_is_used(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    set_nickname(client, couple, "token_a", "Lieblingsmensch")
    name = push_preview._recipient_nickname_for(
        session, context_for(couple, "anna"), couple["ben"].id
    )
    assert name == "Lieblingsmensch"


def test_without_a_nickname_the_display_name_stays(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    name = push_preview._recipient_nickname_for(
        session, context_for(couple, "anna"), couple["ben"].id
    )
    assert name == ""


def test_a_nickname_is_private_to_the_person_who_gave_it(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    # Anna calls Ben something; Ben's own previews about Anna must not use it.
    set_nickname(client, couple, "token_a", "Lieblingsmensch")
    name = push_preview._recipient_nickname_for(
        session, context_for(couple, "ben"), couple["anna"].id
    )
    assert name == ""


def test_the_nickname_applies_only_to_the_partner(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    set_nickname(client, couple, "token_a", "Lieblingsmensch")
    name = push_preview._recipient_nickname_for(
        session, context_for(couple, "anna"), couple["outsider"].id
    )
    assert name == ""
