"""OIDC state follows the authorization-code lifecycle across rejections.

A callback may retry the same browser flow only while the provider has not
successfully accepted its authorization code. Once exchange succeeds, any
later rejection must keep the state spent even though the request transaction
rolls back.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import oidc
from eimir.auth.tokens import hash_token
from eimir.config import MailTransport, OidcConnection, Settings
from eimir.identity.models import Account, AuthIdentity, AuthProvider, OidcAuthRequest
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ISSUER = "https://state-id.example"
CLIENT_ID = "eimir-state"
CONNECTION = "state-connection"
SUBJECT = "state-subject"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def jwks(private_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public["kid"] = "state-key"
    public["use"] = "sig"
    public["alg"] = "RS256"
    return {"keys": [public]}


def make_id_token(private_key: rsa.RSAPrivateKey, *, nonce: str) -> str:
    current = datetime.now(UTC)
    return jwt.encode(
        {
            "iss": ISSUER,
            "sub": SUBJECT,
            "aud": CLIENT_ID,
            "iat": int(current.timestamp()),
            "exp": int((current + timedelta(minutes=5)).timestamp()),
            "nonce": nonce,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "state-key"},
    )


class Provider:
    """Mock provider with observable lifecycle boundaries."""

    def __init__(self, jwks: dict[str, Any]) -> None:
        self.jwks = jwks
        self.default_id_token: str | None = None
        self.discovery_available = True
        self.jwks_available = True
        self.token_exchange_available = True
        self.successful_exchanges = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            if not self.discovery_available:
                return httpx.Response(503)
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/authorize",
                    "token_endpoint": f"{ISSUER}/token",
                    "jwks_uri": f"{ISSUER}/jwks",
                },
            )
        if path.endswith("/jwks"):
            if not self.jwks_available:
                return httpx.Response(503)
            return httpx.Response(200, json=self.jwks)
        if path.endswith("/token"):
            if not self.token_exchange_available:
                return httpx.Response(503)
            form = parse_qs(request.content.decode("utf-8"))
            assert form.get("code", [""])[0]
            self.successful_exchanges += 1
            return httpx.Response(
                200,
                json={
                    "access_token": "provider-token",
                    "token_type": "Bearer",
                    "id_token": self.default_id_token,
                },
            )
        return httpx.Response(404)


@pytest.fixture
def provider(jwks: dict[str, Any], monkeypatch) -> Provider:  # type: ignore[no-untyped-def]
    external = Provider(jwks)
    monkeypatch.setattr(
        oidc,
        "client",
        lambda: httpx.Client(transport=httpx.MockTransport(external.handler)),
    )
    settings = Settings(
        environment="test",  # type: ignore[arg-type]
        mail_transport=MailTransport.LOG,
        oidc_connections=[
            OidcConnection(
                id=CONNECTION,
                issuer=ISSUER,
                client_id=CLIENT_ID,
                client_secret="secret",  # type: ignore[arg-type]
                redirect_uri="https://app.example/oidc/state",
            )
        ],
    )
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    return external


def start_sign_in(client) -> dict[str, str]:  # type: ignore[no-untyped-def]
    response = client.post(f"/api/v1/auth/oidc/{CONNECTION}/start")
    assert response.status_code == 201, response.text
    result: dict[str, str] = response.json()
    return result


def nonce_for(session: Session, state: str) -> str:
    return (
        session.execute(
            select(OidcAuthRequest).where(OidcAuthRequest.state_hash == hash_token(state))
        )
        .scalar_one()
        .nonce
    )


def callback(client, state: str):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/auth/oidc/{CONNECTION}/callback",
        json={"code": "provider-code", "state": state},
    )


def persisted_request(session: Session, state: str) -> OidcAuthRequest:
    return session.execute(
        select(OidcAuthRequest).where(OidcAuthRequest.state_hash == hash_token(state))
    ).scalar_one()


def prepare_existing_identity(maker) -> Account:  # type: ignore[no-untyped-def]
    with maker() as preparation:
        account = make_account(preparation, "Ben")
        preparation.add(
            AuthIdentity(
                account_id=account.id,
                provider=AuthProvider.OIDC.value,
                issuer=ISSUER,
                subject=SUBJECT,
                connection_id=CONNECTION,
            )
        )
        preparation.commit()
        return account


class TestRealTransactions:
    """Exercise the real request rollback and after-rollback security transaction."""

    def test_no_account_after_exchange_spends_state(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        started = start_sign_in(client)
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )

        rejected = callback(client, started["state"])
        assert rejected.status_code == 401, rejected.text
        assert rejected.json()["code"] == "OIDC_NO_ACCOUNT"
        assert provider.successful_exchanges == 1

        replay = callback(client, started["state"])
        assert replay.status_code == 422, replay.text
        assert replay.json()["code"] == "OIDC_STATE_INVALID"
        assert provider.successful_exchanges == 1
        with maker() as check:
            assert persisted_request(check, started["state"]).consumed_at is not None

    def test_jwks_failure_after_exchange_spends_state_even_with_provider_error_code(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        started = start_sign_in(client)
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )
        provider.jwks_available = False

        rejected = callback(client, started["state"])
        assert rejected.status_code == 422, rejected.text
        assert rejected.json()["code"] == "OIDC_PROVIDER_UNREACHABLE"
        assert provider.successful_exchanges == 1

        provider.jwks_available = True
        replay = callback(client, started["state"])
        assert replay.status_code == 422, replay.text
        assert replay.json()["code"] == "OIDC_STATE_INVALID"
        assert provider.successful_exchanges == 1

    def test_discovery_failure_before_exchange_deliberately_returns_state_for_retry(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        account = prepare_existing_identity(maker)
        account_id = account.id
        started = start_sign_in(client)
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )
        provider.discovery_available = False

        rejected = callback(client, started["state"])
        assert rejected.status_code == 422, rejected.text
        assert rejected.json()["code"] == "OIDC_PROVIDER_UNREACHABLE"
        assert provider.successful_exchanges == 0
        with maker() as check:
            assert persisted_request(check, started["state"]).consumed_at is None

        provider.discovery_available = True
        retried = callback(client, started["state"])
        assert retried.status_code == 201, retried.text
        assert retried.json()["account"]["id"] == str(account_id)
        assert provider.successful_exchanges == 1

    def test_token_endpoint_rejection_before_success_deliberately_returns_state_for_retry(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        account = prepare_existing_identity(maker)
        account_id = account.id
        started = start_sign_in(client)
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )
        provider.token_exchange_available = False

        rejected = callback(client, started["state"])
        assert rejected.status_code == 422, rejected.text
        assert rejected.json()["code"] == "OIDC_TOKEN_INVALID"
        assert provider.successful_exchanges == 0
        with maker() as check:
            assert persisted_request(check, started["state"]).consumed_at is None

        provider.token_exchange_available = True
        retried = callback(client, started["state"])
        assert retried.status_code == 201, retried.text
        assert retried.json()["account"]["id"] == str(account_id)
        assert provider.successful_exchanges == 1
