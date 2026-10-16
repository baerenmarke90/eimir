"""Owner isolation and secret-safe lifecycle for Push endpoint registration."""

from __future__ import annotations

import base64
import json
import os
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from eimir.config import Settings
from eimir.engagement import push, unified_push
from eimir.engagement.models import PushEndpoint, PushEndpointSecret
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/push-endpoints"


class FakeProvider:
    def accepts_endpoint(self, endpoint: str) -> bool:
        return endpoint.startswith("opaque:") or endpoint.startswith('{"endpoint":')

    def registration_identity(self, endpoint: str) -> str:
        return endpoint

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        raise AssertionError("Registration must not send a Push notification.")


class FakeWebPushProvider(FakeProvider):
    def registration_identity(self, endpoint: str) -> str:
        return str(json.loads(endpoint)["endpoint"])


@pytest.fixture(autouse=True)
def clear_providers():  # type: ignore[no-untyped-def]
    push.providers.clear()
    yield
    push.providers.clear()


def test_registration_requires_auth_and_configured_valid_provider(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    body = {"providerKey": "fake", "endpointValue": "opaque:private-token"}

    assert client.post(BASE, json=body).status_code == 401
    assert client.delete(f"{BASE}/{uuid4()}").status_code == 401

    unavailable = client.post(BASE, json=body, headers=auth(token))
    assert unavailable.status_code == 503
    assert unavailable.json()["code"] == "PUSH_TRANSPORT_UNAVAILABLE"
    assert "private-token" not in unavailable.text
    assert session.execute(select(PushEndpoint)).scalars().all() == []

    push.providers.register("fake", FakeProvider())
    invalid = client.post(
        BASE,
        json={"providerKey": "fake", "endpointValue": "untrusted"},
        headers=auth(token),
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "PUSH_ENDPOINT_INVALID"
    assert "untrusted" not in invalid.text

    for bad in (
        {"providerKey": "fake", "endpointValue": " "},
        {"providerKey": "fake", "endpointValue": "opaque:bad\nvalue"},
        {"providerKey": "fake", "endpointValue": "opaque:" + "a" * 2048},
        {"providerKey": "fake", "endpointValue": "opaque:private-token", "accountId": str(uuid4())},
    ):
        assert client.post(BASE, json=bad, headers=auth(token)).status_code == 422
    assert session.execute(select(PushEndpoint)).scalars().all() == []


def test_unified_push_public_key_requires_auth_and_configuration(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    url = f"{BASE}/unifiedpush-configuration"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=auth(token)).status_code == 503

    raw_private_key = ec.generate_private_key(ec.SECP256R1()).private_numbers().private_value
    private_key = base64.urlsafe_b64encode(raw_private_key.to_bytes(32, "big")).rstrip(b"=")
    provider = unified_push.UnifiedPushProvider(
        Settings(
            push_vapid_private_key=SecretStr(private_key.decode()),
            push_vapid_subject="mailto:push@example.org",
            push_webpush_allowed_origins=["https://push.example.org"],
        )
    )
    push.providers.register(unified_push.PROVIDER_KEY, provider)
    response = client.get(url, headers=auth(token))
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.json() == {
        "providerKey": "unifiedpush",
        "vapidPublicKey": provider.vapid_public_key,
    }
    assert private_key.decode() not in response.text

    public = (
        ec.generate_private_key(ec.SECP256R1())
        .public_key()
        .public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    )
    subscription = json.dumps(
        {
            "endpoint": "https://push.example.org/send/capability",
            "keys": {
                "p256dh": base64.urlsafe_b64encode(public).rstrip(b"=").decode(),
                "auth": base64.urlsafe_b64encode(os.urandom(16)).rstrip(b"=").decode(),
            },
        },
        separators=(",", ":"),
    )
    registration = client.post(
        BASE,
        json={"providerKey": "unifiedpush", "endpointValue": subscription},
        headers=auth(token),
    )
    assert registration.status_code == 200
    assert session.execute(select(PushEndpointSecret)).scalar_one().payload.value == subscription


def test_registration_and_revocation_are_owner_scoped_and_idempotent(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)
    push.providers.register("fake", FakeProvider())
    body = {"providerKey": "fake", "endpointValue": "opaque:private-token"}

    created = client.post(BASE, json=body, headers=auth(anna_token))
    assert created.status_code == 200
    assert created.headers["Cache-Control"] == "private, no-store"
    assert list(created.json()) == ["id"]
    assert "private-token" not in created.text
    endpoint_id = created.json()["id"]

    again = client.post(BASE, json=body, headers=auth(anna_token))
    assert again.status_code == 200
    assert again.json()["id"] == endpoint_id
    rows = session.execute(select(PushEndpoint)).scalars().all()
    assert len(rows) == 1
    assert rows[0].account_id == anna.id
    assert rows[0].endpoint_value.startswith("sha256:")
    assert (
        session.execute(select(PushEndpointSecret)).scalar_one().payload.value
        == body["endpointValue"]
    )

    foreign = client.delete(f"{BASE}/{endpoint_id}", headers=auth(ben_token))
    missing = client.delete(f"{BASE}/{uuid4()}", headers=auth(ben_token))
    malformed = client.delete(f"{BASE}/not-an-id", headers=auth(ben_token))
    for result in (foreign, missing, malformed):
        assert result.status_code == 404
        assert result.json()["code"] == "PUSH_ENDPOINT_NOT_FOUND"
    assert rows[0].disabled_at is None

    revoked = client.delete(f"{BASE}/{endpoint_id}", headers=auth(anna_token))
    assert revoked.status_code == 204
    assert revoked.content == b""
    assert revoked.headers["Cache-Control"] == "private, no-store"
    session.flush()
    session.refresh(rows[0])
    disabled_at = rows[0].disabled_at
    assert disabled_at is not None
    assert client.delete(f"{BASE}/{endpoint_id}", headers=auth(anna_token)).status_code == 204
    session.refresh(rows[0])
    assert rows[0].disabled_at == disabled_at

    reactivated = client.post(BASE, json=body, headers=auth(anna_token))
    assert reactivated.status_code == 200
    assert reactivated.json()["id"] == endpoint_id
    session.refresh(rows[0])
    assert rows[0].disabled_at is None
    assert len(session.execute(select(PushEndpoint)).scalars().all()) == 1


def test_registration_preserves_web_push_subscription_without_echoing_keys(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    push.providers.register("web-push", FakeProvider())
    subscription = json.dumps(
        {
            "endpoint": "https://push.example.org/subscription/capability",
            "keys": {"p256dh": "public-key", "auth": "private-secret"},
        },
        separators=(",", ":"),
    )

    result = client.post(
        BASE,
        json={"providerKey": "web-push", "endpointValue": subscription},
        headers=auth(token),
    )
    assert result.status_code == 200
    assert "private-secret" not in result.text
    assert "capability" not in result.text
    endpoint = session.execute(select(PushEndpoint)).scalar_one()
    assert subscription not in endpoint.endpoint_value
    assert session.execute(select(PushEndpointSecret)).scalar_one().payload.value == subscription


def test_web_push_key_rotation_reuses_endpoint_and_encrypts_registration(
    client, session: Session, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    push.providers.register("web-push", FakeWebPushProvider())

    def subscribe(auth_secret: str) -> str:
        return json.dumps(
            {
                "endpoint": "https://push.example.org/subscription/capability",
                "keys": {"p256dh": "public-key", "auth": auth_secret},
            },
            separators=(",", ":"),
        )

    first = client.post(
        BASE,
        json={"providerKey": "web-push", "endpointValue": subscribe("first-secret")},
        headers=auth(token),
    )
    rotated = client.post(
        BASE,
        json={"providerKey": "web-push", "endpointValue": subscribe("rotated-secret")},
        headers=auth(token),
    )
    assert first.status_code == rotated.status_code == 200
    assert first.json()["id"] == rotated.json()["id"]
    assert len(session.execute(select(PushEndpoint)).scalars().all()) == 1
    secret = session.execute(select(PushEndpointSecret)).scalar_one()
    raw, version = session.execute(
        text("SELECT payload::text, crypto_version FROM push_endpoint_secrets WHERE id = :id"),
        {"id": secret.id},
    ).one()
    assert "capability" not in raw
    assert "first-secret" not in raw
    assert "rotated-secret" not in raw
    assert version == 2
    session.expire(secret)
    assert secret.payload.value == subscribe("rotated-secret")


def test_registration_caps_active_endpoints_per_account(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    token = sign_in(session, account)
    push.providers.register("fake", FakeProvider())

    for number in range(push.MAX_ACTIVE_ENDPOINTS):
        response = client.post(
            BASE,
            json={"providerKey": "fake", "endpointValue": f"opaque:device-{number}"},
            headers=auth(token),
        )
        assert response.status_code == 200

    capped = client.post(
        BASE,
        json={"providerKey": "fake", "endpointValue": "opaque:one-more"},
        headers=auth(token),
    )
    assert capped.status_code == 409
    assert capped.json()["code"] == "PUSH_ENDPOINT_LIMIT_REACHED"
    assert len(session.execute(select(PushEndpoint)).scalars().all()) == push.MAX_ACTIVE_ENDPOINTS
