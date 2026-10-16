"""Magic link, address verification, and account recovery through the endpoints.

All three flows share the same privacy boundary: a caller entering an address
must not learn from the response whether that address exists. A token issued
for one flow must not be valid in another flow.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.auth.tokens import hash_token
from eimir.core.clock import now
from eimir.identity.models import (
    Account,
    AccountEmail,
    AccountRecoveryToken,
    AuthIdentity,
    AuthProvider,
    DeviceSession,
    EmailVerificationToken,
    MagicLinkToken,
)
from eimir.mail import MailMessage, MailSender
from tests.conftest import auth, requires_database

pytestmark = [pytest.mark.integration, requires_database]

GOOD_PASSWORD = "ein-ausreichend-langes-passwort"
NEW_PASSWORD = "ein-anderes-ausreichend-langes-passwort"
ADDRESS = "anna@example.org"


class Mailbox(MailSender):
    "Collect messages instead of sending them."

    def __init__(self) -> None:
        self.messages: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)

    @property
    def latest_token(self) -> str:
        match = re.search(r"token=([A-Za-z0-9_\-]+)", self.messages[-1].body)
        assert match is not None, "The message contains no link"
        return match.group(1)


@pytest.fixture
def mailbox() -> Mailbox:
    return Mailbox()


@pytest.fixture
def client(session: Session, mailbox: Mailbox) -> Iterator[object]:  # type: ignore[override]
    "Use the shared client configuration with a capturing mailbox."
    from fastapi.testclient import TestClient

    from eimir.db.session import get_session
    from eimir.mail import sender
    from eimir.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[sender] = lambda: mailbox
    yield TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def anna(session: Session, client):  # type: ignore[no-untyped-def]
    "A registered account with a password."
    from tests.conftest import TEST_BOOTSTRAP_TOKEN

    response = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Anna",
            "email": ADDRESS,
            "password": GOOD_PASSWORD,
            "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
        },
    )
    assert response.status_code == 201
    return response.json()


def address_for(session: Session) -> AccountEmail:
    return session.execute(select(AccountEmail).where(AccountEmail.email == ADDRESS)).scalar_one()


class TestInstanceWithoutMailTransport:
    """`EIMIR_MAIL_TRANSPORT=none` makes mail-backed capabilities unavailable.

    Returning `202 Accepted` would be incorrect because no message is created,
    while a token and consumed rate-limit budget could still be stored.
    """

    @pytest.fixture
    def client_without_mail_transport(self, session: Session, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
        from fastapi.testclient import TestClient

        from eimir.config import MailTransport, get_settings
        from eimir.db.session import get_session
        from eimir.main import create_app

        settings = get_settings().model_copy(update={"mail_transport": MailTransport.NONE})
        monkeypatch.setattr("eimir.config.get_settings", lambda: settings)

        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        with TestClient(app) as client:
            yield client

    def test_magic_link_reports_missing_capability(
        self, client_without_mail_transport, anna
    ) -> None:  # type: ignore[no-untyped-def]
        response = client_without_mail_transport.post(
            "/api/v1/auth/magic-link/request", json={"email": ADDRESS}
        )
        assert response.status_code == 503
        assert response.json()["code"] == "MAIL_TRANSPORT_UNAVAILABLE"

    def test_recovery_reports_missing_capability(self, client_without_mail_transport, anna) -> None:  # type: ignore[no-untyped-def]
        response = client_without_mail_transport.post(
            "/api/v1/auth/recovery/request", json={"email": ADDRESS}
        )
        assert response.status_code == 503

    def test_no_token_is_created(self, client_without_mail_transport, session, anna) -> None:  # type: ignore[no-untyped-def]
        "The endpoint stops before token creation."
        client_without_mail_transport.post(
            "/api/v1/auth/magic-link/request", json={"email": ADDRESS}
        )
        assert session.execute(select(MagicLinkToken)).scalars().all() == []

    def test_password_sign_in_remains_possible(self, client_without_mail_transport, anna) -> None:  # type: ignore[no-untyped-def]
        "Missing mail transport removes mail-backed methods, not password sign-in."
        response = client_without_mail_transport.post(
            "/api/v1/auth/sign-in",
            json={"email": ADDRESS, "password": GOOD_PASSWORD, "deviceName": "Test"},
        )
        assert response.status_code == 200


class TestMagicLink:
    def test_known_address_gets_link(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        response = client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        assert response.status_code == 202
        assert len(mailbox.messages) == 1
        assert mailbox.messages[0].to == ADDRESS
        assert "token=" in mailbox.messages[0].body

    def test_unknown_address_looks_the_same(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        "Otherwise this endpoint would become an account directory."
        known = client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        unknown = client.post(
            "/api/v1/auth/magic-link/request", json={"email": "niemand@example.org"}
        )
        assert known.status_code == unknown.status_code == 202
        assert known.text == unknown.text
        assert [message.to for message in mailbox.messages] == [ADDRESS]

    def test_link_signs_in(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        response = client.post(
            "/api/v1/auth/magic-link/consume",
            json={"token": mailbox.latest_token, "deviceName": "Pixel"},
        )
        assert response.status_code == 201

        access_token = response.json()["tokens"]["accessToken"]
        assert client.get("/api/v1/auth/me", headers=auth(access_token)).status_code == 200

    def test_redeemed_link_verifies_address(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        "Opening the link in the mailbox proves control of the address."
        assert address_for(session).verified_at is None

        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        client.post("/api/v1/auth/magic-link/consume", json={"token": mailbox.latest_token})
        session.expire_all()
        assert address_for(session).verified_at is not None

    def test_link_applies_exactly_once(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        token = mailbox.latest_token
        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": token}).status_code == 201
        )

        second = client.post("/api/v1/auth/magic-link/consume", json={"token": token})
        assert second.status_code == 422
        assert second.json()["code"] == "ACTION_TOKEN_INVALID"

    def test_new_request_invalidates_old_link(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        "Otherwise valid sign-in credentials would accumulate in the mailbox."
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        old_token = mailbox.latest_token
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        new_token = mailbox.latest_token

        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": old_token}).status_code
            == 422
        )
        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": new_token}).status_code
            == 201
        )

    def test_expired_link_is_rejected(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        token = mailbox.latest_token

        model = session.execute(
            select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(token))
        ).scalar_one()
        model.expires_at = now() - timedelta(minutes=1)
        session.flush()

        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": token}).status_code == 422
        )

    def test_malformed_link_is_rejected(self, client, anna) -> None:  # type: ignore[no-untyped-def]
        for token in ("", "nicht-echt", "x" * 200):
            assert (
                client.post("/api/v1/auth/magic-link/consume", json={"token": token}).status_code
                == 422
            )

    def test_plaintext_is_not_stored_in_database(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        token = mailbox.latest_token

        hashes = session.execute(select(MagicLinkToken.token_hash)).scalars().all()
        assert token not in hashes
        assert hash_token(token) in hashes

    def test_too_many_requests_are_throttled(self, client, anna) -> None:  # type: ignore[no-untyped-def]
        for _ in range(rate_limit.MAGIC_LINK.attempts):
            assert (
                client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS}).status_code
                == 202
            )
        throttled = client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        assert throttled.status_code == 429
        assert throttled.json()["code"] == "RATE_LIMITED"

    def test_rate_limit_also_applies_to_unknown_addresses(self, client, anna) -> None:  # type: ignore[no-untyped-def]
        "Otherwise behavioral differences would disclose address existence."
        for _ in range(rate_limit.MAGIC_LINK.attempts):
            client.post("/api/v1/auth/magic-link/request", json={"email": "wer@example.org"})
        throttled = client.post(
            "/api/v1/auth/magic-link/request", json={"email": "wer@example.org"}
        )
        assert throttled.status_code == 429


class TestEmailVerification:
    def test_signed_in_account_can_request_and_verify(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        headers = auth(anna["tokens"]["accessToken"])
        assert (
            client.post("/api/v1/auth/email/verification/request", headers=headers).status_code
            == 202
        )

        response = client.post(
            "/api/v1/auth/email/verification/confirm",
            json={"token": mailbox.latest_token},
        )
        assert response.status_code == 204

        session.expire_all()
        assert address_for(session).verified_at is not None

    def test_without_sign_in_no_delivery(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        assert client.post("/api/v1/auth/email/verification/request").status_code == 401
        assert mailbox.messages == []

    def test_already_verified_address_gets_nothing(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        address_for(session).verified_at = now()
        session.flush()

        headers = auth(anna["tokens"]["accessToken"])
        assert (
            client.post("/api/v1/auth/email/verification/request", headers=headers).status_code
            == 202
        )
        assert mailbox.messages == []


class TestRecovery:
    def _request_link(self, client, mailbox) -> str:  # type: ignore[no-untyped-def]
        assert (
            client.post("/api/v1/auth/recovery/request", json={"email": ADDRESS}).status_code == 202
        )
        return mailbox.latest_token

    def test_new_password_works_and_old_password_does_not(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        token = self._request_link(client, mailbox)
        response = client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": NEW_PASSWORD},
        )
        assert response.status_code == 201

        old_response = client.post(
            "/api/v1/auth/sign-in", json={"email": ADDRESS, "password": GOOD_PASSWORD}
        )
        assert old_response.status_code == 401
        new_response = client.post(
            "/api/v1/auth/sign-in", json={"email": ADDRESS, "password": NEW_PASSWORD}
        )
        assert new_response.status_code == 200

    def test_all_existing_sessions_end(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        "A password reset often follows suspected unauthorized access."
        old_access_token = anna["tokens"]["accessToken"]
        assert client.get("/api/v1/auth/me", headers=auth(old_access_token)).status_code == 200

        token = self._request_link(client, mailbox)
        response = client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": NEW_PASSWORD},
        )

        assert client.get("/api/v1/auth/me", headers=auth(old_access_token)).status_code == 401
        new_access_token = response.json()["tokens"]["accessToken"]
        assert client.get("/api/v1/auth/me", headers=auth(new_access_token)).status_code == 200

    def test_unknown_address_looks_the_same(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        known = client.post("/api/v1/auth/recovery/request", json={"email": ADDRESS})
        unknown = client.post(
            "/api/v1/auth/recovery/request", json={"email": "niemand@example.org"}
        )
        assert known.status_code == unknown.status_code == 202
        assert known.text == unknown.text
        assert len(mailbox.messages) == 1

    def test_account_without_password_gets_no_link(self, client, session, mailbox) -> None:  # type: ignore[no-untyped-def]
        "Recovery does not create an additional sign-in method."
        account = Account(display_name="Nur OIDC")
        session.add(account)
        session.flush()
        session.add(AccountEmail(account_id=account.id, email="oidc@example.org", is_primary=True))
        session.add(
            AuthIdentity(
                account_id=account.id,
                provider=AuthProvider.OIDC.value,
                issuer="https://idp.example",
                subject="abc",
                connection_id="haupt",
            )
        )
        session.flush()

        assert (
            client.post(
                "/api/v1/auth/recovery/request", json={"email": "oidc@example.org"}
            ).status_code
            == 202
        )
        assert mailbox.messages == []

    def test_weak_password_does_not_consume_token(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        token = self._request_link(client, mailbox)
        weak_response = client.post(
            "/api/v1/auth/recovery/consume", json={"token": token, "newPassword": "kurz"}
        )
        assert weak_response.status_code == 422

        retry = client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": NEW_PASSWORD},
        )
        assert retry.status_code == 201

    def test_token_applies_exactly_once(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        token = self._request_link(client, mailbox)
        client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": NEW_PASSWORD},
        )
        second = client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": "noch-ein-langes-passwort-hier"},
        )
        assert second.status_code == 422


class TestTokenScopeIsolation:
    "Separate tables make tokens unresolvable outside their intended flow."

    def test_magic_link_token_does_not_work_for_recovery(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        token = mailbox.latest_token

        response = client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": token, "newPassword": NEW_PASSWORD},
        )
        assert response.status_code == 422

    def test_recovery_token_does_not_sign_in(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        client.post("/api/v1/auth/recovery/request", json={"email": ADDRESS})
        token = mailbox.latest_token

        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": token}).status_code == 422
        )

    def test_verification_token_does_not_sign_in(self, client, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        headers = auth(anna["tokens"]["accessToken"])
        client.post("/api/v1/auth/email/verification/request", headers=headers)
        token = mailbox.latest_token

        assert (
            client.post("/api/v1/auth/magic-link/consume", json={"token": token}).status_code == 422
        )

    def test_each_token_type_uses_its_own_table(self, client, session, mailbox, anna) -> None:  # type: ignore[no-untyped-def]
        headers = auth(anna["tokens"]["accessToken"])
        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        client.post("/api/v1/auth/recovery/request", json={"email": ADDRESS})
        client.post("/api/v1/auth/email/verification/request", headers=headers)

        for model in (MagicLinkToken, AccountRecoveryToken, EmailVerificationToken):
            assert len(session.execute(select(model)).scalars().all()) == 1


class TestSessionIssuance:
    def test_every_successful_path_ends_in_device_session(
        self, client, session, mailbox, anna
    ) -> None:  # type: ignore[no-untyped-def]
        "There is no second place where session tokens are issued."
        before = len(session.execute(select(DeviceSession)).scalars().all())

        client.post("/api/v1/auth/magic-link/request", json={"email": ADDRESS})
        client.post("/api/v1/auth/magic-link/consume", json={"token": mailbox.latest_token})

        afterwards = session.execute(select(DeviceSession)).scalars().all()
        assert len(afterwards) == before + 1
        assert all(device.refresh_token_hash for device in afterwards)
