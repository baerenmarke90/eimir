"""Google Play purchases reconcile into the shared Space entitlement (#1525).

Google is replaced by a fake ``StoreAdapter``; the HTTP adapter itself is
covered in ``tests/unit/test_billing_google_play.py``.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field, replace
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.billing import google_play
from eimir.billing import service as billing_service
from eimir.billing.models import StoreChannel
from eimir.billing.store import (
    StoreProviderError,
    StorePurchaseInvalidError,
    VerifiedStoreSubscription,
    token_reference,
)
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
)
from eimir.relationship.models import Membership, MembershipStatus
from eimir.relationship.service import add_member
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
PACKAGE = "de.eimir.app"
TOKEN = "play-purchase-token-1"
NOTIFY = "/api/v1/billing/google-play/notifications"


@dataclass
class FakePlay:
    """Google's current answer per token, plus the calls eimir. made."""

    states: dict[str, VerifiedStoreSubscription] = field(default_factory=dict)
    acknowledged: list[str] = field(default_factory=list)
    unavailable: bool = False
    store = StoreChannel.GOOGLE_PLAY

    def put(
        self,
        token: str,
        reference: UUID | None,
        status: EntitlementStatus | None = EntitlementStatus.ACTIVE,
        *,
        days: int = 30,
        acknowledged: bool = False,
    ) -> None:
        self.states[token] = VerifiedStoreSubscription(
            store=StoreChannel.GOOGLE_PLAY,
            reference=token_reference(StoreChannel.GOOGLE_PLAY, token),
            purchase_reference=reference,
            product_id="eimir_pro",
            plan_id="yearly",
            status=status,
            started_at=now() - timedelta(days=1),
            expires_at=now() + timedelta(days=days),
            auto_renewing=True,
            acknowledged=acknowledged,
            test_purchase=True,
        )

    def verify(self, purchase_token: str) -> VerifiedStoreSubscription:
        if self.unavailable:
            raise StoreProviderError("PLAY_UNAVAILABLE")
        if purchase_token not in self.states:
            raise StorePurchaseInvalidError("PLAY_PURCHASE_UNKNOWN")
        return self.states[purchase_token]

    def acknowledge(self, purchase_token: str, product_id: str) -> None:
        self.acknowledged.append(purchase_token)
        self.states[purchase_token] = replace(self.states[purchase_token], acknowledged=True)


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EIMIR_DEPLOYMENT", "cloud")
    monkeypatch.setenv("EIMIR_BILLING_GOOGLE_PLAY_PACKAGE", PACKAGE)
    monkeypatch.setenv(
        "EIMIR_BILLING_GOOGLE_PLAY_CREDENTIALS_FILE",
        str(Path("/run/secrets/play.json").absolute()),
    )
    monkeypatch.setenv("EIMIR_BILLING_GOOGLE_PLAY_RTDN_AUDIENCE", "https://eimir.example" + NOTIFY)
    monkeypatch.setenv(
        "EIMIR_BILLING_GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT", "push@eimir.iam.gserviceaccount.com"
    )
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def play(cloud: Any, monkeypatch: pytest.MonkeyPatch) -> FakePlay:
    fake = FakePlay()
    monkeypatch.setattr(billing_service, "google_play_adapter", lambda settings: fake)
    monkeypatch.setattr(
        google_play,
        "verify_notification_auth",
        lambda authorization, settings: authorization == "Bearer google-signed",
    )
    return fake


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
    }


def base(couple: dict[str, Any]) -> str:
    return f"/api/v1/spaces/{couple['space'].id}"


def start(client: TestClient, couple: dict[str, Any], who: str = "a", plan: str = "yearly") -> Any:
    return client.post(
        base(couple) + "/billing/purchases",
        json={"store": "GOOGLE_PLAY", "plan": plan},
        headers=couple[who],
    )


def submit(
    client: TestClient, couple: dict[str, Any], token: str = TOKEN, who: str = "a", **body: Any
) -> Any:
    return client.post(
        base(couple) + "/billing/google-play/purchases",
        json={"purchaseToken": token, **body},
        headers=couple[who],
    )


def tier(client: TestClient, couple: dict[str, Any], who: str = "a") -> str:
    response = client.get(base(couple) + "/entitlements", headers=couple[who])
    assert response.status_code == 200
    return str(response.json()["tier"])


