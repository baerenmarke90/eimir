"""Google Play Billing adapter: state mapping, transport and notification auth."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from eimir.billing import google_play
from eimir.billing.google_play import GooglePlayAdapter, parse_subscription
from eimir.billing.models import StoreChannel
from eimir.billing.service import parse_play_notification
from eimir.billing.store import (
    StoreProviderError,
    StorePurchaseInvalidError,
    token_reference,
)
from eimir.config import Deployment, Settings
from eimir.entitlements.models import EntitlementStatus

NOW = datetime(2026, 11, 15, 12, tzinfo=UTC)
PRODUCT = "eimir_pro"
TOKEN = "play-token.with-allowed_chars"
CREDENTIALS_FILE = str(Path("/run/secrets/play.json").absolute())


def purchase(state: str = "SUBSCRIPTION_STATE_ACTIVE", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subscriptionState": state,
        "startTime": "2026-11-01T10:00:00Z",
        "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
        "externalAccountIdentifiers": {"obfuscatedExternalAccountId": str(uuid4())},
        "lineItems": [
            {
                "productId": PRODUCT,
                "expiryTime": (NOW + timedelta(days=20)).isoformat().replace("+00:00", "Z"),
                "autoRenewingPlan": {"autoRenewEnabled": True},
                "offerDetails": {"basePlanId": "monthly"},
            }
        ],
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ("SUBSCRIPTION_STATE_ACTIVE", EntitlementStatus.ACTIVE),
        # Cancelled renewal keeps the already paid period.
        ("SUBSCRIPTION_STATE_CANCELED", EntitlementStatus.ACTIVE),
        ("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", EntitlementStatus.GRACE_PERIOD),
        ("SUBSCRIPTION_STATE_ON_HOLD", EntitlementStatus.EXPIRED),
        ("SUBSCRIPTION_STATE_PAUSED", EntitlementStatus.EXPIRED),
        ("SUBSCRIPTION_STATE_EXPIRED", EntitlementStatus.EXPIRED),
        ("SUBSCRIPTION_STATE_PENDING", None),
        ("SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED", None),
    ],
)
def test_play_states_map_to_the_normalized_lifecycle(
    state: str, expected: EntitlementStatus | None
) -> None:
    verified = parse_subscription(TOKEN, purchase(state), product_id=PRODUCT, at=NOW)
    assert verified.status == expected
    assert verified.store is StoreChannel.GOOGLE_PLAY
    assert verified.plan_id == "monthly"


def test_free_trial_offer_maps_to_trial() -> None:
    body = purchase()
    body["lineItems"][0]["offerPhase"] = {"freeTrial": {}}
    assert (
        parse_subscription(TOKEN, body, product_id=PRODUCT, at=NOW).status
        is EntitlementStatus.TRIAL
    )


def test_elapsed_expiry_never_grants_access() -> None:
    body = purchase()
    body["lineItems"][0]["expiryTime"] = "2026-11-01T00:00:00Z"
    verified = parse_subscription(TOKEN, body, product_id=PRODUCT, at=NOW)
    assert verified.status is EntitlementStatus.EXPIRED


def test_other_products_never_unlock_pro() -> None:
    body = purchase()
    body["lineItems"][0]["productId"] = "someone_else"
    with pytest.raises(StorePurchaseInvalidError):
        parse_subscription(TOKEN, body, product_id=PRODUCT, at=NOW)


def test_unknown_state_is_rejected() -> None:
    with pytest.raises(StoreProviderError):
        parse_subscription(TOKEN, purchase("SOMETHING_NEW"), product_id=PRODUCT, at=NOW)


def test_reference_is_a_hash_and_evidence_is_parsed() -> None:
    body = purchase(linkedPurchaseToken="older-token", testPurchase={})
    body["acknowledgementState"] = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
    verified = parse_subscription(TOKEN, body, product_id=PRODUCT, at=NOW)
    assert TOKEN not in verified.reference
    assert verified.reference == token_reference(StoreChannel.GOOGLE_PLAY, TOKEN)
    assert verified.linked_reference == token_reference(StoreChannel.GOOGLE_PLAY, "older-token")
    assert verified.test_purchase and verified.acknowledged and verified.auto_renewing
    assert (
        str(verified.purchase_reference)
        == (body["externalAccountIdentifiers"]["obfuscatedExternalAccountId"])
    )


def test_non_uuid_account_identifier_is_not_a_reference() -> None:
    body = purchase(externalAccountIdentifiers={"obfuscatedExternalAccountId": "anna@example"})
    assert parse_subscription(TOKEN, body, product_id=PRODUCT, at=NOW).purchase_reference is None


class Recorder:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.responses = responses
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.responses.pop(0)


def adapter(recorder: Recorder) -> GooglePlayAdapter:
    return GooglePlayAdapter(
        package="de.eimir.app",
        product_id=PRODUCT,
        access_token=lambda: "access-token",
        transport=httpx.MockTransport(recorder),
    )


def test_verify_calls_the_fixed_subscriptionsv2_endpoint() -> None:
    recorder = Recorder([httpx.Response(200, json=purchase())])
    verified = adapter(recorder).verify("token/with?chars")
    request = recorder.requests[0]
    assert request.method == "GET"
    assert str(request.url) == (
        "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/"
        "de.eimir.app/purchases/subscriptionsv2/tokens/token%2Fwith%3Fchars"
    )
    assert request.headers["Authorization"] == "Bearer access-token"
    assert verified.product_id == PRODUCT


def test_acknowledge_posts_to_the_subscription_endpoint() -> None:
    recorder = Recorder([httpx.Response(204)])
    adapter(recorder).acknowledge(TOKEN, PRODUCT)
    request = recorder.requests[0]
    assert request.method == "POST"
    assert str(request.url).endswith(
        f"/purchases/subscriptions/{PRODUCT}/tokens/{TOKEN}:acknowledge"
    )


@pytest.mark.parametrize(
    ("status", "error", "retryable"),
    [
        (404, StorePurchaseInvalidError, None),
        (400, StorePurchaseInvalidError, None),
        (401, StoreProviderError, False),
        (503, StoreProviderError, True),
    ],
)
def test_http_failures_map_to_fixed_errors(
    status: int, error: type[Exception], retryable: bool | None
) -> None:
    recorder = Recorder([httpx.Response(status, text=f"echo {TOKEN}")])
    with pytest.raises(error) as raised:
        adapter(recorder).verify(TOKEN)
    assert TOKEN not in str(raised.value)
    if retryable is not None:
        assert isinstance(raised.value, StoreProviderError)
        assert raised.value.retryable is retryable


def test_oversized_and_invalid_responses_fail_closed() -> None:
    big = httpx.Response(200, content=b"{" + b" " * (70 * 1024) + b"}")
    with pytest.raises(StoreProviderError):
        adapter(Recorder([big])).verify(TOKEN)
    with pytest.raises(StoreProviderError):
        adapter(Recorder([httpx.Response(200, content=b"not json")])).verify(TOKEN)


def test_invalid_tokens_are_never_sent() -> None:
    recorder = Recorder([])
    for token in ("", "x" * 5000, "white space"):
        with pytest.raises(StorePurchaseInvalidError):
            adapter(recorder).verify(token)
    assert recorder.requests == []


def test_notification_auth_requires_configuration_and_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        deployment=Deployment.CLOUD,
        billing_google_play_package="de.eimir.app",
        billing_google_play_credentials_file=CREDENTIALS_FILE,
        billing_google_play_rtdn_audience="https://eimir.example/api/v1/billing/google-play/notifications",
        billing_google_play_rtdn_service_account="pubsub-push@eimir.iam.gserviceaccount.com",
    )
    claims: dict[str, Any] = {
        "iss": "https://accounts.google.com",
        "email": "pubsub-push@eimir.iam.gserviceaccount.com",
        "email_verified": True,
    }
    seen: dict[str, Any] = {}

    def verify_token(token: str, request: Any, audience: str, certs_url: str) -> dict[str, Any]:
        seen.update(token=token, audience=audience, certs_url=certs_url)
        return dict(claims)

    monkeypatch.setattr(google_play.id_token, "verify_token", verify_token)
    assert google_play.verify_notification_auth("Bearer signed", settings)
    assert seen["audience"] == settings.billing_google_play_rtdn_audience
    assert seen["certs_url"] == "https://www.googleapis.com/oauth2/v1/certs"
    assert not google_play.verify_notification_auth(None, settings)
    assert not google_play.verify_notification_auth("Basic signed", settings)
    claims["email"] = "someone@example.com"
    assert not google_play.verify_notification_auth("Bearer signed", settings)
    claims["email"] = settings.billing_google_play_rtdn_service_account
    claims["email_verified"] = False
    assert not google_play.verify_notification_auth("Bearer signed", settings)

    def failing(*_: Any, **__: Any) -> dict[str, Any]:
        raise ValueError("bad signature")

    monkeypatch.setattr(google_play.id_token, "verify_token", failing)
    assert not google_play.verify_notification_auth("Bearer signed", settings)
    unconfigured = settings.model_copy(update={"billing_google_play_rtdn_audience": ""})
    assert not google_play.verify_notification_auth("Bearer signed", unconfigured)


def envelope(payload: dict[str, Any]) -> dict[str, Any]:
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return {"message": {"data": data, "messageId": "1"}, "subscription": "projects/x/subs/y"}


def test_notifications_are_decoded() -> None:
    parsed = parse_play_notification(
        envelope(
            {
                "packageName": "de.eimir.app",
                "subscriptionNotification": {"notificationType": 4, "purchaseToken": TOKEN},
            }
        )
    )
    assert parsed is not None and parsed.purchase_token == TOKEN
    assert parsed.notification_type == 4 and not parsed.voided
    voided = parse_play_notification(
        envelope(
            {
                "packageName": "de.eimir.app",
                "voidedPurchaseNotification": {"purchaseToken": TOKEN, "productType": 1},
            }
        )
    )
    assert voided is not None and voided.voided
    assert parse_play_notification(envelope({"packageName": "x", "testNotification": {}})) is None
    with pytest.raises(ValueError):
        parse_play_notification({"message": {"data": "%%%"}})


def test_play_billing_settings_are_cloud_only_and_complete() -> None:
    with pytest.raises(ValidationError, match="Cloud channel"):
        Settings(
            deployment=Deployment.SELF_HOSTED,
            billing_google_play_package="de.eimir.app",
            billing_google_play_credentials_file=CREDENTIALS_FILE,
        )
    with pytest.raises(ValidationError, match="requires"):
        Settings(deployment=Deployment.CLOUD, billing_google_play_package="de.eimir.app")
    with pytest.raises(ValidationError, match="absolute"):
        Settings(
            deployment=Deployment.CLOUD,
            billing_google_play_package="de.eimir.app",
            billing_google_play_credentials_file="play.json",
        )
    with pytest.raises(ValidationError, match="notifications require"):
        Settings(
            deployment=Deployment.CLOUD,
            billing_google_play_package="de.eimir.app",
            billing_google_play_credentials_file=CREDENTIALS_FILE,
            billing_google_play_rtdn_audience="https://eimir.example/x",
        )
    settings = Settings(
        deployment=Deployment.CLOUD,
        billing_google_play_package="de.eimir.app",
        billing_google_play_credentials_file=CREDENTIALS_FILE,
    )
    assert settings.google_play_billing_configured
    assert not Settings(deployment=Deployment.CLOUD).google_play_billing_configured


def test_credentials_must_be_a_service_account_file(tmp_path: Any) -> None:
    bad = tmp_path / "play.json"
    bad.write_text(json.dumps({"type": "authorized_user"}))
    with pytest.raises(StoreProviderError) as raised:
        google_play.load_credentials(str(bad))
    assert raised.value.code == "PLAY_CREDENTIALS_INVALID"
    with pytest.raises(StoreProviderError):
        google_play.load_credentials(str(tmp_path / "missing.json"))
