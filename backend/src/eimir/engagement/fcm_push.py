"""FCM HTTP-v1 wake adapter using official Google authentication."""

from __future__ import annotations

import base64
import json
import re
import stat
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import httpx
import requests
from google.auth import exceptions as auth_exceptions
from google.auth.credentials import TokenState
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import service_account
from joserfc import jwe
from joserfc.jwk import OctKey

from eimir.config import Settings
from eimir.core import clock
from eimir.engagement import push

PROVIDER_KEY = "fcm"
_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_FCM_ERROR_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError"
_MAX_RESPONSE_BYTES = 8192
_MAX_CREDENTIAL_BYTES = 65536
_TIMEOUT_SECONDS = 5.0
_FID = re.compile(r"[A-Za-z0-9_-]{22}\Z")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate registration field.")
        result[key] = value
    return result


@dataclass(frozen=True)
class Registration:
    fid: str
    activation_id: str

    def identity(self) -> str:
        return json.dumps(
            {"fid": self.fid, "activationId": self.activation_id}, separators=(",", ":")
        )


def _parse(value: str) -> Registration | None:
    if len(value) > 2048 or any(ord(c) < 33 or ord(c) > 126 for c in value):
        return None
    try:
        raw = json.loads(value, object_pairs_hook=_unique_object)
        if not isinstance(raw, dict) or set(raw) != {"fid", "activationId"}:
            return None
        fid, activation = raw["fid"], raw["activationId"]
        if not isinstance(fid, str) or _FID.fullmatch(fid) is None:
            return None
        if not isinstance(activation, str) or len(activation) != 36:
            return None
        parsed = UUID(activation)
        if parsed.version != 4 or str(parsed) != activation:
            return None
        return Registration(fid, activation)
    except (TypeError, ValueError):
        return None


def valid_preview_key(value: str) -> bool:
    if re.fullmatch(r"[A-Za-z0-9_-]{43}", value) is None:
        return False
    decoded = base64.urlsafe_b64decode(value + "=")
    return len(decoded) == 32 and base64.urlsafe_b64encode(decoded).decode().rstrip("=") == value


def encrypt_preview(endpoint: str, key: str, plaintext: str) -> str:
    registration = _parse(endpoint)
    if registration is None or not valid_preview_key(key):
        raise push.PushProviderError("PUSH_PREVIEW_INVALID", retryable=False)
    encoded = jwe.encrypt_compact(
        {
            "alg": "dir",
            "enc": "A256GCM",
            "typ": "eimir-push-preview+jwe",
            "kid": registration.activation_id,
        },
        plaintext.encode(),
        OctKey.import_key({"kty": "oct", "k": key}),
        algorithms=["dir", "A256GCM"],
    )
    if len(encoded) > 3000:
        raise push.PushProviderError("PUSH_PREVIEW_OVERSIZED", retryable=False)
    return encoded


def _wake(registration: Registration, reference: dict[str, str]) -> dict[str, str]:
    data = {"type": "wake", "activationId": registration.activation_id}
    encrypted = reference.get("encryptedPreview")
    if encrypted is not None:
        if (
            len(encrypted) > 3000
            or re.fullmatch(
                r"[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}", encrypted
            )
            is None
        ):
            raise push.PushProviderError("PUSH_PREVIEW_INVALID", retryable=False)
        data["preview"] = encrypted
    return data


def _load_credentials(settings: Settings) -> service_account.Credentials:
    """Validate only the selected operator file; never fall back to ambient ADC."""
    try:
        path = Path(settings.push_fcm_credentials_file)
        if not stat.S_ISREG(path.stat().st_mode):
            raise ValueError("Credential must be a regular file.")
        with path.open("rb") as source:
            encoded = source.read(_MAX_CREDENTIAL_BYTES + 1)
        if len(encoded) > _MAX_CREDENTIAL_BYTES:
            raise ValueError("Oversized credential file.")
        raw = json.loads(encoded, object_pairs_hook=_unique_object)
        if (
            not isinstance(raw, dict)
            or raw.get("type") != "service_account"
            or raw.get("project_id") != settings.push_fcm_project_id
            or raw.get("token_uri") != _TOKEN_URL
            or raw.get("universe_domain", "googleapis.com") != "googleapis.com"
        ):
            raise ValueError("Unexpected credential configuration.")
        return cast(
            service_account.Credentials,
            service_account.Credentials.from_service_account_info(raw, scopes=[_SCOPE]),  # type: ignore[no-untyped-call]
        )
    except Exception:
        # Neither the library exception nor input/file content may escape startup.
        raise ValueError("FCM sender credential file is unavailable or invalid.") from None


