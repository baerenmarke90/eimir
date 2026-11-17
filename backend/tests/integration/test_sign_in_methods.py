"""Listing and removing the passkeys and linked providers of an Account (#58)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import OidcConnection, Settings
from eimir.identity.models import (
    Account,
    AccountEmail,
    AuthIdentity,
    AuthProvider,
    WebAuthnCredential,
)
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

METHODS = "/api/v1/auth/sign-in-methods"
CONNECTION = "google"


@pytest.fixture(autouse=True)
def configured_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        environment="test",  # type: ignore[arg-type]
        oidc_connections=[
            OidcConnection(
                id=CONNECTION,
                issuer="https://accounts.google.example",
                client_id="client",
                redirect_uri="https://app.example/cb",
                provider="google",
            )
        ],
    )
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)


def verified_email(session: Session, account: Account, address: str = "p@example.org") -> None:
    session.add(
        AccountEmail(
            account_id=account.id, email=address, is_primary=True, verified_at=datetime.now(UTC)
        )
    )
    session.flush()


def add_passkey(session: Session, account: Account, name: str = "Pixel") -> WebAuthnCredential:
    credential = WebAuthnCredential(
        account_id=account.id,
        credential_id=uuid4().bytes,
        public_key=b"key",
        sign_count=0,
        name=name,
    )
    session.add(credential)
    session.flush()
    return credential


def link_provider(session: Session, account: Account, connection: str = CONNECTION) -> None:
    session.add(
        AuthIdentity(
            account_id=account.id,
            provider=AuthProvider.OIDC.value,
            subject=f"sub-{uuid4()}",
            issuer="https://accounts.google.example",
            connection_id=connection,
        )
    )
    session.flush()


def passkey_url(passkey_id: UUID) -> str:
    return f"/api/v1/auth/passkeys/{passkey_id}"


def count(session: Session, model: type, account: Account) -> int:
    return len(session.execute(select(model).where(model.account_id == account.id)).scalars().all())  # type: ignore[attr-defined]


class TestList:
    def test_lists_passkeys_and_linked_providers(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        verified_email(session, account)
        passkey = add_passkey(session, account, "Pixel")
        link_provider(session, account)
        token = sign_in(session, account)

        body = client.get(METHODS, headers=auth(token)).json()
        assert [item["id"] for item in body["passkeys"]] == [str(passkey.id)]
        assert body["passkeys"][0]["name"] == "Pixel"
        assert [item["connectionId"] for item in body["oidc"]] == [CONNECTION]
        assert body["emailLink"] is True

    def test_does_not_show_another_accounts_methods(self, client, session) -> None:  # type: ignore[no-untyped-def]
        other = make_account(session, "Other")
        add_passkey(session, other)
        link_provider(session, other)
        account = make_account(session, "Mara")
        body = client.get(METHODS, headers=auth(sign_in(session, account))).json()
        assert body["passkeys"] == []
        assert body["oidc"] == []
        assert body["emailLink"] is False

    def test_requires_a_session(self, client) -> None:  # type: ignore[no-untyped-def]
        assert client.get(METHODS).status_code == 401


class TestRemovePasskey:
    def test_removes_it_while_a_verified_address_remains(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        verified_email(session, account)
        passkey = add_passkey(session, account)
        token = sign_in(session, account)

        assert client.delete(passkey_url(passkey.id), headers=auth(token)).status_code == 204
        assert count(session, WebAuthnCredential, account) == 0

    def test_refuses_the_only_way_in(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        passkey = add_passkey(session, account)
        token = sign_in(session, account)

        response = client.delete(passkey_url(passkey.id), headers=auth(token))
        assert response.status_code == 409
        assert response.json()["code"] == "SIGN_IN_METHOD_LAST"
        assert count(session, WebAuthnCredential, account) == 1

    def test_the_second_of_two_passkeys_is_the_last(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        first = add_passkey(session, account, "One")
        second = add_passkey(session, account, "Two")
        token = sign_in(session, account)

        assert client.delete(passkey_url(first.id), headers=auth(token)).status_code == 204
        assert client.delete(passkey_url(second.id), headers=auth(token)).status_code == 409

    def test_a_passkey_of_another_account_is_not_found(self, client, session) -> None:  # type: ignore[no-untyped-def]
        other = make_account(session, "Other")
        foreign = add_passkey(session, other)
        account = make_account(session, "Mara")
        verified_email(session, account)

        response = client.delete(passkey_url(foreign.id), headers=auth(sign_in(session, account)))
        assert response.status_code == 404
        assert count(session, WebAuthnCredential, other) == 1

    def test_a_linked_provider_counts_as_another_way_in(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        passkey = add_passkey(session, account)
        link_provider(session, account)
        token = sign_in(session, account)
        assert client.delete(passkey_url(passkey.id), headers=auth(token)).status_code == 204


class TestUnlinkProvider:
    def test_unlinks_while_a_passkey_remains(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        add_passkey(session, account)
        link_provider(session, account)
        token = sign_in(session, account)

        response = client.delete(f"/api/v1/auth/oidc/{CONNECTION}", headers=auth(token))
        assert response.status_code == 204
        assert count(session, AuthIdentity, account) == 0

    def test_refuses_the_only_way_in(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        link_provider(session, account)
        token = sign_in(session, account)

        response = client.delete(f"/api/v1/auth/oidc/{CONNECTION}", headers=auth(token))
        assert response.status_code == 409
        assert response.json()["code"] == "SIGN_IN_METHOD_LAST"
        assert count(session, AuthIdentity, account) == 1

    def test_a_provider_that_is_no_longer_configured_is_not_a_way_in(  # type: ignore[no-untyped-def]
        self, client, session
    ) -> None:
        account = make_account(session, "Mara")
        link_provider(session, account, "retired")
        link_provider(session, account)
        token = sign_in(session, account)

        response = client.delete(f"/api/v1/auth/oidc/{CONNECTION}", headers=auth(token))
        assert response.status_code == 409

    def test_an_unlinked_provider_is_not_found(self, client, session) -> None:  # type: ignore[no-untyped-def]
        account = make_account(session, "Mara")
        verified_email(session, account)
        response = client.delete(
            f"/api/v1/auth/oidc/{CONNECTION}", headers=auth(sign_in(session, account))
        )
        assert response.status_code == 404