def notify(client: TestClient, payload: dict[str, Any], token: str = "Bearer google-signed") -> Any:
    data = base64.b64encode(json.dumps({"packageName": PACKAGE, **payload}).encode()).decode()
    return client.post(
        NOTIFY,
        json={"message": {"data": data, "messageId": "1"}, "subscription": "s"},
        headers={"Authorization": token},
    )


def bought(client: TestClient, couple: dict[str, Any], play: FakePlay, token: str = TOKEN) -> UUID:
    response = start(client, couple)
    assert response.status_code == 201, response.text
    reference = UUID(response.json()["purchaseReference"])
    play.put(token, reference)
    return reference


def test_self_hosted_offers_no_store_channel(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    channels = client.get(base(couple) + "/billing/channels", headers=couple["a"])
    assert channels.status_code == 200
    assert channels.json() == {"channels": []}
    response = start(client, couple)
    assert response.status_code == 409
    assert response.json()["code"] == "BILLING_CHANNEL_UNAVAILABLE"
    assert submit(client, couple).json()["code"] == "BILLING_CHANNEL_UNAVAILABLE"


def test_cloud_lists_google_play_with_both_base_plans(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    body = client.get(base(couple) + "/billing/channels", headers=couple["a"]).json()
    assert body["channels"] == [
        {
            "store": "GOOGLE_PLAY",
            "productId": "eimir_pro",
            "plans": [
                {"plan": "monthly", "storePlanId": "monthly"},
                {"plan": "yearly", "storePlanId": "yearly"},
            ],
            "manageUrl": (
                "https://play.google.com/store/account/subscriptions"
                f"?sku=eimir_pro&package={PACKAGE}"
            ),
        }
    ]


def test_one_purchase_unlocks_pro_for_both_partners(client, session, couple, play) -> None:  # type: ignore[no-untyped-def]
    catalog_url = base(couple) + "/date-ideas"
    wir_design_url = base(couple) + "/appearance/wir-design"
    design = client.get(wir_design_url, headers=couple["b"])
    assert design.status_code == 200, design.text
    design_headers = {**couple["b"], "If-Match": design.headers["ETag"]}
    design_choice = {"designId": "modern"}

    blocked = client.get(catalog_url, headers=couple["a"])
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    blocked = client.patch(wir_design_url, headers=design_headers, json=design_choice)
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"

    started = start(client, couple)
    assert started.status_code == 201
    assert started.json()["productId"] == "eimir_pro"
    assert started.json()["storePlanId"] == "yearly"
    reference = UUID(started.json()["purchaseReference"])
    # The opaque reference is stable per sponsor and Space, not an Account ID.
    assert UUID(start(client, couple, plan="monthly").json()["purchaseReference"]) == reference
    assert reference != couple["anna"].id
    play.put(TOKEN, reference)

    response = submit(client, couple)
    assert response.status_code == 200, response.text
    assert response.json()["outcome"] == "confirmed"
    assert response.json()["entitlement"]["tier"] == "PREMIUM"
    assert tier(client, couple, "a") == tier(client, couple, "b") == "PREMIUM"
    assert play.acknowledged == [TOKEN]

    catalog = client.get(catalog_url, headers=couple["a"])
    assert catalog.status_code == 200, catalog.text
    assert catalog.json()["ideas"]
    saved_design = client.patch(wir_design_url, headers=design_headers, json=design_choice)
    assert saved_design.status_code == 200, saved_design.text
    assert saved_design.json()["designId"] == "modern"

    grant = session.execute(
        select(EntitlementGrant).where(EntitlementGrant.source_type == "GOOGLE_PLAY")
    ).scalar_one()
    assert grant.space_id == couple["space"].id
    assert grant.account_id == couple["anna"].id
    assert grant.external_reference == token_reference(StoreChannel.GOOGLE_PLAY, TOKEN)
    assert TOKEN not in json.dumps(grant.metadata_)

    # Replaying the same evidence stays one grant and acknowledges once.
    assert submit(client, couple).json()["outcome"] == "confirmed"
    assert play.acknowledged == [TOKEN]
    assert (
        len(
            session.execute(
                select(EntitlementGrant).where(EntitlementGrant.source_type == "GOOGLE_PLAY")
            )
            .scalars()
            .all()
        )
        == 1
    )

    # The partner sees "already active" instead of a second subscription.
    partner = start(client, couple, "b")
    assert partner.status_code == 409
    assert partner.json()["code"] == "BILLING_SPACE_ALREADY_PREMIUM"


def test_pending_payment_grants_nothing(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    reference = UUID(start(client, couple).json()["purchaseReference"])
    play.put(TOKEN, reference, status=None)
    response = submit(client, couple)
    assert response.json()["outcome"] == "pending"
    assert tier(client, couple) == "FREE"
    assert play.acknowledged == []

    # Google confirms the payment later; the notification grants Pro.
    play.put(TOKEN, reference)
    assert (
        notify(
            client, {"subscriptionNotification": {"notificationType": 4, "purchaseToken": TOKEN}}
        ).status_code
        == 204
    )
    assert tier(client, couple, "b") == "PREMIUM"
    assert play.acknowledged == [TOKEN]


def test_only_the_sponsor_can_submit_and_other_spaces_stay_free(  # type: ignore[no-untyped-def]
    client, session, couple, play
) -> None:
    bought(client, couple, play)
    partner = submit(client, couple, who="b")
    assert partner.status_code == 404
    assert partner.json()["code"] == "BILLING_PURCHASE_NOT_FOUND"

    stranger = make_account(session, "Stranger")
    other = make_space(session, stranger)
    stranger_auth = auth(sign_in(session, stranger))
    replay = client.post(
        f"/api/v1/spaces/{other.id}/billing/google-play/purchases",
        json={"purchaseToken": TOKEN},
        headers=stranger_auth,
    )
    assert replay.status_code == 404
    foreign = client.post(
        f"/api/v1/spaces/{other.id}/billing/google-play/purchases",
        json={"purchaseToken": TOKEN},
        headers=couple["a"],
    )
    assert foreign.status_code == 404
    assert entitlement_service.get_effective_space_entitlement(session, other.id).tier == "FREE"


def test_purchase_without_eimir_reference_is_rejected(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    play.put(TOKEN, None)
    assert submit(client, couple).status_code == 404
    unknown = submit(client, couple, token="never-sold")
    assert unknown.status_code == 422
    assert unknown.json()["code"] == "BILLING_PURCHASE_INVALID"


def test_store_outage_is_retryable_and_changes_nothing(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    bought(client, couple, play)
    play.unavailable = True
    response = submit(client, couple)
    assert response.status_code == 503
    assert response.json()["code"] == "BILLING_STORE_UNAVAILABLE"
    assert tier(client, couple) == "FREE"
    deferred = notify(
        client, {"subscriptionNotification": {"notificationType": 2, "purchaseToken": TOKEN}}
    )
    assert deferred.status_code == 503


def test_lifecycle_notifications_follow_google_state(client, session, couple, play) -> None:  # type: ignore[no-untyped-def]
    reference = bought(client, couple, play)
    assert submit(client, couple).json()["outcome"] == "confirmed"

    # Renewal: Google reports a later expiry.
    play.put(TOKEN, reference, days=400, acknowledged=True)
    assert (
        notify(
            client, {"subscriptionNotification": {"notificationType": 2, "purchaseToken": TOKEN}}
        ).status_code
        == 204
    )
    effective = entitlement_service.get_effective_space_entitlement(session, couple["space"].id)
    assert effective.effective_until is not None
    assert effective.effective_until > now() + timedelta(days=300)

    # Payment problem: grace keeps access until Google's explicit end.
    play.put(TOKEN, reference, EntitlementStatus.GRACE_PERIOD, days=5, acknowledged=True)
    notify(client, {"subscriptionNotification": {"notificationType": 6, "purchaseToken": TOKEN}})
    body = client.get(base(couple) + "/entitlements", headers=couple["b"]).json()
    assert body["tier"] == "PREMIUM" and body["isInGracePeriod"] is True

    # Expiry downgrades to Free; the grant row (history) stays.
    play.put(TOKEN, reference, EntitlementStatus.EXPIRED, acknowledged=True)
    notify(client, {"subscriptionNotification": {"notificationType": 13, "purchaseToken": TOKEN}})
    assert tier(client, couple) == "FREE"
    assert session.execute(select(EntitlementGrant)).scalars().one().status == "EXPIRED"
    # A later submission shows "expired" rather than claiming success.
    assert submit(client, couple, restore=True).json()["outcome"] == "expired"


def test_refund_revokes_pro_terminally(client, session, couple, play) -> None:  # type: ignore[no-untyped-def]
    reference = bought(client, couple, play)
    submit(client, couple)
    assert (
        notify(
            client, {"voidedPurchaseNotification": {"purchaseToken": TOKEN, "productType": 1}}
        ).status_code
        == 204
    )
    assert tier(client, couple) == tier(client, couple, "b") == "FREE"
    grant = session.execute(select(EntitlementGrant)).scalars().one()
    assert grant.status == EntitlementStatus.REVOKED.value
    assert grant.metadata_["revocationReason"] == "voided"

    # Stale "active" evidence cannot resurrect a refunded purchase.
    play.put(TOKEN, reference, acknowledged=True)
    submit(client, couple)
    assert tier(client, couple) == "FREE"


def test_revocation_notification_ends_access(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    bought(client, couple, play)
    submit(client, couple)
    notify(client, {"subscriptionNotification": {"notificationType": 12, "purchaseToken": TOKEN}})
    assert tier(client, couple) == "FREE"


def test_notifications_require_google_authentication(client, couple, play) -> None:  # type: ignore[no-untyped-def]
    bought(client, couple, play)
    payload = {"subscriptionNotification": {"notificationType": 4, "purchaseToken": TOKEN}}
    assert notify(client, payload, token="Bearer forged").status_code == 401
    assert tier(client, couple) == "FREE"
    # Other packages, test messages, unknown and unbound tokens change nothing.
    data = base64.b64encode(json.dumps({"packageName": "com.other", **payload}).encode()).decode()
    other = client.post(
        NOTIFY,
        json={"message": {"data": data}},
        headers={"Authorization": "Bearer google-signed"},
    )
    assert other.status_code == 204
    assert notify(client, {"testNotification": {"version": "1.0"}}).status_code == 204
    play.put("unbound-token", None)
    assert (
        notify(
            client,
            {"subscriptionNotification": {"notificationType": 4, "purchaseToken": "unbound-token"}},
        ).status_code
        == 204
    )
    assert tier(client, couple) == "FREE"
    garbage = client.post(
        NOTIFY, content=b"not json", headers={"Authorization": "Bearer google-signed"}
    )
    assert garbage.status_code == 204


def test_notifications_are_rejected_without_cloud_configuration(client) -> None:  # type: ignore[no-untyped-def]
    assert client.post(NOTIFY, json={}, headers={"Authorization": "Bearer x"}).status_code == 401


def test_restore_rebinds_only_after_the_sponsor_left_the_space(  # type: ignore[no-untyped-def]
    client, session, couple, play
) -> None:
    bought(client, couple, play)
    submit(client, couple)
    anna = couple["anna"]

    # Still a member: the purchase stays with the shared relationship.
    second_space = make_space(session, make_account(session, "Cara"))
    add_member(session, second_space.id, anna)
    session.flush()
    stays = client.post(
        f"/api/v1/spaces/{second_space.id}/billing/google-play/purchases",
        json={"purchaseToken": TOKEN, "restore": True},
        headers=couple["a"],
    )
    assert stays.status_code == 404

    # After leaving the first Space the still-paid grant follows the sponsor.
    membership = session.execute(
        select(Membership).where(
            Membership.account_id == anna.id, Membership.space_id == couple["space"].id
        )
    ).scalar_one()
    membership.status = MembershipStatus.LEFT.value
    session.flush()
    moved = client.post(
        f"/api/v1/spaces/{second_space.id}/billing/google-play/purchases",
        json={"purchaseToken": TOKEN, "restore": True},
        headers=couple["a"],
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["outcome"] == "restored"
    assert moved.json()["entitlement"]["tier"] == "PREMIUM"
    assert (
        entitlement_service.get_effective_space_entitlement(session, couple["space"].id).tier
        == "FREE"
    )


def test_app_store_source_is_prepared_but_not_offered(client, session, couple, play) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        base(couple) + "/billing/purchases",
        json={"store": "APP_STORE", "plan": "monthly"},
        headers=couple["a"],
    )
    assert response.status_code == 409
    assert response.json()["code"] == "BILLING_CHANNEL_UNAVAILABLE"
    grant = entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        source_type=EntitlementSourceType.APP_STORE,
        status=EntitlementStatus.ACTIVE,
        external_reference="as:prepared",
        source_event_at=now(),
        effective_from=now(),
        effective_until=now() + timedelta(days=1),
    )
    assert grant.source_type == "APP_STORE"
