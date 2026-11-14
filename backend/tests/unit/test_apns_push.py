"""Verify the APNs HTTP contract with a local transport and a disposable key."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from eimir.config import Settings
from eimir.engagement import apns_push, push


def test_apns_signs_neutral_alert_and_only_retires_an_unregistered_token(tmp_path: Path) -> None:
    private = ec.generate_private_key(ec.SECP256R1())
    key_file = tmp_path / "fixture.p8"
    key_file.write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    settings = Settings(
        push_apns_bundle_id="de.eimir.app",
        push_apns_team_id="TEAM000001",
        push_apns_key_id="KEY0000001",
        push_apns_key_file=str(key_file),
        push_apns_environment="development",
    )
    responses = iter([(200, ""), (400, "BadDeviceToken"), (410, "Unregistered")])
    notification_id, activation_id = str(uuid4()), str(uuid4())
    token = "ab" * 32
    signed_tokens: set[str] = set()

    def capture(request: httpx.Request) -> httpx.Response:
        assert request.url == f"https://api.sandbox.push.apple.com/3/device/{token}"
        assert request.headers["apns-topic"] == "de.eimir.app"
        assert request.headers["apns-push-type"] == "alert"
        assert request.headers["apns-collapse-id"] == notification_id
        signed = request.headers["authorization"].removeprefix("bearer ")
        signed_tokens.add(signed)
        assert jwt.get_unverified_header(signed)["kid"] == "KEY0000001"
        assert jwt.decode(signed, private.public_key(), algorithms=["ES256"])["iss"] == "TEAM000001"
        assert json.loads(request.content) == {
            "aps": {"alert": {"title": "eimir.", "body": "Du hast neue Nachrichten."}},
            "notificationId": notification_id,
            "activationId": activation_id,
        }
        status, reason = next(responses)
        return httpx.Response(
            status, stream=httpx.ByteStream(json.dumps({"reason": reason}).encode())
        )

    with httpx.Client(transport=httpx.MockTransport(capture)) as client:
        provider = apns_push.ApnsPushProvider(settings, client=client)
        endpoint = json.dumps(
            {"token": token, "activationId": activation_id}, separators=(",", ":")
        )
        assert provider.registration_identity(endpoint) == token
        assert not provider.accepts_endpoint('{"token":"bad-target","activationId":"wrong"}')

        def send() -> push.PushSendResult:
            return provider.send(
                idempotency_key="fixture",
                endpoint=endpoint,
                notification_reference={
                    "id": notification_id,
                    "locale": "de",
                    "kind": "ONCE_MESSAGE_RECEIVED",
                },
                generic_presentation_key=push.GENERIC_PRESENTATION_KEY,
            )

        assert send() == push.PushSendResult()
        with pytest.raises(push.PushProviderError, match="PUSH_REJECTED"):
            send()
        with pytest.raises(push.PushProviderError, match="PUSH_SUBSCRIPTION_GONE"):
            send()
    assert len(signed_tokens) == 1
