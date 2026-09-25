"""Owner isolation and secret-safe lifecycle for Push endpoint registration."""

from __future__ import annotations

import json
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.engagement import push
from eimir.engagement.models import PushEndpoint
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/push-endpoints"


class FakeProvider:
    def accepts_endpoint(self, endpoint: str) -> bool:
        return endpoint.startswith("opaque:") or endpoint.startswith('{"endpoint":')

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        raise AssertionError("Registration must not send a Push notification.")


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
    assert rows[0].endpoint_value == body["endpointValue"]

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
    assert endpoint.endpoint_value == subscription


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