def _auth_error(status: int, retry_after: str | None) -> push.PushProviderError:
    retryable = status in {408, 429} or status >= 500
    return push.PushProviderError(
        "FCM_AUTH_UNAVAILABLE" if retryable else "FCM_AUTH_REJECTED",
        retryable=retryable,
        retry_not_before=_retry_not_before(retry_after),
        retry_base=timedelta(seconds=60) if status == 429 else None,
    )


class _AuthSession(requests.Session):
    """Bound the public Google-auth transport without implementing OAuth."""

    def __init__(self) -> None:
        super().__init__()
        self.trust_env = False

    def request(  # type: ignore[override]
        self, method: str, url: str, **kwargs: Any
    ) -> requests.Response:
        if method != "POST" or url != _TOKEN_URL:
            raise push.PushProviderError("FCM_AUTH_TARGET_BLOCKED", retryable=False)
        kwargs.update(timeout=_TIMEOUT_SECONDS, allow_redirects=False, stream=True)
        deadline = time.monotonic() + 2 * _TIMEOUT_SECONDS
        with super().request(method, url, **kwargs) as response:
            # Error bodies are unnecessary for OAuth classification. Preserve
            # status/backoff even if the peer never finishes its error body.
            if response.status_code != 200:
                raise _auth_error(response.status_code, response.headers.get("Retry-After"))
            content = bytearray()
            # A buffered 1 KiB read can hide a continuously trickling response
            # from the elapsed check. Auth replies are tiny and capped at 8 KiB.
            for chunk in response.iter_content(chunk_size=1):
                content.extend(chunk)
                if len(content) > _MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                    raise push.PushProviderError("FCM_AUTH_RESPONSE_INVALID")
            # Return a detached bounded response for the official Request adapter.
            result = requests.Response()
            result.status_code = response.status_code
            result.headers = response.headers.copy()
            result._content = bytes(content)
            return result


class _AuthRequest:
    """Allow one bounded credential exchange; all retries belong to the DB job."""

    def __init__(self, session: requests.Session) -> None:
        self._request = GoogleRequest(session=session)
        self._used = False

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        if self._used:
            raise push.PushProviderError("FCM_AUTH_UNAVAILABLE")
        self._used = True
        response = self._request(*args, **kwargs)
        # Returning transient OAuth errors would activate the SDK's own sleep/
        # retry loop while the delivery transaction holds the Account lock.
        if response.status != 200:
            raise _auth_error(response.status, response.headers.get("Retry-After"))
        return response


def _retry_not_before(header: str | None) -> datetime | None:
    if header is None:
        return None
    if len(header) > 128:
        raise push.PushProviderError("FCM_RETRY_AFTER_INVALID", retryable=False)
    try:
        value = header.strip()
        if re.fullmatch(r"[0-9]+", value):
            return clock.now() + timedelta(seconds=int(value))
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(UTC)
    except OverflowError:
        # A valid but unrepresentable delay must not become an earlier retry.
        raise push.PushProviderError("FCM_RETRY_AFTER_INVALID", retryable=False) from None
    except (ValueError, TypeError):
        return None


def _remote_error(status: int, body: object, retry_after: str | None) -> push.PushProviderError:
    code = None
    if isinstance(body, dict) and isinstance(error := body.get("error"), dict):
        details = error.get("details")
        if isinstance(details, list):
            for detail in details:
                if isinstance(detail, dict) and detail.get("@type") == _FCM_ERROR_TYPE:
                    code = detail.get("errorCode")
                    break
    if status == 404 and code == "UNREGISTERED":
        return push.PushProviderError("PUSH_SUBSCRIPTION_GONE", retryable=False)
    if status == 429:
        return push.PushProviderError(
            "FCM_QUOTA_EXCEEDED",
            retry_not_before=_retry_not_before(retry_after),
            retry_base=timedelta(seconds=60),
        )
    if status in {408, 500, 502, 503, 504}:
        return push.PushProviderError(
            "FCM_UNAVAILABLE", retry_not_before=_retry_not_before(retry_after)
        )
    if status == 401:
        return push.PushProviderError("FCM_AUTH_REJECTED")
    if status == 403:
        return push.PushProviderError(
            "FCM_SENDER_MISMATCH" if code == "SENDER_ID_MISMATCH" else "FCM_PERMISSION_DENIED",
            retryable=False,
        )
    return push.PushProviderError("FCM_REJECTED", retryable=False)


