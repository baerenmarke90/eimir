"""Neutral, session-bound alerts sent through the standard APNs HTTP/2 API."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from uuid import UUID

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import UUID4, BaseModel, ConfigDict, Field

from eimir.config import Settings
from eimir.core import clock
from eimir.engagement import push
from eimir.i18n import text

PROVIDER_KEY = "apns"
_HOSTS = {
    "development": "https://api.sandbox.push.apple.com",
    "production": "https://api.push.apple.com",
}
_MAX_RESPONSE_BYTES = 1024


class Registration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(pattern=r"^(?:[0-9a-f]{2}){1,256}$")
    activation_id: UUID4 = Field(alias="activationId")


def _parse(encoded: str) -> Registration:
    if len(encoded) > 2048:
        raise ValueError("Invalid APNs registration.")
    return Registration.model_validate_json(encoded)


class ApnsPushProvider:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        self.bundle_id = settings.push_apns_bundle_id
        self.environment = settings.push_apns_environment
        self._team_id = settings.push_apns_team_id
        self._key_id = settings.push_apns_key_id
        try:
            path = Path(settings.push_apns_key_file)
            if not path.is_file():
                raise ValueError
            with path.open("rb") as source:
                key_data = source.read(4097)
            if len(key_data) > 4096:
                raise ValueError
            signing_key = serialization.load_pem_private_key(key_data, password=None)
            if not isinstance(signing_key, ec.EllipticCurvePrivateKey):
                raise ValueError
            if signing_key.curve.name != "secp256r1":
                raise ValueError
        except (OSError, TypeError, ValueError):
            raise ValueError("APNs requires a valid P-256 private key file.") from None
        self._key = signing_key
        self._jwt: tuple[int, str] | None = None
        self._token_lock = Lock()
        self._client = (
            client
            if client is not None
            else httpx.Client(http2=True, trust_env=False, follow_redirects=False, timeout=5.0)
        )

    def close(self) -> None:
        self._client.close()

    def accepts_endpoint(self, endpoint: str) -> bool:
        try:
            _parse(endpoint)
        except ValueError:
            return False
        return True

    def supports_notification_reference(self, endpoint: str) -> bool:
        return self.accepts_endpoint(endpoint)

    def registration_identity(self, endpoint: str) -> str:
        return _parse(endpoint).token

    def _authorization(self, now: int) -> str:
        with self._token_lock:
            if self._jwt is None or not 0 <= now - self._jwt[0] < 45 * 60:
                self._jwt = (
                    now,
                    jwt.encode(
                        {"iss": self._team_id, "iat": now},
                        self._key,
                        algorithm="ES256",
                        headers={"kid": self._key_id},
                    ),
                )
            return self._jwt[1]

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        del idempotency_key
        if generic_presentation_key != push.GENERIC_PRESENTATION_KEY:
            raise push.PushProviderError("PUSH_PRESENTATION_BLOCKED", retryable=False)
        try:
            registration = _parse(endpoint)
            notification_id = str(UUID(notification_reference["id"]))
        except (KeyError, ValueError):
            raise push.PushProviderError("PUSH_SUBSCRIPTION_INVALID", retryable=False) from None
        now = int(clock.now().timestamp())
        ttl = min(300, max(0, int(notification_reference.get("ttl", "300"))))
        locale = notification_reference.get("locale", "en")
        headers = {
            "authorization": f"bearer {self._authorization(now)}",
            "apns-topic": self.bundle_id,
            "apns-push-type": "alert",
            "apns-expiration": str(now + ttl) if ttl else "0",
            "apns-collapse-id": notification_id,
        }
        payload = {
            "aps": {"alert": {"title": "eimir.", "body": text("push.neutral", locale)}},
            "activationId": str(registration.activation_id),
            "notificationId": notification_id,
        }
        try:
            with self._client.stream(
                "POST",
                f"{_HOSTS[self.environment]}/3/device/{registration.token}",
                headers=headers,
                json=payload,
            ) as response:
                status = response.status_code
                if status == 200:
                    return push.PushSendResult()
                # Read only bounded error metadata. Never persist provider bodies or URLs.
                buffer = bytearray()
                for chunk in response.iter_raw():
                    buffer.extend(chunk[: _MAX_RESPONSE_BYTES + 1 - len(buffer)])
                    if len(buffer) > _MAX_RESPONSE_BYTES:
                        break
                data = bytes(buffer)
        except httpx.RequestError:
            raise push.PushProviderError("PUSH_NETWORK_ERROR") from None
        reason = ""
        if len(data) <= _MAX_RESPONSE_BYTES:
            try:
                decoded = json.loads(data)
                if isinstance(decoded, dict) and isinstance(decoded.get("reason"), str):
                    reason = decoded["reason"]
            except (ValueError, UnicodeError):
                pass
        if status == 410 and reason == "Unregistered":
            raise push.PushProviderError("PUSH_SUBSCRIPTION_GONE", retryable=False)
        if status == 403 and reason == "ExpiredProviderToken":
            with self._token_lock:
                self._jwt = None
            raise push.PushProviderError("PUSH_AUTH_REFRESH_REQUIRED")
        if status == 429 or status >= 500:
            raise push.PushProviderError("PUSH_REMOTE_ERROR")
        raise push.PushProviderError("PUSH_REJECTED", retryable=False)
