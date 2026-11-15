"""Google Play Billing adapter: purchase verification and notification auth.

Uses the Google Play Developer API (``purchases.subscriptionsv2``) as the only
source of subscription truth. The client's purchase result and Real-time
developer notifications (RTDN) are triggers to ask Google, never proof.

- Credentials: an operator-mounted service-account file, validated like the
  FCM sender credential; no ambient Application Default Credentials.
- Transport: fixed official endpoints, ``trust_env=False``, no redirects,
  bounded responses. Failures map to fixed codes; Google's text and the
  purchase token never reach logs or API responses.
- RTDN: Pub/Sub push requests carry a Google-signed OIDC token. The audience
  and the push service account are operator configuration; signature
  checking stays in ``google-auth``.
"""

from __future__ import annotations

import json
import stat
import threading
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from urllib.parse import quote
from uuid import UUID

import httpx
import requests
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token, service_account

from eimir.billing.models import StoreChannel
from eimir.billing.store import (
    StoreProviderError,
    StorePurchaseInvalidError,
    VerifiedStoreSubscription,
    token_reference,
)
from eimir.config import Settings
from eimir.core import clock
from eimir.entitlements.models import EntitlementStatus

API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
_MAX_RESPONSE_BYTES = 64 * 1024
_MAX_CREDENTIAL_BYTES = 65536
_MAX_TOKEN_LENGTH = 4096
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_AUTH_TIMEOUT_SECONDS = 5.0

# subscriptionsv2 states. Pending purchases grant nothing; ON_HOLD and PAUSED
# have no access by Google's definition and map to EXPIRED until Google reports
# a recovered payment.
_PENDING_STATES = frozenset(
    {
        "SUBSCRIPTION_STATE_PENDING",
        "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
        "SUBSCRIPTION_STATE_UNSPECIFIED",
    }
)
_NO_ACCESS_STATES = frozenset(
    {"SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_EXPIRED"}
)
# Canceled means "will not renew": access continues until the paid period ends.
_ACCESS_STATES = frozenset({"SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_CANCELED"})
_GRACE_STATE = "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
_KNOWN_STATES = _PENDING_STATES | _NO_ACCESS_STATES | _ACCESS_STATES | {_GRACE_STATE}

# RTDN subscription notification types that end paid access immediately.
SUBSCRIPTION_REVOKED = 12


def valid_purchase_token(value: str) -> bool:
    return 0 < len(value) <= _MAX_TOKEN_LENGTH and all(
        33 <= ord(character) <= 126 for character in value
    )


def _timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value or len(value) > 64:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo is not None else None


def _reference(value: object) -> UUID | None:
    if not isinstance(value, str) or len(value) != 36:
        return None
    try:
        parsed = UUID(value)
    except ValueError:
        return None
    return parsed if str(parsed) == value else None