class FcmPushProvider:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        self.project_id = settings.push_fcm_project_id
        self.android_package = settings.push_fcm_android_package
        self._url = f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send"
        self._credentials = _load_credentials(settings)
        self._auth_session = _AuthSession()
        self._client = client or httpx.Client(
            timeout=httpx.Timeout(_TIMEOUT_SECONDS), follow_redirects=False, trust_env=False
        )

    def close(self) -> None:
        self._client.close()
        self._auth_session.close()

    def accepts_endpoint(self, endpoint: str) -> bool:
        return _parse(endpoint) is not None

    def registration_identity(self, endpoint: str) -> str:
        registration = _parse(endpoint)
        if registration is None:
            raise ValueError("Invalid FCM registration.")
        return registration.identity()

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        del idempotency_key
        registration = _parse(endpoint)
        if registration is None:
            raise push.PushProviderError("PUSH_SUBSCRIPTION_INVALID", retryable=False)
        if generic_presentation_key != push.GENERIC_PRESENTATION_KEY:
            raise push.PushProviderError("PUSH_PRESENTATION_BLOCKED", retryable=False)
        headers: dict[str, str] = {}
        try:
            # Public SDK primitives keep token expiry/refresh in google-auth.
            # before_request also starts optional background metadata lookups in
            # 2.62; this fixed-project sender uses no background auth lifecycle.
            if self._credentials.token_state is not TokenState.FRESH:
                self._credentials.refresh(_AuthRequest(self._auth_session))  # type: ignore[no-untyped-call]
            self._credentials.apply(headers)  # type: ignore[no-untyped-call]
            payload = {
                "message": {
                    "fid": registration.fid,
                    "data": _wake(registration, notification_reference),
                    "android": {
                        "ttl": "300s",
                        "restricted_package_name": self.android_package,
                        **(
                            {"collapse_key": "eimir-wake"}
                            if "encryptedPreview" not in notification_reference
                            else {}
                        ),
                        "priority": "high",
                    },
                }
            }
            deadline = time.monotonic() + 2 * _TIMEOUT_SECONDS
            with self._client.stream(
                "POST",
                self._url,
                headers=headers,
                json=payload,
                timeout=_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as response:
                if response.status_code == 401:
                    # Invalidate from headers, even if reading the error body
                    # subsequently exceeds its budget or fails mid-stream.
                    self._credentials.token = None
                encoded = bytearray()
                try:
                    # Yield each received chunk without waiting to fill a buffer.
                    for chunk in response.iter_bytes():
                        encoded.extend(chunk)
                        if len(encoded) > _MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                            if response.status_code == 200:
                                raise push.PushProviderError("FCM_RESPONSE_INVALID")
                            encoded.clear()
                            break
                except httpx.HTTPError:
                    if response.status_code == 200:
                        raise
                    # A partial error body cannot prove UNREGISTERED. Known
                    # status/header semantics still apply without that proof.
                    encoded.clear()
                try:
                    body = json.loads(encoded)
                except (ValueError, UnicodeDecodeError):
                    body = None
                if response.status_code != 200:
                    raise _remote_error(
                        response.status_code, body, response.headers.get("Retry-After")
                    )
                name = body.get("name") if isinstance(body, dict) else None
                if (
                    not isinstance(name, str)
                    or len(name) > 256
                    or re.fullmatch(
                        rf"projects/{re.escape(self.project_id)}/messages/[A-Za-z0-9%_:\-]+", name
                    )
                    is None
                ):
                    raise push.PushProviderError("FCM_RESPONSE_INVALID")
                return push.PushSendResult(provider_message_id=name)
        except push.PushProviderError:
            raise
        except auth_exceptions.RefreshError as error:
            raise push.PushProviderError(
                "FCM_AUTH_UNAVAILABLE" if error.retryable else "FCM_AUTH_REJECTED",
                retryable=error.retryable,
            ) from None
        except (auth_exceptions.GoogleAuthError, requests.RequestException):
            raise push.PushProviderError("FCM_AUTH_UNAVAILABLE") from None
        except httpx.HTTPError:
            raise push.PushProviderError("FCM_NETWORK_ERROR") from None
