"""UnifiedPush registration validation, encrypted Web Push and pinned egress."""

from __future__ import annotations

import base64
import json
import os
import socket
from typing import Any

import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

from eimir.config import Settings
from eimir.engagement import push, unified_push


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _provider() -> unified_push.UnifiedPushProvider:
    private = ec.generate_private_key(ec.SECP256R1())
    vapid_key = _encoded(private.private_numbers().private_value.to_bytes(32, "big"))
    settings = Settings(
        push_vapid_private_key=SecretStr(vapid_key),
        push_vapid_subject="mailto:push@example.org",
        push_webpush_allowed_origins=["https://push.example.org"],
    )
    return unified_push.UnifiedPushProvider(settings)


def _subscription(url: str = "https://push.example.org/send/capability") -> str:
    public = (
        ec.generate_private_key(ec.SECP256R1())
        .public_key()
        .public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    )
    return json.dumps(
        {"endpoint": url, "keys": {"p256dh": _encoded(public), "auth": _encoded(os.urandom(16))}},
        separators=(",", ":"),
    )


def test_configuration_rejects_partial_or_invalid_push_setup() -> None:
    with pytest.raises(ValueError, match="Web Push requires"):
        Settings(push_vapid_subject="mailto:push@example.org")
    with pytest.raises(ValueError, match="VAPID_PRIVATE_KEY is invalid"):
        Settings(
            push_vapid_private_key=SecretStr("not-a-key"),
            push_vapid_subject="mailto:push@example.org",
            push_webpush_allowed_origins=["https://push.example.org"],
        )


def test_subscription_requires_allowed_https_origin_and_real_encryption_keys() -> None:
    provider = _provider()
    valid = _subscription()
    assert provider.accepts_endpoint(valid)
    assert provider.registration_identity(valid) == "https://push.example.org/send/capability"
    assert provider.registration_identity(_subscription()) == provider.registration_identity(valid)
    assert len(base64.urlsafe_b64decode(provider.vapid_public_key + "=")) == 65

    for invalid in (
        _subscription("http://push.example.org/send/capability"),
        _subscription("https://127.0.0.1/send/capability"),
        _subscription("https://push.example.org.evil.test/send/capability"),
        _subscription("https://push.example.org/send/capability#fragment"),
        json.dumps({"endpoint": "https://push.example.org/send", "keys": {"p256dh": "x"}}),
        valid.replace("p256dh", "unexpected"),
    ):
        assert not provider.accepts_endpoint(invalid)


def test_send_encrypts_only_generic_wake_and_signs_with_vapid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = _provider()
    subscription = _subscription()
    sent: dict[str, Any] = {}

    def capture(
        self: object, url: str, *, data: bytes, headers: dict[str, str], **_: object
    ) -> requests.Response:
        sent.update(url=url, data=data, headers=headers)
        result = requests.Response()
        result.status_code = 201
        result.reason = "Created"
        result._content = b""
        return result

    monkeypatch.setattr(unified_push._PinnedPushSession, "post", capture)
    result = provider.send(
        idempotency_key="notification-1:endpoint-1",
        endpoint=subscription,
        notification_reference={"id": "sensitive-reference", "kind": "PARTNER_KISS"},
        generic_presentation_key=push.GENERIC_PRESENTATION_KEY,
    )
    assert result.provider_message_id is None
    assert sent["url"] == "https://push.example.org/send/capability"
    assert b"wake" not in sent["data"]
    assert b"sensitive-reference" not in sent["data"]
    assert len(sent["data"]) <= 4096
    assert sent["headers"]["content-encoding"] == "aes128gcm"
    assert sent["headers"]["authorization"].startswith("vapid ")
    assert len(sent["headers"]["topic"]) == 32
    assert sent["headers"]["ttl"] == "300"


def test_expired_subscription_is_permanent_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = _provider()

    def gone(self: object, url: str, **_: object) -> requests.Response:
        del self, url
        result = requests.Response()
        result.status_code = 410
        result.reason = "Gone"
        result._content = b""
        return result

    monkeypatch.setattr(unified_push._PinnedPushSession, "post", gone)
    with pytest.raises(push.PushProviderError) as failure:
        provider.send(
            idempotency_key="id",
            endpoint=_subscription(),
            notification_reference={},
            generic_presentation_key=push.GENERIC_PRESENTATION_KEY,
        )
    assert failure.value.code == "PUSH_SUBSCRIPTION_GONE"
    assert not failure.value.retryable


def test_transport_rejects_private_dns_and_pins_public_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transport = unified_push._PinnedPushSession(frozenset({("https", "push.example.org", 443)}))
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("127.0.0.1", 443))],
    )
    with pytest.raises(push.PushProviderError) as blocked:
        transport.post("https://push.example.org/send", data=b"opaque")
    assert blocked.value.code == "PUSH_TARGET_BLOCKED"
    assert not blocked.value.retryable

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("8.8.8.8", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 0, "", ("169.254.169.254", 443)),
        ],
    )
    with pytest.raises(push.PushProviderError) as rebinding:
        transport.post("https://push.example.org/send", data=b"opaque")
    assert rebinding.value.code == "PUSH_TARGET_BLOCKED"

    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("8.8.8.8", 443))],
    )
    observed: dict[str, Any] = {}

    class FakeConnection:
        def __init__(self, host: str, port: int, address: str) -> None:
            observed.update(host=host, port=port, address=address)

        def request(self, method: str, path: str, **kwargs: object) -> None:
            observed.update(method=method, path=path, **kwargs)

        def getresponse(self) -> Any:
            class Response:
                status = 201
                reason = "Created"

                def read(self, size: int) -> bytes:
                    observed["read_size"] = size
                    return b""

            return Response()

        def close(self) -> None:
            pass

    monkeypatch.setattr(unified_push, "_PinnedHTTPSConnection", FakeConnection)
    response = transport.post("https://push.example.org/send?token=opaque", data=b"encrypted")
    assert response.status_code == 201
    assert observed["host"] == "push.example.org"
    assert observed["address"] == "8.8.8.8"
    assert observed["path"] == "/send?token=opaque"
    assert observed["read_size"] == 1025
