"""OIDC onboarding for new accounts through an invitation."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
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
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail, AuthIdentity, OidcAuthRequest
from eimir.relationship import invitations, service
from eimir.relationship.models import Membership
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ISSUER = "https://onboarding-id.example"
CLIENT_ID = "eimir-onboarding"
CONNECTION = "onboarding"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def jwks(private_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public["kid"] = "onboarding-key"
    public["use"] = "sig"
    public["alg"] = "RS256"
    return {"keys": [public]}


def make_id_token(
    private_key: rsa.RSAPrivateKey,
    *,
    nonce: str,
    subject: str,
    claims: dict[str, Any] | None = None,
) -> str:
    current = datetime.now(UTC)
    payload: dict[str, Any] = {
        "iss": ISSUER,
        "sub": subject,
        "aud": CLIENT_ID,
        "iat": int(current.timestamp()),
        "exp": int((current + timedelta(minutes=5)).timestamp()),
        "nonce": nonce,
    }
    payload.update(claims or {})
    return jwt.encode(
        payload,
        private_key,
        algorithm="RS256",
        headers={"kid": "onboarding-key"},
    )


class Provider:
    def __init__(self, jwks: dict[str, Any]) -> None:
        self.jwks = jwks
        self.default_id_token: str | None = None
        self.tokens_by_code: dict[str, str] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
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
            return httpx.Response(200, json=self.jwks)
        if path.endswith("/token"):
            form = parse_qs(request.content.decode("utf-8"))
            code = form.get("code", [""])[0]
            token = self.tokens_by_code.get(code, self.default_id_token)
            return httpx.Response(
                200,
                json={
                    "access_token": "provider-token",
                    "token_type": "Bearer",
                    "id_token": token,
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
                redirect_uri="https://app.example/oidc/onboarding",
            )
        ],
    )
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    return external


def start_onboarding(client, invitation_token: str) -> dict[str, str]:  # type: ignore[no-untyped-def]
    response = client.post(
        f"/api/v1/auth/oidc/{CONNECTION}/start",
        json={"invitationToken": invitation_token},
    )
    assert response.status_code == 201, response.text
    result: dict[str, str] = response.json()
    return result


def request_for(session: Session, state: str) -> OidcAuthRequest:
    return session.execute(
        select(OidcAuthRequest).where(OidcAuthRequest.state_hash == hash_token(state))
    ).scalar_one()


def invitation_setup(session: Session):  # type: ignore[no-untyped-def]
    founder = make_account(session, "Founder")
    space = make_space(session, founder)
    issued = invitations.create(session, space.id, founder)
    session.flush()
    return founder, space, issued


class TestOnboarding:
    def test_valid_invitation_creates_account_identity_and_membership(
        self,
        client,
        session,
        provider,
        private_key,
    ) -> None:  # type: ignore[no-untyped-def]
        _, space, issued = invitation_setup(session)
        started = start_onboarding(client, issued.token)
        request = request_for(session, started["state"])
        provider.default_id_token = make_id_token(
            private_key,
            nonce=request.nonce,
            subject="new-partner",
            claims={
                "name": "Neue Partnerin",
                "email": "partnerin@example.org",
                "email_verified": True,
            },
        )

        response = client.post(
            f"/api/v1/auth/oidc/{CONNECTION}/callback",
            json={"code": "valid", "state": started["state"]},
        )
        assert response.status_code == 201, response.text
        account_id = response.json()["account"]["id"]

        account = session.get(Account, account_id)
        assert account is not None
        assert account.display_name == "Neue Partnerin"
        identity = session.execute(
            select(AuthIdentity).where(AuthIdentity.subject == "new-partner")
        ).scalar_one()
        assert identity.account_id == account.id
        membership = session.execute(
            select(Membership).where(
                Membership.space_id == space.id,
                Membership.account_id == account.id,
            )
        ).scalar_one()
        assert membership.is_active
        email = session.execute(
            select(AccountEmail).where(AccountEmail.account_id == account.id)
        ).scalar_one()
        assert email.email == "partnerin@example.org"
        assert email.verified_at is not None

    def test_missing_name_claim_does_not_prevent_onboarding(
        self,
        client,
        session,
        provider,
        private_key,
    ) -> None:  # type: ignore[no-untyped-def]
        _, _, issued = invitation_setup(session)
        started = start_onboarding(client, issued.token)
        request = request_for(session, started["state"])
        provider.default_id_token = make_id_token(
            private_key,
            nonce=request.nonce,
            subject="fallback-subject",
        )

        response = client.post(
            f"/api/v1/auth/oidc/{CONNECTION}/callback",
            json={"code": "fallback", "state": started["state"]},
        )
        assert response.status_code == 201, response.text
        assert response.json()["account"]["displayName"] == "fallback-subject"

    def test_unverified_email_is_not_imported(
        self,
        client,
        session,
        provider,
        private_key,
    ) -> None:  # type: ignore[no-untyped-def]
        _, _, issued = invitation_setup(session)
        started = start_onboarding(client, issued.token)
        request = request_for(session, started["state"])
        provider.default_id_token = make_id_token(
            private_key,
            nonce=request.nonce,
            subject="without-mail",
            claims={"email": "unverified@example.org", "email_verified": False},
        )

        response = client.post(
            f"/api/v1/auth/oidc/{CONNECTION}/callback",
            json={"code": "unverified", "state": started["state"]},
        )
        assert response.status_code == 201, response.text
        account_id = response.json()["account"]["id"]
        assert (
            session.execute(
                select(AccountEmail).where(AccountEmail.account_id == account_id)
            ).scalar_one_or_none()
            is None
        )

    def test_existing_email_does_not_link_to_foreign_account(
        self,
        client,
        session,
        provider,
        private_key,
    ) -> None:  # type: ignore[no-untyped-def]
        existing = make_account(session, "Existing")
        session.add(
            AccountEmail(
                account_id=existing.id,
                email="used@example.org",
                is_primary=True,
            )
        )
        _, _, issued = invitation_setup(session)
        session.flush()

        started = start_onboarding(client, issued.token)
        request = request_for(session, started["state"])
        provider.default_id_token = make_id_token(
            private_key,
            nonce=request.nonce,
            subject="separate-account",
            claims={"email": "used@example.org", "email_verified": True},
        )
        response = client.post(
            f"/api/v1/auth/oidc/{CONNECTION}/callback",
            json={"code": "email-conflict", "state": started["state"]},
        )
        assert response.status_code == 201, response.text
        created_id = response.json()["account"]["id"]
        assert created_id != str(existing.id)
        assert (
            session.execute(
                select(AccountEmail).where(AccountEmail.account_id == created_id)
            ).scalar_one_or_none()
            is None
        )

    @pytest.mark.parametrize("kind", ["expired", "revoked", "used"])
    def test_invalid_invitation_remains_401_and_creates_no_account(
        self,
        client,
        session,
        provider,
        private_key,
        kind,
    ) -> None:  # type: ignore[no-untyped-def]
        founder, _, issued = invitation_setup(session)
        if kind == "expired":
            issued.invitation.expires_at = now() - timedelta(seconds=1)
        elif kind == "revoked":
            issued.invitation.revoked_at = now()
        else:
            other = make_account(session, "Already accepted")
            invitations.accept(session, issued.token, other)
        session.flush()

        before = len(session.execute(select(Account)).scalars().all())
        started = start_onboarding(client, issued.token)
        request = request_for(session, started["state"])
        provider.default_id_token = make_id_token(
            private_key,
            nonce=request.nonce,
            subject=f"invalid-{kind}-{founder.id}",
        )
        response = client.post(
            f"/api/v1/auth/oidc/{CONNECTION}/callback",
            json={"code": kind, "state": started["state"]},
        )
        assert response.status_code == 401
        assert response.json()["code"] == "OIDC_NO_ACCOUNT"
        assert len(session.execute(select(Account)).scalars().all()) == before


class TestConcurrency:
    def test_two_callbacks_with_same_invitation_create_exactly_one_account(
        self,
        production_client,
        provider,
        private_key,
    ) -> None:  # type: ignore[no-untyped-def]
        client, maker = production_client
        with maker() as preparation:
            founder = make_account(preparation, "Concurrent founder")
            space = make_space(preparation, founder)
            issued = invitations.create(preparation, space.id, founder)
            space_id = space.id
            invitation_token = issued.token
            preparation.commit()

        first = start_onboarding(client, invitation_token)
        second = start_onboarding(client, invitation_token)
        with maker() as lookup:
            first_request = request_for(lookup, first["state"])
            second_request = request_for(lookup, second["state"])
            provider.tokens_by_code["first"] = make_id_token(
                private_key,
                nonce=first_request.nonce,
                subject="parallel-first",
            )
            provider.tokens_by_code["second"] = make_id_token(
                private_key,
                nonce=second_request.nonce,
                subject="parallel-second",
            )

        barrier = Barrier(2)

        def callback(data: tuple[str, str]):
            code, state = data
            barrier.wait(timeout=5)
            return client.post(
                f"/api/v1/auth/oidc/{CONNECTION}/callback",
                json={"code": code, "state": state},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(
                    callback,
                    [("first", first["state"]), ("second", second["state"])],
                )
            )

        assert sorted(response.status_code for response in responses) == [201, 401]
        rejected = next(response for response in responses if response.status_code == 401)
        assert rejected.json()["code"] == "OIDC_NO_ACCOUNT"

        with maker() as check:
            assert len(check.execute(select(Account)).scalars().all()) == 2
            assert len(service.active_memberships(check, space_id)) == 2
            assert len(check.execute(select(AuthIdentity)).scalars().all()) == 1
