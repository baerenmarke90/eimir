"""Additional protocol hardening for OIDC discovery and ID-token audiences."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from eimir.auth import oidc
from eimir.config import OidcConnection
from eimir.core.errors import ValidationError

ISSUER = "https://id.example"
CLIENT_ID = "eimir"
NONCE = "nonce-123"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def connection() -> OidcConnection:
    return OidcConnection(
        id="main",
        issuer=ISSUER,
        client_id=CLIENT_ID,
        redirect_uri="https://app.example/oidc",
    )


def discovery() -> oidc.Discovery:
    return oidc.Discovery(
        issuer=ISSUER,
        authorization_endpoint=f"{ISSUER}/authorize",
        token_endpoint=f"{ISSUER}/token",
        jwks_uri=f"{ISSUER}/jwks",
    )


def jwks_for(private_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public["kid"] = "key-1"
    public["use"] = "sig"
    public["alg"] = "RS256"
    return {"keys": [public]}


def id_token(
    private_key: rsa.RSAPrivateKey,
    *,
    audience: str | list[str],
    azp: str | None = None,
) -> str:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": ISSUER,
        "sub": "subject-1",
        "aud": audience,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
        "nonce": NONCE,
    }
    if azp is not None:
        claims["azp"] = azp
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "key-1"},
    )


@pytest.mark.parametrize(
    "field",
    ["authorization_endpoint", "token_endpoint", "jwks_uri"],
)
def test_discovery_rejects_non_https_endpoints(monkeypatch, field: str) -> None:  # type: ignore[no-untyped-def]
    document: dict[str, Any] = {
        "issuer": ISSUER,
        "authorization_endpoint": f"{ISSUER}/authorize",
        "token_endpoint": f"{ISSUER}/token",
        "jwks_uri": f"{ISSUER}/jwks",
    }
    document[field] = "http://provider.example/insecure"

    monkeypatch.setattr(oidc, "_get_json", lambda _url, *, kind: document)

    with pytest.raises(ValidationError) as error:
        oidc.discover(connection())

    assert error.value.code == oidc.OidcErrorCode.PROVIDER_UNREACHABLE


def test_single_expected_audience_is_accepted(monkeypatch, private_key) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(oidc, "_get_json", lambda _url, *, kind: jwks_for(private_key))

    claims = oidc._verified_claims(
        connection(),
        discovery(),
        id_token=id_token(private_key, audience=CLIENT_ID),
        nonce=NONCE,
    )

    assert claims["aud"] == CLIENT_ID


def test_untrusted_additional_audience_is_rejected(monkeypatch, private_key) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(oidc, "_get_json", lambda _url, *, kind: jwks_for(private_key))

    with pytest.raises(ValidationError) as error:
        oidc._verified_claims(
            connection(),
            discovery(),
            id_token=id_token(
                private_key,
                audience=[CLIENT_ID, "another-service"],
                azp=CLIENT_ID,
            ),
            nonce=NONCE,
        )

    assert error.value.code == oidc.OidcErrorCode.INVALID_TOKEN


def test_multiple_audiences_require_matching_azp(monkeypatch, private_key) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(oidc, "_get_json", lambda _url, *, kind: jwks_for(private_key))

    with pytest.raises(ValidationError) as error:
        oidc._verified_claims(
            connection(),
            discovery(),
            id_token=id_token(private_key, audience=[CLIENT_ID, CLIENT_ID]),
            nonce=NONCE,
        )

    assert error.value.code == oidc.OidcErrorCode.INVALID_TOKEN
