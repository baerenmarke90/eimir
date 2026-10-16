"""Passkey-specific recent-authentication security coverage."""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth.recent_auth_models import RecentAuthenticationGrant
from eimir.identity.models import DeviceSession
from tests.conftest import auth, make_account, requires_database, sign_in
from tests.support.authenticator import VirtualAuthenticator

pytestmark = [pytest.mark.integration, requires_database]

REGISTRATION_START = "/api/v1/auth/passkeys/registration/start"
REGISTRATION_FINISH = "/api/v1/auth/passkeys/registration/finish"
STEP_UP_START = "/api/v1/auth/recent-authentication/account-deletion/passkeys/start"
STEP_UP_FINISH = "/api/v1/auth/recent-authentication/account-deletion/passkeys/finish"


def _register(client, headers, authenticator: VirtualAuthenticator) -> None:  # type: ignore[no-untyped-def]
    options_response = client.post(REGISTRATION_START, headers=headers)
    assert options_response.status_code == 201, options_response.text
    credential = authenticator.register(options_response.json())
    response = client.post(
        REGISTRATION_FINISH,
        headers=headers,
        json={"credential": credential, "name": "Step-up key"},
    )
    assert response.status_code == 201, response.text


def _account(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Recent Passkey")
    session.flush()
    token = sign_in(session, account)
    return account, auth(token)


def _grant_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(RecentAuthenticationGrant)).scalar_one()


def test_step_up_requires_user_verification_and_creates_no_new_session(
    client,
    session: Session,
) -> None:  # type: ignore[no-untyped-def]
    _, headers = _account(session)
    authenticator = VirtualAuthenticator()
    _register(client, headers, authenticator)
    before = session.execute(select(func.count()).select_from(DeviceSession)).scalar_one()

    start = client.post(STEP_UP_START, headers=headers)
    assert start.status_code == 201, start.text
    options = start.json()
    assert options["userVerification"] == "required"
    assert len(options["allowCredentials"]) == 1

    assertion = authenticator.authenticate(options)
    finish = client.post(STEP_UP_FINISH, headers=headers, json={"credential": assertion})
    assert finish.status_code == 200, finish.text
    assert finish.json()["method"] == "PASSKEY"
    after = session.execute(select(func.count()).select_from(DeviceSession)).scalar_one()
    assert after == before
    assert _grant_count(session) == 1


def test_step_up_without_authenticator_user_verification_is_rejected(
    client,
    session: Session,
) -> None:  # type: ignore[no-untyped-def]
    _, headers = _account(session)
    authenticator = VirtualAuthenticator()
    _register(client, headers, authenticator)

    options = client.post(STEP_UP_START, headers=headers).json()
    assertion = authenticator.authenticate(options, user_verified=False)
    finish = client.post(STEP_UP_FINISH, headers=headers, json={"credential": assertion})

    assert finish.status_code == 422
    assert finish.json()["code"] == "PASSKEY_CEREMONY_INVALID"
    assert _grant_count(session) == 0


def test_step_up_assertion_is_not_replayable(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    _, headers = _account(session)
    authenticator = VirtualAuthenticator()
    _register(client, headers, authenticator)

    options = client.post(STEP_UP_START, headers=headers).json()
    assertion = authenticator.authenticate(options)
    first = client.post(STEP_UP_FINISH, headers=headers, json={"credential": assertion})
    second = client.post(STEP_UP_FINISH, headers=headers, json={"credential": assertion})

    assert first.status_code == 200, first.text
    assert second.status_code == 422
    assert second.json()["code"] == "PASSKEY_CEREMONY_INVALID"
    assert _grant_count(session) == 1


def test_step_up_challenge_is_bound_to_the_session_that_started_it(
    client,
    session: Session,
) -> None:  # type: ignore[no-untyped-def]
    account, first_headers = _account(session)
    second_headers = auth(sign_in(session, account))
    authenticator = VirtualAuthenticator()
    _register(client, first_headers, authenticator)

    options = client.post(STEP_UP_START, headers=first_headers).json()
    assertion = authenticator.authenticate(options)
    wrong_session = client.post(
        STEP_UP_FINISH,
        headers=second_headers,
        json={"credential": assertion},
    )
    assert wrong_session.status_code == 422
    assert _grant_count(session) == 0

    correct_session = client.post(
        STEP_UP_FINISH,
        headers=first_headers,
        json={"credential": assertion},
    )
    assert correct_session.status_code == 200, correct_session.text
