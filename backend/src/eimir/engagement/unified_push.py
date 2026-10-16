"""UnifiedPush's RFC 8291 Web Push sender with pinned, bounded HTTPS egress."""

from __future__ import annotations

import base64
import binascii
import hashlib
import http.client
import ipaddress
import json
import re
import socket
import ssl
from dataclasses import dataclass
from typing import cast
from urllib.parse import SplitResult, urlsplit

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from py_vapid import Vapid  # type: ignore[import-untyped]
from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]

from eimir.config import Settings
from eimir.engagement import push

PROVIDER_KEY = "unifiedpush"
_BASE64URL = re.compile(r"[A-Za-z0-9_-]+={0,2}\Z")
_MAX_SUBSCRIPTION_BYTES = 2048
_MAX_ENDPOINT_BYTES = 1000
_PUSH_TTL_SECONDS = 300
_CONNECT_TIMEOUT_SECONDS = 5
_MAX_RESPONSE_BYTES = 1024


def _origin(parts: SplitResult) -> tuple[str, str, int] | None:
    try:
        port = parts.port if parts.port is not None else 443
    except ValueError:
        return None
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or "%" in parts.hostname
        or port <= 0
    ):
        return None
    return parts.scheme, parts.hostname.lower(), port


def _key(value: object, size: int) -> bytes | None:
    if not isinstance(value, str) or _BASE64URL.fullmatch(value) is None:
        return None
    try:
        raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    except (binascii.Error, ValueError):
        return None
    return raw if len(raw) == size else None


