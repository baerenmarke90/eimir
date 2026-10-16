"""An OIDC link flow stays in the account that started it.

``POST /auth/oidc/{connectionId}/link`` is started from an authenticated
session and records that account on the short-lived request. The callback for
such a request is a link, not a sign-in: it may end in that account or fail,
but it must never turn into a session for whoever else happens to own the
returned external identity.

The provider here is realistic enough to serve discovery and JWKS and to sign
ID tokens with a real RSA key, so the suite exercises the actual verification
path rather than a stub.
"""

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
from eimir.identity.models import (
    Account,
    AuthIdentity,
    AuthProvider,
    DeviceSession,
    OidcAuthRequest,
)
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ISSUER = "https://link-id.example"
CLIENT_ID = "eimir-link"
CONNECTION = "link-connection"
SUBJECT = "shared-external-subject"


@pytest.fixture(scope="module")
def private_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def jwks(private_key: rsa.RSAPrivateKey) -> dict[str, Any]:
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    public["kid"] = "link-key"
    public["use"] = "sig"
    public["alg"] = "RS256"
    return {"keys": [public]}


def make_id_token(
    private_key: rsa.RSAPrivateKey,
    *,
    nonce: str,
    subject: str = SUBJECT,
) -> str:
    current = datetime.now(UTC)
    return jwt.encode(
        {
            "iss": ISSUER,
            "sub": subject,
            "aud": CLIENT_ID,
            "iat": int(current.timestamp()),
            "exp": int((current + timedelta(minutes=5)).timestamp()),
            "nonce": nonce,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "link-key"},
    )


class Provider:
    """A mock identity provider that can answer per authorization code."""

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
            return httpx.Response(
                200,
                json={
                    "access_token": "provider-token",
                    "token_type": "Bearer",
                    "id_token": self.tokens_by_code.get(code, self.default_id_token),
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
                redirect_uri="https://app.example/oidc/link",
            )
        ],
    )
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    return external


def start_link(client, headers: dict[str, str]) -> dict[str, str]:  # type: ignore[no-untyped-def]
    response = client.post(f"/api/v1/auth/oidc/{CONNECTION}/link", headers=headers)
    assert response.status_code == 201, response.text
    result: dict[str, str] = response.json()
    return result


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


def callback(client, state: str, code: str = "provider-code"):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/auth/oidc/{CONNECTION}/callback",
        json={"code": code, "state": state},
    )


def link_identity(session: Session, account: Account, subject: str = SUBJECT) -> AuthIdentity:
    identity = AuthIdentity(
        account_id=account.id,
        provider=AuthProvider.OIDC.value,
        issuer=ISSUER,
        subject=subject,
        connection_id=CONNECTION,
    )
    session.add(identity)
    session.flush()
    return identity


