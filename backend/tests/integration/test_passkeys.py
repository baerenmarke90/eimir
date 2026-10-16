"""Passkeys: registration and authentication against a virtual authenticator.

The authenticator in `tests/support/authenticator.py` signs with a real P-256
key. This makes the suite exercise signature, flag, and counter verification
for real rather than merely verifying that a library was called.
"""

from __future__ import annotations

from typing import Any

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import passkeys
from eimir.identity.models import DeviceSession, WebAuthnChallenge, WebAuthnCredential
from tests.conftest import auth, make_account, requires_database, sign_in
from tests.support.authenticator import VirtualAuthenticator

pytestmark = [pytest.mark.integration, requires_database]

REGISTRATION_START = "/api/v1/auth/passkeys/registration/start"
REGISTRATION_FINISH = "/api/v1/auth/passkeys/registration/finish"
AUTHENTICATION_START = "/api/v1/auth/passkeys/authentication/start"
AUTHENTICATION_FINISH = "/api/v1/auth/passkeys/authentication/finish"


@pytest.fixture
def authenticator() -> VirtualAuthenticator:
    return VirtualAuthenticator()


@pytest.fixture
def anna(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    session.flush()
    return {"account": account, "headers": auth(sign_in(session, account))}


def register_passkey(
    client,
    anna,
    authenticator: VirtualAuthenticator,
    **extra: Any,
):  # type: ignore[no-untyped-def]
    options = client.post(REGISTRATION_START, headers=anna["headers"]).json()
    credential_response = authenticator.register(options, **extra)
    return client.post(
        REGISTRATION_FINISH,
        json={"credential": credential_response, "name": "Mein Telefon"},
        headers=anna["headers"],
    )


def authenticate_with_passkey(
    client,
    authenticator: VirtualAuthenticator,
    **extra: Any,
):  # type: ignore[no-untyped-def]
    options = client.post(AUTHENTICATION_START).json()
    credential_response = authenticator.authenticate(options, **extra)
    return client.post(
        AUTHENTICATION_FINISH,
        json={"credential": credential_response, "deviceName": "Pixel"},
    )


class TestRegistration:
    def test_passkey_is_created(self, client, session, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        response = register_passkey(client, anna, authenticator)
        assert response.status_code == 201, response.text
        assert response.json()["name"] == "Mein Telefon"

        stored = session.execute(select(WebAuthnCredential)).scalars().all()
        assert len(stored) == 1
        assert stored[0].credential_id == authenticator.credential_id
        assert stored[0].account_id == anna["account"].id
        assert stored[0].is_discoverable is True

    def test_registration_options_require_discoverable_credentials(self, client, anna) -> None:  # type: ignore[no-untyped-def]
        options = client.post(REGISTRATION_START, headers=anna["headers"]).json()

        selection = options["authenticatorSelection"]
        assert selection["residentKey"] == "required"
        assert selection["requireResidentKey"] is True

    def test_authenticator_without_resident_key_support_cannot_register(
        self, client, session, anna
    ) -> None:  # type: ignore[no-untyped-def]
        options = client.post(REGISTRATION_START, headers=anna["headers"]).json()
        non_resident = VirtualAuthenticator(supports_resident_key=False)

        with pytest.raises(ValueError, match="discoverable credential"):
            non_resident.register(options)

        session.expire_all()
        assert session.execute(select(WebAuthnCredential)).scalars().all() == []

    def test_private_key_never_reaches_the_server(
        self, client, session, anna, authenticator
    ) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        stored = session.execute(select(WebAuthnCredential)).scalars().one()

        secret = authenticator.private_key.private_numbers().private_value.to_bytes(32, "big")
        assert secret not in stored.public_key

    def test_registration_start_requires_authentication(self, client) -> None:  # type: ignore[no-untyped-def]
        assert client.post(REGISTRATION_START).status_code == 401

    def test_options_list_known_credentials(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        """Prevent registering the same authenticator twice."""
        register_passkey(client, anna, authenticator)
        options = client.post(REGISTRATION_START, headers=anna["headers"]).json()
        assert len(options["excludeCredentials"]) == 1

    def test_wrong_origin_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        response = register_passkey(
            client,
            anna,
            authenticator,
            origin="https://boese.example",
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PASSKEY_CEREMONY_INVALID"

    def test_wrong_rp_id_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        response = register_passkey(client, anna, authenticator, rp_id="boese.example")
        assert response.status_code == 422

    def test_unstarted_ceremony_cannot_be_reused(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        options = client.post(REGISTRATION_START, headers=anna["headers"]).json()
        credential_response = authenticator.register(options)
        assert (
            client.post(
                REGISTRATION_FINISH,
                json={"credential": credential_response},
                headers=anna["headers"],
            ).status_code
            == 201
        )
        # The challenge is consumed; the same response cannot be used twice.
        second = client.post(
            REGISTRATION_FINISH,
            json={"credential": credential_response},
            headers=anna["headers"],
        )
        assert second.status_code == 422

    def test_same_credential_id_is_global_unique(
        self, client, session, anna, authenticator
    ) -> None:  # type: ignore[no-untyped-def]
        """Credential IDs are globally unique, including across accounts."""
        register_passkey(client, anna, authenticator)

        ben = make_account(session, "Ben")
        session.flush()
        other = {"account": ben, "headers": auth(sign_in(session, ben))}
        response = register_passkey(client, other, authenticator)
        assert response.status_code == 422


class TestAuthentication:
    def test_sign_in_with_passkey(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        response = authenticate_with_passkey(client, authenticator)
        assert response.status_code == 201, response.text

        access_token = response.json()["tokens"]["accessToken"]
        assert client.get("/api/v1/auth/me", headers=auth(access_token)).status_code == 200

    def test_exactly_one_device_session_is_created(
        self, client, session, anna, authenticator
    ) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        before = len(session.execute(select(DeviceSession)).scalars().all())
        authenticate_with_passkey(client, authenticator)
        assert len(session.execute(select(DeviceSession)).scalars().all()) == before + 1

    def test_unknown_credential_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        foreign_authenticator = VirtualAuthenticator()
        response = authenticate_with_passkey(client, foreign_authenticator)
        assert response.status_code == 422
        assert response.json()["code"] == "PASSKEY_CEREMONY_INVALID"

    def test_foreign_signature_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        foreign_private_key = ec.generate_private_key(ec.SECP256R1())
        response = authenticate_with_passkey(
            client,
            authenticator,
            sign_with=foreign_private_key,
        )
        assert response.status_code == 422

    def test_wrong_origin_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        response = authenticate_with_passkey(
            client,
            authenticator,
            origin="https://boese.example",
        )
        assert response.status_code == 422

    def test_wrong_rp_id_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        response = authenticate_with_passkey(client, authenticator, rp_id="boese.example")
        assert response.status_code == 422

    def test_foreign_challenge_is_rejected(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        """An assertion belongs to exactly the ceremony that requested it."""
        register_passkey(client, anna, authenticator)
        client.post(AUTHENTICATION_START)
        fabricated = authenticator.authenticate({"challenge": "ZXR3YXMtYW5kZXJlcw"})
        response = client.post(AUTHENTICATION_FINISH, json={"credential": fabricated})
        assert response.status_code == 422

    def test_assertion_is_valid_exactly_once(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        options = client.post(AUTHENTICATION_START).json()
        assertion = authenticator.authenticate(options)

        assert client.post(AUTHENTICATION_FINISH, json={"credential": assertion}).status_code == 201
        second = client.post(AUTHENTICATION_FINISH, json={"credential": assertion})
        assert second.status_code == 422


class TestSignatureCounter:
    def test_counter_is_persisted(self, client, session, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        authenticate_with_passkey(client, authenticator)

        session.expire_all()
        stored = session.execute(select(WebAuthnCredential)).scalars().one()
        assert stored.sign_count == authenticator.sign_count
        assert stored.last_used_at is not None

    def test_stalled_counter_indicates_a_copy(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        authenticate_with_passkey(client, authenticator)
        authenticate_with_passkey(client, authenticator)

        response = authenticate_with_passkey(
            client,
            authenticator,
            increment_counter=False,
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PASSKEY_CEREMONY_INVALID"

    def test_authenticator_without_counter_remains_allowed(self, client, anna) -> None:  # type: ignore[no-untyped-def]
        """Many passkeys do not count at all; rejecting them would lock all of them out."""
        counterless = VirtualAuthenticator()
        register_passkey(client, anna, counterless)

        for _ in range(3):
            response = authenticate_with_passkey(
                client,
                counterless,
                increment_counter=False,
            )
            assert response.status_code == 201

    def test_discoverable_registration_remains_discoverable_after_authentication(
        self, client, session, anna, authenticator
    ) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        session.expire_all()
        assert session.execute(select(WebAuthnCredential)).scalars().one().is_discoverable is True

        authenticate_with_passkey(client, authenticator)
        session.expire_all()
        assert session.execute(select(WebAuthnCredential)).scalars().one().is_discoverable is True


class TestCeremonyState:
    def test_start_discloses_no_accounts(self, client, anna, authenticator) -> None:  # type: ignore[no-untyped-def]
        """Authentication starts without an account reference or candidate list."""
        register_passkey(client, anna, authenticator)
        options = client.post(AUTHENTICATION_START).json()
        assert not options.get("allowCredentials")
        assert "Anna" not in str(options)

    def test_maintenance_prunes_consumed_challenges(
        self, client, session, anna, authenticator
    ) -> None:  # type: ignore[no-untyped-def]
        register_passkey(client, anna, authenticator)
        authenticate_with_passkey(client, authenticator)

        assert passkeys.prune_challenges(session) == 2
        session.flush()
        assert session.execute(select(WebAuthnChallenge)).scalars().all() == []
