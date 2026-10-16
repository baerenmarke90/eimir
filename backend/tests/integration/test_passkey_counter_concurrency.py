"""WebAuthn credential-counter serialization and lock-order regressions."""

from __future__ import annotations

import struct
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock
from time import sleep

import pytest
from sqlalchemy import func, select

from eimir.auth import passkeys
from eimir.core.clock import now
from eimir.identity.models import Account, DeviceSession, WebAuthnCredential
from tests.conftest import auth, make_account, requires_database, sign_in
from tests.support.authenticator import VirtualAuthenticator, from_b64url

pytestmark = [pytest.mark.integration, requires_database]

REGISTRATION_START = "/api/v1/auth/passkeys/registration/start"
REGISTRATION_FINISH = "/api/v1/auth/passkeys/registration/finish"
AUTHENTICATION_START = "/api/v1/auth/passkeys/authentication/start"
AUTHENTICATION_FINISH = "/api/v1/auth/passkeys/authentication/finish"


def _register_production(
    production_client,
    authenticator: VirtualAuthenticator,
):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as setup:
        account = make_account(setup, "Anna")
        account_id = account.id
        token = sign_in(setup, account)

    headers = auth(token)
    options = client.post(REGISTRATION_START, headers=headers).json()
    response = client.post(
        REGISTRATION_FINISH,
        json={"credential": authenticator.register(options)},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return client, maker, account_id


def _assertion_counter(credential: dict[str, object]) -> int:
    response = credential["response"]
    assert isinstance(response, dict)
    encoded = response["authenticatorData"]
    assert isinstance(encoded, str)
    authenticator_data = from_b64url(encoded)
    return struct.unpack(">I", authenticator_data[33:37])[0]


def _stored_credential(maker, authenticator: VirtualAuthenticator):  # type: ignore[no-untyped-def]
    with maker() as query:
        return query.execute(
            select(WebAuthnCredential).where(
                WebAuthnCredential.credential_id == authenticator.credential_id
            )
        ).scalar_one()


def test_concurrent_same_next_counter_has_exactly_one_winner(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, maker, account_id = _register_production(production_client, authenticator)

    first_options = client.post(AUTHENTICATION_START).json()
    second_options = client.post(AUTHENTICATION_START).json()
    authenticator.sign_count = 0
    first_assertion = authenticator.authenticate(first_options)
    authenticator.sign_count = 0
    second_assertion = authenticator.authenticate(second_options)

    real_verify = passkeys.webauthn.verify_authentication_response
    entered = 0
    entered_lock = Lock()
    second_entered = Event()

    def coordinated_verify(*args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal entered
        with entered_lock:
            entered += 1
            position = entered
            if entered >= 2:
                second_entered.set()
        if position == 1:
            # Without a credential lock both requests reach verification against
            # the same stale counter. With the lock the first request times out
            # here, commits, and only then can the second verifier run.
            second_entered.wait(timeout=1)
        return real_verify(*args, **kwargs)

    monkeypatch.setattr(passkeys.webauthn, "verify_authentication_response", coordinated_verify)
    start = Barrier(2)

    def finish(assertion):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.post(AUTHENTICATION_FINISH, json={"credential": assertion})

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(finish, first_assertion),
            pool.submit(finish, second_assertion),
        ]
        responses = [future.result(timeout=10) for future in futures]

    assert sorted(response.status_code for response in responses) == [201, 422]
    rejected = next(response for response in responses if response.status_code == 422)
    assert rejected.json()["code"] == "PASSKEY_CEREMONY_INVALID"

    stored = _stored_credential(maker, authenticator)
    assert stored.sign_count == 1
    with maker() as query:
        session_count = query.scalar(
            select(func.count(DeviceSession.id)).where(DeviceSession.account_id == account_id)
        )
    # One setup session plus exactly one successful concurrent passkey sign-in.
    assert session_count == 2


def test_concurrent_increasing_counters_cannot_regress_stored_counter(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, maker, _account_id = _register_production(production_client, authenticator)

    low_options = client.post(AUTHENTICATION_START).json()
    high_options = client.post(AUTHENTICATION_START).json()
    authenticator.sign_count = 0
    low_assertion = authenticator.authenticate(low_options)
    authenticator.sign_count = 1
    high_assertion = authenticator.authenticate(high_options)
    assert _assertion_counter(low_assertion) == 1
    assert _assertion_counter(high_assertion) == 2

    real_verify = passkeys.webauthn.verify_authentication_response
    high_entered = Event()
    low_entered = Event()

    def coordinated_verify(*args, **kwargs):  # type: ignore[no-untyped-def]
        credential = kwargs["credential"]
        counter = _assertion_counter(credential)
        if counter == 2:
            high_entered.set()
            low_entered.wait(timeout=1)
        elif counter == 1:
            low_entered.set()
            # In the unfixed implementation this lets the higher counter commit
            # before the stale lower-counter transaction writes its value last.
            sleep(0.25)
        return real_verify(*args, **kwargs)

    monkeypatch.setattr(passkeys.webauthn, "verify_authentication_response", coordinated_verify)

    with ThreadPoolExecutor(max_workers=2) as pool:
        high_future = pool.submit(
            client.post,
            AUTHENTICATION_FINISH,
            json={"credential": high_assertion},
        )
        assert high_entered.wait(timeout=5)
        low_future = pool.submit(
            client.post,
            AUTHENTICATION_FINISH,
            json={"credential": low_assertion},
        )
        high_response = high_future.result(timeout=10)
        low_response = low_future.result(timeout=10)

    assert high_response.status_code == 201, high_response.text
    assert low_response.status_code == 422
    assert low_response.json()["code"] == "PASSKEY_CEREMONY_INVALID"
    assert _stored_credential(maker, authenticator).sign_count == 2


def test_zero_counter_authenticator_remains_supported(production_client) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, maker, _account_id = _register_production(production_client, authenticator)

    for _ in range(2):
        options = client.post(AUTHENTICATION_START).json()
        assertion = authenticator.authenticate(options, increment_counter=False)
        response = client.post(AUTHENTICATION_FINISH, json={"credential": assertion})
        assert response.status_code == 201, response.text

    assert _stored_credential(maker, authenticator).sign_count == 0


def test_account_disable_wins_before_session_issuance_without_deadlock(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    authenticator = VirtualAuthenticator()
    client, maker, account_id = _register_production(production_client, authenticator)
    options = client.post(AUTHENTICATION_START).json()
    assertion = authenticator.authenticate(options)

    credential_lookup_done = Event()
    real_account_id_lookup = passkeys._credential_account_id

    def signaling_account_id_lookup(*args, **kwargs):  # type: ignore[no-untyped-def]
        result = real_account_id_lookup(*args, **kwargs)
        credential_lookup_done.set()
        return result

    monkeypatch.setattr(passkeys, "_credential_account_id", signaling_account_id_lookup)

    blocker = maker()
    try:
        account = blocker.execute(
            select(Account).where(Account.id == account_id).with_for_update()
        ).scalar_one()
        account.disabled_at = now()
        blocker.flush()

        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                client.post,
                AUTHENTICATION_FINISH,
                json={"credential": assertion},
            )
            assert credential_lookup_done.wait(timeout=5)
            # Authentication has identified the credential owner but must now
            # wait on the Account -> Credential lock order. Committing the
            # disable makes the subsequent active-account check fail closed.
            blocker.commit()
            response = future.result(timeout=10)
    finally:
        blocker.close()

    assert response.status_code == 401
    with maker() as query:
        session_count = query.scalar(
            select(func.count(DeviceSession.id)).where(DeviceSession.account_id == account_id)
        )
    assert session_count == 1