class TestBoundLinkFlow:
    def test_unlinked_identity_is_linked_to_the_initiating_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )

        response = callback(client, started["state"])

        assert response.status_code == 201, response.text
        assert response.json()["account"]["id"] == str(anna.id)
        identity = session.execute(
            select(AuthIdentity).where(AuthIdentity.subject == SUBJECT)
        ).scalar_one()
        assert identity.account_id == anna.id
        assert identity.connection_id == CONNECTION

    def test_identity_already_on_the_same_account_is_idempotent(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "Linking what is already linked here is a no-op, not a conflict."
        anna = make_account(session, "Anna")
        link_identity(session, anna)

        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert response.status_code == 201, response.text
        assert response.json()["account"]["id"] == str(anna.id)
        identities = (
            session.execute(select(AuthIdentity).where(AuthIdentity.subject == SUBJECT))
            .scalars()
            .all()
        )
        assert len(identities) == 1
        assert identities[0].account_id == anna.id

    def test_identity_on_another_account_is_rejected(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "The defect from #704: the link flow must not become Ben's sign-in."
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        link_identity(session, ben)

        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert response.status_code == 409, response.text
        assert response.json()["code"] == "OIDC_IDENTITY_ALREADY_LINKED"

    def test_rejected_link_returns_no_tokens_for_the_other_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        link_identity(session, ben)
        sessions_before = len(
            session.execute(select(DeviceSession).where(DeviceSession.account_id == ben.id))
            .scalars()
            .all()
        )

        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert response.status_code == 409
        assert "tokens" not in response.json()
        assert (
            len(
                session.execute(select(DeviceSession).where(DeviceSession.account_id == ben.id))
                .scalars()
                .all()
            )
            == sessions_before
        )

    def test_rejected_link_mutates_neither_account_nor_identity(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        identity = link_identity(session, ben)
        assert identity.last_used_at is None

        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        assert callback(client, started["state"]).status_code == 409

        session.expire_all()
        identities = (
            session.execute(select(AuthIdentity).where(AuthIdentity.subject == SUBJECT))
            .scalars()
            .all()
        )
        assert len(identities) == 1
        assert identities[0].account_id == ben.id
        assert identities[0].last_used_at is None
        assert session.get(Account, anna.id).is_active
        assert session.get(Account, ben.id).is_active

    def test_rejection_does_not_name_the_owning_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "The response says the method is in use, never by whom."
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben Beispiel")
        link_identity(session, ben)

        started = start_link(client, auth(sign_in(session, anna)))
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert str(ben.id) not in response.text
        assert "Ben Beispiel" not in response.text
        assert SUBJECT not in response.text
        assert ISSUER not in response.text


class TestUnboundSignInIsUnchanged:
    def test_existing_identity_still_signs_into_its_own_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "A flow without an account keeps resolving the identity as before."
        ben = make_account(session, "Ben")
        link_identity(session, ben)

        started = start_sign_in(client)
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert response.status_code == 201, response.text
        assert response.json()["account"]["id"] == str(ben.id)

    def test_unknown_identity_without_intent_still_creates_no_account(
        self, client, session, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        before = len(session.execute(select(Account)).scalars().all())
        started = start_sign_in(client)
        provider.default_id_token = make_id_token(
            private_key, nonce=nonce_for(session, started["state"])
        )
        response = callback(client, started["state"])

        assert response.status_code == 401
        assert response.json()["code"] == "OIDC_NO_ACCOUNT"
        assert len(session.execute(select(Account)).scalars().all()) == before


class TestRealTransactions:
    """Behavior that only the real request unit of work can prove.

    The shared-session client cannot show these: it never commits or rolls
    back, so neither state redemption across a rejection nor two genuinely
    concurrent transactions would be visible.
    """

    def _prepare(self, maker, provider, private_key):  # type: ignore[no-untyped-def]
        with maker() as preparation:
            anna = make_account(preparation, "Anna")
            ben = make_account(preparation, "Ben")
            anna_token = sign_in(preparation, anna)
            ben_token = sign_in(preparation, ben)
            identifiers = (anna.id, ben.id)
            preparation.commit()
        return identifiers, anna_token, ben_token

    def test_state_is_spent_by_a_rejected_cross_account_link(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "The rejected attempt rolls back, but the state stays redeemed."
        client, maker = production_client
        (anna_id, ben_id), anna_token, _ = self._prepare(maker, provider, private_key)
        with maker() as preparation:
            link_identity(preparation, preparation.get(Account, ben_id))
            preparation.commit()

        started = start_link(client, auth(anna_token))
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )
            # Both accounts already hold the device session from preparation.
            sessions_before = len(lookup.execute(select(DeviceSession)).scalars().all())

        first = callback(client, started["state"])
        assert first.status_code == 409, first.text
        assert first.json()["code"] == "OIDC_IDENTITY_ALREADY_LINKED"

        replay = callback(client, started["state"])
        assert replay.status_code == 422, replay.text
        assert replay.json()["code"] == "OIDC_STATE_INVALID"

        with maker() as check:
            identities = check.execute(select(AuthIdentity)).scalars().all()
            assert [identity.account_id for identity in identities] == [ben_id]
            assert len(check.execute(select(DeviceSession)).scalars().all()) == sessions_before
            assert check.get(Account, anna_id) is not None

    def test_two_link_flows_for_one_identity_produce_exactly_one_link(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "Two accounts race for the same unlinked identity; one wins, one fails."
        client, maker = production_client
        (anna_id, ben_id), anna_token, ben_token = self._prepare(maker, provider, private_key)

        anna_flow = start_link(client, auth(anna_token))
        ben_flow = start_link(client, auth(ben_token))
        with maker() as lookup:
            provider.tokens_by_code["anna"] = make_id_token(
                private_key, nonce=nonce_for(lookup, anna_flow["state"])
            )
            provider.tokens_by_code["ben"] = make_id_token(
                private_key, nonce=nonce_for(lookup, ben_flow["state"])
            )

        barrier = Barrier(2)

        def attempt(pair: tuple[str, str]):  # type: ignore[no-untyped-def]
            code, state = pair
            barrier.wait(timeout=10)
            return callback(client, state, code=code)

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(
                pool.map(attempt, [("anna", anna_flow["state"]), ("ben", ben_flow["state"])])
            )

        assert sorted(response.status_code for response in responses) == [201, 409]
        rejected = next(response for response in responses if response.status_code == 409)
        assert rejected.json()["code"] == "OIDC_IDENTITY_ALREADY_LINKED"
        winner = next(response for response in responses if response.status_code == 201)
        winner_id = winner.json()["account"]["id"]
        assert winner_id in {str(anna_id), str(ben_id)}

        with maker() as check:
            identities = check.execute(select(AuthIdentity)).scalars().all()
            assert len(identities) == 1
            assert str(identities[0].account_id) == winner_id
            sessions_created = check.execute(select(DeviceSession)).scalars().all()
            # One device session per prepared account, plus one from the winner.
            assert len(sessions_created) == 3
            assert sum(str(row.account_id) == winner_id for row in sessions_created) == 2

    def test_one_link_state_replayed_concurrently_applies_once(
        self, production_client, provider, private_key
    ) -> None:  # type: ignore[no-untyped-def]
        "The state row lock keeps a duplicated callback deterministic."
        client, maker = production_client
        (anna_id, _), anna_token, _ = self._prepare(maker, provider, private_key)

        started = start_link(client, auth(anna_token))
        with maker() as lookup:
            provider.default_id_token = make_id_token(
                private_key, nonce=nonce_for(lookup, started["state"])
            )

        barrier = Barrier(2)

        def attempt(_: int):  # type: ignore[no-untyped-def]
            barrier.wait(timeout=10)
            return callback(client, started["state"])

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(attempt, [0, 1]))

        assert sorted(response.status_code for response in responses) == [201, 422]
        with maker() as check:
            identities = check.execute(select(AuthIdentity)).scalars().all()
            assert len(identities) == 1
            assert identities[0].account_id == anna_id
