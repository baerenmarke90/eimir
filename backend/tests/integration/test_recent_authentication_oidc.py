"""OIDC-specific recent-authentication security coverage."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir import config
from eimir.auth import oidc
from eimir.auth.recent_auth_models import (
    RecentAuthenticationGrant,
    RecentAuthenticationOidcRequest,
)
from eimir.auth.tokens import hash_token
from eimir.config import MailTransport, OidcConnection, Settings
from eimir.identity.models import AuthIdentity, AuthProvider, DeviceSession
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ISSUER = "https://recent-id.example"
CLIENT_ID = "eimir-recent"
CONNECTION = "recent-provider"
SUBJECT = "recent-anna"
CLIENT_SECRET = secrets.token_urlsafe(32)
PROVIDER_ACCESS_TOKEN = secrets.token_urlsafe(32)
PROVIDER_CODE = secrets.token_urlsafe(32)
BAD_PROVIDER_CODE = secrets.token_urlsafe(32)
START = f"/api/v1/auth/recent-authentication/account-deletion/oidc/{CONNECTION}/start"
CALLBACK = f"/api/v1/auth/recent-authentication/account-deletion/oidc/{CONNECTION}/callback"
NORMAL_CALLBACK = f"/api/v1/auth/oidc/{CONNECTION}/callback"


class Provider:
    def __init__(self, key: rsa.RSAPrivateKey, jwks: dict[str, Any]) -> None:
        self.key = key
        self.jwks = jwks
        self.id_token: str | None = None
        self.token_status = 200
        self.last_code_verifier: str | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/authorize",
                    "token_endpoint": f"{ISSUER}/token",
                    "jwks_uri": f"{ISSUER}/jwks",
                },
            )
        if request.url.path.endswith("/jwks"):
            return httpx.Response(200, json=self.jwks)
        if request.url.path.endswith("/token"):
            self.last_code_verifier = httpx.QueryParams(request.content.decode("utf-8")).get(
                "code_verifier"
            )
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_grant"})
            return httpx.Response(
                200,
                json={
                    "access_token": PROVIDER_ACCESS_TOKEN,
                    "token_type": "Bearer",
                    "id_token": self.id_token,
                },
            )
        return httpx.Response(404)


def _token(
    key: rsa.RSAPrivateKey,
    *,
    nonce: str,
    auth_time: int | None,
    subject: str = SUBJECT,
) -> str:
    current_time = datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": ISSUER,
        "sub": subject,
        "aud": CLIENT_ID,
        "iat": int(current_time.timestamp()),
        "exp": int((current_time + timedelta(minutes=5)).timestamp()),
        "nonce": nonce,
    }
    if auth_time is not None:
        claims["auth_time"] = auth_time
    return jwt.encode(
        claims,
        key,
        algorithm="RS256",
        headers={"kid": "recent-key"},
    )


@pytest.fixture(scope="module")
def signing_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def provider_jwks(signing_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(signing_key.public_key()))
    public["kid"] = "recent-key"
    public["use"] = "sig"
    public["alg"] = "RS256"
    return {"keys": [public]}


@pytest.fixture
def provider(
    signing_key: rsa.RSAPrivateKey,
    provider_jwks: dict[str, Any],
    monkeypatch,
) -> Provider:  # type: ignore[no-untyped-def]
    mock = Provider(signing_key, provider_jwks)
    settings = Settings(
        environment="test",  # type: ignore[arg-type]
        mail_transport=MailTransport.LOG,
        oidc_connections=[
            OidcConnection(
                id=CONNECTION,
                issuer=ISSUER,
                client_id=CLIENT_ID,
                client_secret=CLIENT_SECRET,  # type: ignore[arg-type]
                redirect_uri="https://app.example/recent-oidc",
            )
        ],
    )
    monkeypatch.setattr(config, "get_settings", lambda: settings)
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    monkeypatch.setattr(
        oidc,
        "client",
        lambda: httpx.Client(transport=httpx.MockTransport(mock.handler)),
    )
    return mock


@pytest.fixture
def account_context(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "OIDC Recent")
    session.add(
        AuthIdentity(
            account_id=account.id,
            provider=AuthProvider.OIDC.value,
            issuer=ISSUER,
            subject=SUBJECT,
            connection_id=CONNECTION,
        )
    )
    session.flush()
    first = auth(sign_in(session, account))
    second = auth(sign_in(session, account))
    return account, first, second


def _request(session: Session, state: str) -> RecentAuthenticationOidcRequest:
    return session.execute(
        select(RecentAuthenticationOidcRequest).where(
            RecentAuthenticationOidcRequest.state_hash == hash_token(state)
        )
    ).scalar_one()


def _authorization_parameters(started: dict[str, Any]) -> dict[str, str]:
    return dict(httpx.URL(str(started["authorizationUrl"])).params)


def _fresh_auth_time() -> int:
    return int(datetime.now(UTC).timestamp())


def _grant_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(RecentAuthenticationGrant)).scalar_one()


def test_start_requests_active_reauthentication_and_binds_current_session(
    client,
    session: Session,
    provider,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    account, headers, _ = account_context
    response = client.post(START, headers=headers)
    assert response.status_code == 201, response.text

    body = response.json()
    parameters = _authorization_parameters(body)
    assert parameters["prompt"] == "login"
    assert parameters["max_age"] == "0"
    assert parameters["nonce"]
    assert parameters["code_challenge"]

    request = _request(session, body["state"])
    assert request.account_id == account.id
    assert request.device_session_id is not None
    assert request.purpose == "ACCOUNT_DELETION"
    assert "nonce" not in RecentAuthenticationOidcRequest.__table__.columns
    assert "code_verifier" not in RecentAuthenticationOidcRequest.__table__.columns


def test_missing_auth_time_fails_closed_without_grant(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    started = client.post(START, headers=headers).json()
    provider.id_token = _token(
        signing_key,
        nonce=_authorization_parameters(started)["nonce"],
        auth_time=None,
    )

    response = client.post(
        CALLBACK,
        headers=headers,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "OIDC_TOKEN_INVALID"
    assert _grant_count(session) == 0


def test_stale_provider_authentication_fails_closed_without_grant(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    started = client.post(START, headers=headers).json()
    provider.id_token = _token(
        signing_key,
        nonce=_authorization_parameters(started)["nonce"],
        auth_time=int((datetime.now(UTC) - timedelta(minutes=5)).timestamp()),
    )

    response = client.post(
        CALLBACK,
        headers=headers,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "OIDC_TOKEN_INVALID"
    assert _grant_count(session) == 0


def test_fresh_reauthentication_issues_grant_without_new_session(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    before = session.execute(select(func.count()).select_from(DeviceSession)).scalar_one()
    started = client.post(START, headers=headers).json()
    parameters = _authorization_parameters(started)
    provider.id_token = _token(
        signing_key,
        nonce=parameters["nonce"],
        auth_time=_fresh_auth_time(),
    )

    response = client.post(
        CALLBACK,
        headers=headers,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["method"] == "OIDC"
    assert provider.last_code_verifier is not None
    assert oidc._challenge(provider.last_code_verifier) == parameters["code_challenge"]
    after = session.execute(select(func.count()).select_from(DeviceSession)).scalar_one()
    assert after == before
    assert _grant_count(session) == 1


def test_provider_failure_creates_no_grant_and_state_cannot_replay(
    client,
    session: Session,
    provider: Provider,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    started = client.post(START, headers=headers).json()
    provider.token_status = 400
    payload = {"code": BAD_PROVIDER_CODE, "state": started["state"]}

    first = client.post(CALLBACK, headers=headers, json=payload)
    second = client.post(CALLBACK, headers=headers, json=payload)
    assert first.status_code == 422
    assert second.status_code == 422
    assert second.json()["code"] == "OIDC_STATE_INVALID"
    assert _grant_count(session) == 0


def test_step_up_state_is_not_a_normal_sign_in_state(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    started = client.post(START, headers=headers).json()

    wrong_intent = client.post(
        NORMAL_CALLBACK,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert wrong_intent.status_code == 422
    assert wrong_intent.json()["code"] == "OIDC_STATE_INVALID"

    provider.id_token = _token(
        signing_key,
        nonce=_authorization_parameters(started)["nonce"],
        auth_time=_fresh_auth_time(),
    )
    correct_intent = client.post(
        CALLBACK,
        headers=headers,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert correct_intent.status_code == 200, correct_intent.text


def test_successful_step_up_state_is_one_shot(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, headers, _ = account_context
    started = client.post(START, headers=headers).json()
    provider.id_token = _token(
        signing_key,
        nonce=_authorization_parameters(started)["nonce"],
        auth_time=_fresh_auth_time(),
    )
    payload = {"code": PROVIDER_CODE, "state": started["state"]}

    first = client.post(CALLBACK, headers=headers, json=payload)
    second = client.post(CALLBACK, headers=headers, json=payload)
    assert first.status_code == 200, first.text
    assert second.status_code == 422
    assert second.json()["code"] == "OIDC_STATE_INVALID"


def test_step_up_callback_is_bound_to_the_starting_session(
    client,
    session: Session,
    provider: Provider,
    signing_key: rsa.RSAPrivateKey,
    account_context,
) -> None:  # type: ignore[no-untyped-def]
    _, first_headers, second_headers = account_context
    started = client.post(START, headers=first_headers).json()
    provider.id_token = _token(
        signing_key,
        nonce=_authorization_parameters(started)["nonce"],
        auth_time=_fresh_auth_time(),
    )

    response = client.post(
        CALLBACK,
        headers=second_headers,
        json={"code": PROVIDER_CODE, "state": started["state"]},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "OIDC_STATE_INVALID"
    assert _grant_count(session) == 0
