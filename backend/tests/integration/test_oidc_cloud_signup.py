"""Cloud signup and public discovery for external identity providers (#58)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth import oidc
from eimir.auth.tokens import hash_token
from eimir.config import Deployment, MailTransport, OidcConnection, Settings
from eimir.core.errors import ForbiddenError
from eimir.identity.models import Account, AccountEmail, AuthIdentity, OidcAuthRequest
from eimir.legal.models import TermsAcceptance
from eimir.legal.terms import TERMS_OF_USE_VERSION
from eimir.relationship import invitations
from eimir.relationship.models import Membership
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ISSUER = "https://accounts.google.example"
CLIENT_ID = "eimir-google"
CONNECTION = "google"
WEB_REDIRECT = "https://app.example/auth/oidc/google"
ANDROID_REDIRECT = "de.eimir.app:/oidc/google"
START = f"/api/v1/auth/oidc/{CONNECTION}/start"
CALLBACK = f"/api/v1/auth/oidc/{CONNECTION}/callback"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def jwks(private_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public.update({"kid": "google-key", "use": "sig", "alg": "RS256"})
    return {"keys": [public]}


class Provider:
    def __init__(self, jwks: dict[str, Any]) -> None:
        self.jwks = jwks
        self.id_token = ""

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
            return httpx.Response(200, json={"token_type": "Bearer", "id_token": self.id_token})
        return httpx.Response(404)


def cloud_settings(*, deployment: Deployment = Deployment.CLOUD, native: bool = True) -> Settings:
    return Settings(
        environment="test",  # type: ignore[arg-type]
        deployment=deployment,
        mail_transport=MailTransport.SMTP,
        oidc_connections=[
            OidcConnection(
                id=CONNECTION,
                issuer=ISSUER,
                client_id=CLIENT_ID,
                client_secret="secret",  # type: ignore[arg-type]
                redirect_uri=WEB_REDIRECT,
                android_redirect_uri=ANDROID_REDIRECT if native else None,
                provider="google",
            )
        ],
    )


def install(monkeypatch: pytest.MonkeyPatch, settings: Settings, provider: Provider) -> None:
    monkeypatch.setattr(
        oidc, "client", lambda: httpx.Client(transport=httpx.MockTransport(provider.handler))
    )
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)


@pytest.fixture
def provider(jwks: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> Provider:  # type: ignore[no-untyped-def]
    external = Provider(jwks)
    install(monkeypatch, cloud_settings(), external)
    return external


def sign(private_key: rsa.RSAPrivateKey, nonce: str, subject: str, **claims: Any) -> str:
    current = datetime.now(UTC)
    payload: dict[str, Any] = {
        "iss": ISSUER,
        "sub": subject,
        "aud": CLIENT_ID,
        "iat": int(current.timestamp()),
        "exp": int((current + timedelta(minutes=5)).timestamp()),
        "nonce": nonce,
        **claims,
    }
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "google-key"})


def nonce_for(session: Session, state: str) -> str:
    return session.execute(
        select(OidcAuthRequest.nonce).where(OidcAuthRequest.state_hash == hash_token(state))
    ).scalar_one()


def begin(client, body: dict[str, Any]):  # type: ignore[no-untyped-def]
    return client.post(START, json=body)


def finish(  # type: ignore[no-untyped-def]
    client,
    session: Session,
    provider: Provider,
    private_key: rsa.RSAPrivateKey,
    body: dict[str, Any],
    *,
    subject: str = "google-subject",
    **claims: Any,
):
    started = begin(client, body)
    assert started.status_code == 201, started.text
    state = started.json()["state"]
    provider.id_token = sign(private_key, nonce_for(session, state), subject, **claims)
    return client.post(CALLBACK, json={"code": "code", "state": state})


SIGNUP = {"signup": True, "acceptedTermsVersion": TERMS_OF_USE_VERSION}
VERIFIED = {"name": "Mara", "email": "mara@example.org", "email_verified": True}


def account_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Account)) or 0


class TestDiscovery:
    def test_status_lists_the_provider_without_its_configuration(self, client, provider) -> None:  # type: ignore[no-untyped-def]
        body = client.get("/api/v1/instance/status").json()
        assert body["oidcConnections"] == [
            {"id": CONNECTION, "brand": "google", "label": "", "nativeAvailable": True}
        ]
        assert body["oidcSignupAvailable"] is True
        assert ISSUER not in json.dumps(body)
        assert CLIENT_ID not in json.dumps(body)

    def test_self_hosted_lists_the_provider_but_offers_no_open_signup(
        self, client, jwks, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        install(monkeypatch, cloud_settings(deployment=Deployment.SELF_HOSTED), Provider(jwks))
        body = client.get("/api/v1/instance/status").json()
        assert [entry["id"] for entry in body["oidcConnections"]] == [CONNECTION]
        assert body["oidcSignupAvailable"] is False

    def test_no_connection_means_no_listing(self, client, jwks, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        settings = cloud_settings().model_copy(update={"oidc_connections": []})
        install(monkeypatch, settings, Provider(jwks))
        body = client.get("/api/v1/instance/status").json()
        assert body["oidcConnections"] == []
        assert body["oidcSignupAvailable"] is False


class TestStart:
    def test_signup_needs_the_terms_acceptance(self, client, provider) -> None:  # type: ignore[no-untyped-def]
        response = begin(client, {"signup": True})
        assert response.status_code == 409
        assert response.json()["code"] == "TERMS_ACCEPTANCE_REQUIRED"

    def test_signup_with_an_outdated_version_is_refused(self, client, provider) -> None:  # type: ignore[no-untyped-def]
        response = begin(client, {"signup": True, "acceptedTermsVersion": "1999-01-01"})
        assert response.status_code == 409
        assert response.json()["code"] == "TERMS_VERSION_OUTDATED"

    def test_signup_is_refused_where_it_is_not_offered(self, client, jwks, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        install(monkeypatch, cloud_settings(deployment=Deployment.SELF_HOSTED), Provider(jwks))
        response = begin(client, SIGNUP)
        assert response.status_code >= 400
        assert response.json()["code"] == "AUTH_METHOD_DISABLED"

    def test_plain_sign_in_start_needs_no_terms(self, client, provider) -> None:  # type: ignore[no-untyped-def]
        assert begin(client, {}).status_code == 201

    def test_native_flow_uses_the_registered_android_callback(self, client, provider) -> None:  # type: ignore[no-untyped-def]
        started = begin(client, {"client": "android"})
        url = started.json()["authorizationUrl"]
        assert parse_qs(urlsplit(url).query)["redirect_uri"] == [ANDROID_REDIRECT]
        web = begin(client, {}).json()["authorizationUrl"]
        assert parse_qs(urlsplit(web).query)["redirect_uri"] == [WEB_REDIRECT]

    def test_native_flow_needs_a_registered_callback(self, client, jwks, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        install(monkeypatch, cloud_settings(native=False), Provider(jwks))
        assert begin(client, {"client": "android"}).status_code == 422


class TestSignup:
    def test_verified_identity_creates_the_account_with_terms_acceptance(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        response = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        assert response.status_code == 201, response.text
        account_id = response.json()["account"]["id"]

        identity = session.execute(
            select(AuthIdentity).where(AuthIdentity.account_id == account_id)
        ).scalar_one()
        assert (identity.issuer, identity.subject) == (ISSUER, "google-subject")
        email = session.execute(
            select(AccountEmail).where(AccountEmail.account_id == account_id)
        ).scalar_one()
        assert email.email == "mara@example.org"
        assert email.verified_at is not None
        acceptance = session.execute(
            select(TermsAcceptance).where(TermsAcceptance.account_id == account_id)
        ).scalar_one()
        assert (acceptance.version, acceptance.origin) == (TERMS_OF_USE_VERSION, "oidc_signup")

    def test_a_second_sign_in_uses_the_same_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        first = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        again = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        assert again.status_code == 201, again.text
        assert again.json()["account"]["id"] == first.json()["account"]["id"]
        assert account_count(session) == 1

    def test_unverified_address_creates_nothing(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        response = finish(
            client,
            session,
            provider,
            private_key,
            SIGNUP,
            email="mara@example.org",
            email_verified=False,
        )
        assert response.status_code == 422
        assert response.json()["code"] == "OIDC_EMAIL_NOT_VERIFIED"
        assert account_count(session) == 0

    def test_missing_address_creates_nothing(self, client, session, provider, private_key) -> None:  # type: ignore[no-untyped-def]
        response = finish(client, session, provider, private_key, SIGNUP, name="Mara")
        assert response.status_code == 422
        assert account_count(session) == 0

    def test_an_address_with_an_account_is_never_merged(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        owner = make_account(session, "Owner")
        session.add(
            AccountEmail(
                account_id=owner.id,
                email="mara@example.org",
                is_primary=True,
                verified_at=datetime.now(UTC),
            )
        )
        session.flush()
        before = account_count(session)

        response = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        assert response.status_code == 409
        assert response.json()["code"] == "OIDC_ADDRESS_ALREADY_REGISTERED"
        assert account_count(session) == before
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuthIdentity)
                .where(AuthIdentity.subject == "google-subject")
            )
            == 0
        )

    def test_an_unknown_identity_without_signup_intent_creates_nothing(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        response = finish(client, session, provider, private_key, {}, **VERIFIED)
        assert response.status_code == 401
        assert response.json()["code"] == "OIDC_NO_ACCOUNT"
        assert account_count(session) == 0

    def test_a_signup_the_administrator_has_closed_creates_nothing(
        self, client, session, provider, private_key, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        def closed(_session: Session) -> None:
            raise ForbiddenError("closed", "REGISTRATION_DISABLED")

        monkeypatch.setattr(oidc.administration, "ensure_new_account_registration_allowed", closed)
        response = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        assert response.status_code == 403
        assert account_count(session) == 0


class TestInvitationOnCloud:
    def test_invitation_without_terms_acceptance_still_creates_nothing(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        founder = make_account(session, "Founder")
        space = make_space(session, founder)
        issued = invitations.create(session, space.id, founder)
        session.flush()
        before = account_count(session)

        response = finish(
            client, session, provider, private_key, {"invitationToken": issued.token}, **VERIFIED
        )
        assert response.status_code == 409
        assert response.json()["code"] == "TERMS_ACCEPTANCE_REQUIRED"
        assert account_count(session) == before

    def test_invitation_with_terms_acceptance_creates_account_and_membership(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        founder = make_account(session, "Founder")
        space = make_space(session, founder)
        issued = invitations.create(session, space.id, founder)
        session.flush()

        response = finish(
            client,
            session,
            provider,
            private_key,
            {"invitationToken": issued.token, "acceptedTermsVersion": TERMS_OF_USE_VERSION},
            **VERIFIED,
        )
        assert response.status_code == 201, response.text
        account_id = response.json()["account"]["id"]
        assert (
            session.execute(
                select(Membership).where(
                    Membership.space_id == space.id, Membership.account_id == account_id
                )
            )
            .scalar_one()
            .is_active
        )
        acceptance = session.execute(
            select(TermsAcceptance).where(TermsAcceptance.account_id == account_id)
        ).scalar_one()
        assert acceptance.origin == "oidc_signup"


class TestReturningPersonWithInvitation:
    def test_an_existing_identity_joins_the_space_while_signing_in(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        first = finish(client, session, provider, private_key, SIGNUP, **VERIFIED)
        account_id = first.json()["account"]["id"]
        founder = make_account(session, "Founder")
        space = make_space(session, founder)
        issued = invitations.create(session, space.id, founder)
        session.flush()

        again = finish(
            client, session, provider, private_key, {"invitationToken": issued.token}, **VERIFIED
        )
        assert again.status_code == 201, again.text
        assert again.json()["account"]["id"] == account_id
        assert (
            session.execute(
                select(Membership).where(
                    Membership.space_id == space.id, Membership.account_id == account_id
                )
            )
            .scalar_one()
            .is_active
        )