def parse_subscription(
    purchase_token: str, body: Mapping[str, Any], *, product_id: str, at: datetime | None = None
) -> VerifiedStoreSubscription:
    """Reduce a ``SubscriptionPurchaseV2`` to the normalized lifecycle.

    Only the configured eimir. Pro product counts; a line item of another
    product never unlocks anything.
    """
    state = body.get("subscriptionState")
    if not isinstance(state, str) or state not in _KNOWN_STATES:
        raise StoreProviderError("PLAY_RESPONSE_INVALID", retryable=False)
    raw_items = body.get("lineItems")
    items = [
        item
        for item in (raw_items if isinstance(raw_items, list) else [])
        if isinstance(item, dict) and item.get("productId") == product_id
    ]
    if not items:
        raise StorePurchaseInvalidError("PLAY_PRODUCT_MISMATCH")

    expiries = [value for item in items if (value := _timestamp(item.get("expiryTime")))]
    expires_at = max(expiries) if expiries else None
    item = items[0]
    offer = item.get("offerDetails")
    plan_id = offer.get("basePlanId") if isinstance(offer, dict) else None
    phase = item.get("offerPhase")
    free_trial = isinstance(phase, dict) and isinstance(phase.get("freeTrial"), dict)
    plan = item.get("autoRenewingPlan")
    auto_renewing = isinstance(plan, dict) and plan.get("autoRenewEnabled") is True
    identifiers = body.get("externalAccountIdentifiers")
    obfuscated = (
        identifiers.get("obfuscatedExternalAccountId") if isinstance(identifiers, dict) else None
    )
    linked = body.get("linkedPurchaseToken")
    current = clock.ensure_utc(at) if at is not None else clock.now()

    status: EntitlementStatus | None
    if state in _PENDING_STATES:
        status = None
    elif state in _NO_ACCESS_STATES or expires_at is None or expires_at <= current:
        status = EntitlementStatus.EXPIRED
    elif state == _GRACE_STATE:
        status = EntitlementStatus.GRACE_PERIOD
    else:
        status = EntitlementStatus.TRIAL if free_trial else EntitlementStatus.ACTIVE

    return VerifiedStoreSubscription(
        store=StoreChannel.GOOGLE_PLAY,
        reference=token_reference(StoreChannel.GOOGLE_PLAY, purchase_token),
        purchase_reference=_reference(obfuscated),
        product_id=product_id,
        plan_id=plan_id if isinstance(plan_id, str) and len(plan_id) <= 64 else None,
        status=status,
        started_at=_timestamp(body.get("startTime")),
        expires_at=expires_at,
        auto_renewing=auto_renewing,
        acknowledged=body.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        test_purchase=isinstance(body.get("testPurchase"), dict),
        linked_reference=(
            token_reference(StoreChannel.GOOGLE_PLAY, linked)
            if isinstance(linked, str) and valid_purchase_token(linked)
            else None
        ),
    )


class _BoundedGoogleSession(requests.Session):
    """Restrict ``google-auth`` HTTP to one fixed URL with bounded replies."""

    def __init__(self, method: str, url: str) -> None:
        super().__init__()
        self.trust_env = False
        self._method = method
        self._url = url

    def request(  # type: ignore[override]
        self, method: str, url: str, **kwargs: Any
    ) -> requests.Response:
        if method != self._method or url != self._url:
            raise StoreProviderError("PLAY_AUTH_TARGET_BLOCKED", retryable=False)
        kwargs.update(timeout=_AUTH_TIMEOUT_SECONDS, allow_redirects=False, stream=True)
        deadline = time.monotonic() + 2 * _AUTH_TIMEOUT_SECONDS
        with super().request(method, url, **kwargs) as response:
            content = bytearray()
            for chunk in response.iter_content(chunk_size=1024):
                content.extend(chunk)
                if len(content) > _MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                    raise StoreProviderError("PLAY_AUTH_RESPONSE_INVALID")
            result = requests.Response()
            result.status_code = response.status_code
            result.headers = response.headers.copy()
            result._content = bytes(content)
            return result


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate field.")
        result[key] = value
    return result


def load_credentials(path_value: str) -> service_account.Credentials:
    """Validate only the configured operator file; never fall back to ambient ADC."""
    try:
        path = Path(path_value)
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
            or raw.get("token_uri") != _TOKEN_URL
            or raw.get("universe_domain", "googleapis.com") != "googleapis.com"
        ):
            raise ValueError("Unexpected credential configuration.")
        return cast(
            service_account.Credentials,
            service_account.Credentials.from_service_account_info(raw, scopes=[_SCOPE]),  # type: ignore[no-untyped-call]
        )
    except Exception:
        # Neither the library exception nor file content may escape.
        raise StoreProviderError("PLAY_CREDENTIALS_INVALID", retryable=False) from None


class ServiceAccountTokens:
    """Cache one access token per process; refresh through the bounded session."""

    def __init__(self, credentials_file: str) -> None:
        self._file = credentials_file
        self._credentials: service_account.Credentials | None = None
        self._lock = threading.Lock()

    def __call__(self) -> str:
        with self._lock:
            if self._credentials is None:
                self._credentials = load_credentials(self._file)
            credentials = self._credentials
            if not credentials.valid:
                try:
                    credentials.refresh(  # type: ignore[no-untyped-call]
                        GoogleRequest(session=_BoundedGoogleSession("POST", _TOKEN_URL))
                    )
                except StoreProviderError:
                    raise
                except Exception:
                    raise StoreProviderError("PLAY_AUTH_UNAVAILABLE") from None
            token = credentials.token
            if not isinstance(token, str) or not token:
                raise StoreProviderError("PLAY_AUTH_UNAVAILABLE")
            return token


