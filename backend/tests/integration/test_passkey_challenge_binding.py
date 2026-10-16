"""Exact WebAuthn challenge binding and one-time consumption regressions."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select

from eimir.identity.models import WebAuthnChallenge, WebAuthnCredential
from tests.conftest import auth, make_account, requires_database, sign_in
from tests.support.authenticator import VirtualAuthenticator, from_b64url

pytestmark = [pytest.mark.integration, requires_database]

REGISTRATION_START = "/api/v1/auth/passkeys/registration/start"
REGISTRATION_FINISH = "/api/v1/auth/passkeys/registration/finish"
AUTHENTICATION_START = "/api/v1/auth/passkeys/authentication/start"
AUTHENTICATION_FINISH = "/api/v1/auth/passkeys/authentication/finish"


def _register_shared(
    client,
    session,
    authenticator: VirtualAuthenticator,
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    headers = auth(sign_in(session, account))
    options = client.post(REGISTRATION_START, headers=headers).json()
    response = client.post(
        REGISTRATION_FINISH,
        json={"credential": authenticator.register(options)},
        headers=headers,
    )
    assert response.status_code == 201, response.text


def _register_production(
    production_client,
    authenticator: VirtualAuthenticator,
):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as setup:
        account = make_account(setup, "Anna")
        token = sign_in(setup, account)

    headers = auth(token)
    options = client.post(REGISTRATION_START, headers=headers).json()
    response = client.post(
        REGISTRATION_FINISH,
        json={"credential": authenticator.register(options)},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return client, maker


def _stored_challenge(
    session,
    encoded_challenge: str,
) -> WebAuthnChallenge:  # type: ignore[no-untyped-def]
    return session.execute(
        select(WebAuthnChallenge).where(
            WebAuthnChallenge.challenge == from_b64url(encoded_challenge)
        )
    ).scalar_one()


def test_two_started_registrations_finish_against_their_own_challenges(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    headers = auth(sign_in(session, account))
    first_authenticator = VirtualAuthenticator()
    second_authenticator = VirtualAuthenticator()

    first_options = client.post(REGISTRATION_START, headers=headers).json()
    second_options = client.post(REGISTRATION_START, headers=headers).json()

    first = client.post(
        REGISTRATION_FINISH,
        json={"credential": first_authenticator.register(first_options)},
        headers=headers,
    )
    second = client.post(
        REGISTRATION_FINISH,
        json={"credential": second_authenticator.register(second_options)},
        headers=headers,
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert len(session.execute(select(WebAuthnCredential)).scalars().all()) == 2


def test_two_started_authentications_finish_independently(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    _register_shared(client, session, authenticator)

    first_options = client.post(AUTHENTICATION_START).json()
    second_options = client.post(AUTHENTICATION_START).json()
    first_assertion = authenticator.authenticate(first_options)
    second_assertion = authenticator.authenticate(second_options)

    first = client.post(AUTHENTICATION_FINISH, json={"credential": first_assertion})
    second = client.post(AUTHENTICATION_FINISH, json={"credential": second_assertion})

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text


def test_invalid_assertion_consumes_only_its_matching_challenge(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    _register_shared(client, session, authenticator)

    first_options = client.post(AUTHENTICATION_START).json()
    second_options = client.post(AUTHENTICATION_START).json()
    bad_assertion = authenticator.authenticate(
        first_options,
        sign_with=ec.generate_private_key(ec.SECP256R1()),
    )

    rejected = client.post(AUTHENTICATION_FINISH, json={"credential": bad_assertion})
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "PASSKEY_CEREMONY_INVALID"

    first_row = _stored_challenge(session, first_options["challenge"])
    second_row = _stored_challenge(session, second_options["challenge"])
    assert first_row.consumed_at is not None
    assert second_row.consumed_at is None

    valid_assertion = authenticator.authenticate(second_options)
    accepted = client.post(AUTHENTICATION_FINISH, json={"credential": valid_assertion})
    assert accepted.status_code == 201, accepted.text


def test_rejected_assertion_consumption_survives_request_rollback(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, maker = _register_production(production_client, authenticator)

    first_options = client.post(AUTHENTICATION_START).json()
    second_options = client.post(AUTHENTICATION_START).json()
    bad_assertion = authenticator.authenticate(
        first_options,
        sign_with=ec.generate_private_key(ec.SECP256R1()),
    )

    rejected = client.post(AUTHENTICATION_FINISH, json={"credential": bad_assertion})
    assert rejected.status_code == 422

    with maker() as committed:
        first_row = _stored_challenge(committed, first_options["challenge"])
        second_row = _stored_challenge(committed, second_options["challenge"])
        assert first_row.consumed_at is not None
        assert second_row.consumed_at is None

    valid_assertion = authenticator.authenticate(second_options)
    accepted = client.post(AUTHENTICATION_FINISH, json={"credential": valid_assertion})
    assert accepted.status_code == 201, accepted.text


def test_concurrent_finishes_for_same_challenge_have_one_winner(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, _maker = _register_production(production_client, authenticator)
    options = client.post(AUTHENTICATION_START).json()
    assertion = authenticator.authenticate(options)

    start = Barrier(2)

    def finish(_: int):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.post(AUTHENTICATION_FINISH, json={"credential": assertion})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(finish, range(2)))

    assert sorted(response.status_code for response in responses) == [201, 422]
    rejected = next(response for response in responses if response.status_code == 422)
    assert rejected.json()["code"] == "PASSKEY_CEREMONY_INVALID"
