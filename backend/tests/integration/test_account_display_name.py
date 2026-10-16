"""Account presentation-name changes must not mutate authentication identity."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from eimir.auth.sessions import authenticate, start_session
from eimir.identity import service as identity_service
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_display_name_change_keeps_account_identity_and_session(session: Session) -> None:
    account = identity_service.create_account(
        session,
        display_name="Anna",
        email="anna@example.test",
        password_hash="test-hash",
    )
    auth_identity = identity_service.local_identity(session, account)
    assert auth_identity is not None
    auth_identity_id = auth_identity.id

    device_session, tokens = start_session(session, account)
    session.flush()
    account_id = account.id
    device_session_id = device_session.id

    updated = identity_service.update_display_name(session, account, "  Änne 李  ")

    assert updated.id == account_id
    assert updated.display_name == "Änne 李"
    assert device_session.id == device_session_id
    assert device_session.revoked_at is None

    persisted_identity = identity_service.local_identity(session, account)
    assert persisted_identity is not None
    assert persisted_identity.id == auth_identity_id
    assert persisted_identity.subject == "anna@example.test"

    resolved = authenticate(session, tokens.access_token)
    assert resolved.id == account_id
    assert resolved.display_name == "Änne 李"