_TOKEN_SOURCES: dict[str, ServiceAccountTokens] = {}
_TOKEN_SOURCES_LOCK = threading.Lock()


def _token_source(credentials_file: str) -> ServiceAccountTokens:
    with _TOKEN_SOURCES_LOCK:
        source = _TOKEN_SOURCES.get(credentials_file)
        if source is None:
            source = _TOKEN_SOURCES[credentials_file] = ServiceAccountTokens(credentials_file)
        return source


class GooglePlayAdapter:
    """``StoreAdapter`` for Google Play subscriptions."""

    store = StoreChannel.GOOGLE_PLAY

    def __init__(
        self,
        *,
        package: str,
        product_id: str,
        access_token: Callable[[], str],
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.package = package
        self.product_id = product_id
        self._access_token = access_token
        self._transport = transport

    @classmethod
    def from_settings(cls, settings: Settings) -> GooglePlayAdapter:
        return cls(
            package=settings.billing_google_play_package,
            product_id=settings.billing_google_play_product_id,
            access_token=_token_source(settings.billing_google_play_credentials_file),
        )

    def _request(self, method: str, url: str) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        try:
            with (
                httpx.Client(
                    transport=self._transport,
                    timeout=_TIMEOUT,
                    trust_env=False,
                    follow_redirects=False,
                ) as client,
                client.stream(
                    method, url, headers=headers, json={} if method == "POST" else None
                ) as response,
            ):
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > _MAX_RESPONSE_BYTES:
                        raise StoreProviderError("PLAY_RESPONSE_INVALID")
                return httpx.Response(response.status_code, content=bytes(content))
        except httpx.HTTPError:
            raise StoreProviderError("PLAY_UNAVAILABLE") from None

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.status_code in {400, 404, 410}:
            # Unknown token, token of another package, or a removed purchase.
            raise StorePurchaseInvalidError("PLAY_PURCHASE_UNKNOWN")
        if response.status_code in {401, 403}:
            raise StoreProviderError("PLAY_AUTH_REJECTED", retryable=False)
        if response.status_code != 200 and response.status_code != 204:
            raise StoreProviderError("PLAY_UNAVAILABLE")

    def verify(self, purchase_token: str) -> VerifiedStoreSubscription:
        if not valid_purchase_token(purchase_token):
            raise StorePurchaseInvalidError("PLAY_TOKEN_INVALID")
        url = (
            f"{API}/{quote(self.package, safe='')}/purchases/subscriptionsv2/tokens/"
            f"{quote(purchase_token, safe='')}"
        )
        response = self._request("GET", url)
        self._raise_for_status(response)
        try:
            body = json.loads(response.content, object_pairs_hook=_unique_object)
        except ValueError:
            raise StoreProviderError("PLAY_RESPONSE_INVALID") from None
        if not isinstance(body, dict):
            raise StoreProviderError("PLAY_RESPONSE_INVALID")
        return parse_subscription(purchase_token, body, product_id=self.product_id)

    def acknowledge(self, purchase_token: str, product_id: str) -> None:
        url = (
            f"{API}/{quote(self.package, safe='')}/purchases/subscriptions/"
            f"{quote(product_id, safe='')}/tokens/{quote(purchase_token, safe='')}:acknowledge"
        )
        self._raise_for_status(self._request("POST", url))


def verify_notification_auth(authorization: str | None, settings: Settings) -> bool:
    """Accept only Google-signed Pub/Sub push tokens for the configured identity."""
    audience = settings.billing_google_play_rtdn_audience
    account = settings.billing_google_play_rtdn_service_account
    if not audience or not account or not authorization:
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 8192:
        return False
    try:
        claims = id_token.verify_token(
            token,
            GoogleRequest(session=_BoundedGoogleSession("GET", _CERTS_URL)),
            audience=audience,
            certs_url=_CERTS_URL,
        )
    except Exception:
        return False
    return (
        isinstance(claims, dict)
        and claims.get("iss") in _ISSUERS
        and claims.get("email") == account
        and claims.get("email_verified") is True
    )