@dataclass(frozen=True)
class Subscription:
    endpoint: str
    p256dh: str
    auth: str

    def as_webpush(self) -> dict[str, object]:
        return {
            "endpoint": self.endpoint,
            "keys": {"p256dh": self.p256dh, "auth": self.auth},
        }


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect only to the selected address while verifying the URL hostname."""

    def __init__(self, hostname: str, port: int, address: str) -> None:
        self._ssl_context = ssl.create_default_context()
        super().__init__(
            hostname, port, timeout=_CONNECT_TIMEOUT_SECONDS, context=self._ssl_context
        )
        self._address = address

    def connect(self) -> None:
        raw_socket = socket.create_connection(
            (self._address, self.port), timeout=_CONNECT_TIMEOUT_SECONDS
        )
        try:
            self.sock = self._ssl_context.wrap_socket(raw_socket, server_hostname=self.host)
        except Exception:
            raw_socket.close()
            raise


class _PinnedPushSession(requests.Session):
    """Web Push transport without redirects, proxies or a second DNS lookup."""

    def __init__(self, allowed_origins: frozenset[tuple[str, str, int]]) -> None:
        super().__init__()
        self.allowed_origins = allowed_origins

    def post(  # type: ignore[override]
        self,
        url: str,
        *,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        timeout: float | None = None,
        **kwargs: object,
    ) -> requests.Response:
        del timeout
        if kwargs:
            raise push.PushProviderError("PUSH_REQUEST_INVALID", retryable=False)
        parts = urlsplit(url)
        origin = _origin(parts)
        if origin is None or origin not in self.allowed_origins:
            raise push.PushProviderError("PUSH_TARGET_BLOCKED", retryable=False)
        hostname = origin[1]
        port = origin[2]
        try:
            addresses = {
                cast(str, address[4][0])
                for address in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
            }
        except OSError:
            raise push.PushProviderError("PUSH_DNS_ERROR") from None
        if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
            raise push.PushProviderError("PUSH_TARGET_BLOCKED", retryable=False)
        address = sorted(addresses)[0]
        path = parts.path or "/"
        if parts.query:
            path += f"?{parts.query}"
        connection = _PinnedHTTPSConnection(hostname, port, address)
        try:
            connection.request("POST", path, body=data, headers=headers or {})
            remote = connection.getresponse()
            remote.read(_MAX_RESPONSE_BYTES + 1)
            result = requests.Response()
            result.status_code = remote.status
            result.reason = remote.reason
            result._content = b""
            return result
        except (OSError, ssl.SSLError, http.client.HTTPException):
            raise push.PushProviderError("PUSH_NETWORK_ERROR") from None
        finally:
            connection.close()


class UnifiedPushProvider:
    def __init__(self, settings: Settings) -> None:
        if settings.push_vapid_private_key is None:
            raise ValueError("UnifiedPush requires a configured VAPID key.")
        self._private_key = settings.push_vapid_private_key.get_secret_value()
        self._subject = settings.push_vapid_subject
        self._allowed_origins = frozenset(
            origin
            for raw in settings.push_webpush_allowed_origins
            if (origin := _origin(urlsplit(raw))) is not None
        )
        vapid = Vapid.from_string(self._private_key)
        public_key = vapid.public_key.public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.vapid_public_key = base64.urlsafe_b64encode(public_key).rstrip(b"=").decode("ascii")

    def _parse(self, value: str) -> Subscription | None:
        if len(value.encode("utf-8")) > _MAX_SUBSCRIPTION_BYTES:
            return None
        try:
            raw = json.loads(value)
        except (TypeError, ValueError):
            return None
        if not isinstance(raw, dict) or set(raw) != {"endpoint", "keys"}:
            return None
        endpoint = raw["endpoint"]
        keys = raw["keys"]
        if (
            not isinstance(endpoint, str)
            or len(endpoint.encode("utf-8")) > _MAX_ENDPOINT_BYTES
            or not isinstance(keys, dict)
            or set(keys) != {"p256dh", "auth"}
            or any(ord(character) < 33 or ord(character) == 127 for character in endpoint)
        ):
            return None
        try:
            parts = urlsplit(endpoint)
        except ValueError:
            return None
        if parts.fragment or _origin(parts) not in self._allowed_origins:
            return None
        public = _key(keys["p256dh"], 65)
        auth = _key(keys["auth"], 16)
        if public is None or auth is None:
            return None
        try:
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public)
        except ValueError:
            return None
        return Subscription(endpoint, keys["p256dh"], keys["auth"])

    def accepts_endpoint(self, endpoint: str) -> bool:
        return self._parse(endpoint) is not None

    def registration_identity(self, endpoint: str) -> str:
        registration = self._parse(endpoint)
        if registration is None:
            raise ValueError("Invalid UnifiedPush registration.")
        return registration.endpoint

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        del notification_reference
        registration = self._parse(endpoint)
        if registration is None:
            raise push.PushProviderError("PUSH_SUBSCRIPTION_INVALID", retryable=False)
        if generic_presentation_key != push.GENERIC_PRESENTATION_KEY:
            raise push.PushProviderError("PUSH_PRESENTATION_BLOCKED", retryable=False)
        topic = base64.urlsafe_b64encode(hashlib.sha256(idempotency_key.encode()).digest())[
            :32
        ].decode("ascii")
        try:
            webpush(
                subscription_info=registration.as_webpush(),
                data=json.dumps({"type": "wake"}, separators=(",", ":")),
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                content_encoding="aes128gcm",
                ttl=_PUSH_TTL_SECONDS,
                timeout=_CONNECT_TIMEOUT_SECONDS,
                headers={"Topic": topic},
                requests_session=_PinnedPushSession(self._allowed_origins),
            )
        except push.PushProviderError:
            raise
        except WebPushException as error:
            status = error.status_code
            if status in {404, 410}:
                raise push.PushProviderError("PUSH_SUBSCRIPTION_GONE", retryable=False) from None
            if status in {400, 401, 403, 413}:
                raise push.PushProviderError("PUSH_REJECTED", retryable=False) from None
            raise push.PushProviderError("PUSH_REMOTE_ERROR") from None
        except Exception:
            raise push.PushProviderError("PUSH_ENCODING_ERROR", retryable=False) from None
        return push.PushSendResult()


def configure_provider(settings: Settings) -> None:
    """Register only when all operator-managed capability settings are present."""
    if settings.push_vapid_private_key is not None:
        push.providers.register(PROVIDER_KEY, UnifiedPushProvider(settings))
