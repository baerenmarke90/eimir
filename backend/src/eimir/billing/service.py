"""Reconcile verified store subscriptions into Space entitlement grants (#1525).

The store is the only payment authority and the central entitlement service is
the only access authority. This module connects them:

1. ``start_purchase`` binds the sponsor Account and the Space to an opaque
   purchase reference before the store sheet opens.
2. ``submit_purchase`` (app) and ``reconcile_notification`` (RTDN) ask the
   store for the current state and record it idempotently as one
   ``EntitlementGrant`` per purchase. A Space grant covers both partners.
3. The first verified purchase is acknowledged server-side; an interrupted
   acknowledgement is retried by the next submission or notification.

Nothing but the opaque reference and the chosen plan reaches the store; no
name, e-mail address or relationship content.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.billing.models import StoreChannel, StorePlan, StorePurchaseReference
from eimir.billing.store import (
    StoreAdapter,
    StoreProviderError,
    StorePurchaseInvalidError,
    VerifiedStoreSubscription,
    token_reference,
)
from eimir.config import Settings, get_settings
from eimir.core import clock
from eimir.core.errors import (
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship.models import Membership, MembershipStatus

logger = logging.getLogger(__name__)


class BillingErrorCode:
    CHANNEL_UNAVAILABLE = "BILLING_CHANNEL_UNAVAILABLE"
    SPACE_ALREADY_PREMIUM = "BILLING_SPACE_ALREADY_PREMIUM"
    PURCHASE_INVALID = "BILLING_PURCHASE_INVALID"
    PURCHASE_NOT_FOUND = "BILLING_PURCHASE_NOT_FOUND"
    STORE_UNAVAILABLE = "BILLING_STORE_UNAVAILABLE"


class PurchaseOutcome(StrEnum):
    """Server-side result; the client maps it onto ``ProPurchaseOutcome``."""

    CONFIRMED = "confirmed"
    RESTORED = "restored"
    PENDING = "pending"
    EXPIRED = "expired"


@dataclass(frozen=True)
class StoreOffer:
    store: StoreChannel
    product_id: str
    plans: dict[StorePlan, str]
    manage_url: str


def google_play_adapter(settings: Settings) -> StoreAdapter:
    """Composition root for the Play adapter; tests replace it with a fake."""
    from eimir.billing.google_play import GooglePlayAdapter

    return GooglePlayAdapter.from_settings(settings)


def store_offers(settings: Settings | None = None) -> list[StoreOffer]:
    """Store channels this installation can fulfil. Self-Hosted offers none."""
    settings = settings or get_settings()
    offers: list[StoreOffer] = []
    if settings.google_play_billing_configured:
        product = settings.billing_google_play_product_id
        offers.append(
            StoreOffer(
                store=StoreChannel.GOOGLE_PLAY,
                product_id=product,
                plans={
                    StorePlan.MONTHLY: settings.billing_google_play_monthly_base_plan,
                    StorePlan.YEARLY: settings.billing_google_play_yearly_base_plan,
                },
                manage_url=(
                    "https://play.google.com/store/account/subscriptions"
                    f"?sku={product}&package={settings.billing_google_play_package}"
                ),
            )
        )
    return offers


def _offer(store: StoreChannel) -> StoreOffer:
    for offer in store_offers():
        if offer.store is store:
            return offer
    raise ConflictError(
        "This purchase channel is not available here.", BillingErrorCode.CHANNEL_UNAVAILABLE
    )


def _adapter(store: StoreChannel) -> StoreAdapter:
    if store is not StoreChannel.GOOGLE_PLAY:
        raise ConflictError(
            "This purchase channel is not available here.", BillingErrorCode.CHANNEL_UNAVAILABLE
        )
    return google_play_adapter(get_settings())


def start_purchase(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
    store: StoreChannel,
    plan: StorePlan,
) -> tuple[StorePurchaseReference, StoreOffer]:
    """Bind the sponsor and Space before the store sheet opens.

    A Space that already has Pro (bought by either partner or granted another
    way) gets no second subscription offer.
    """
    offer = _offer(store)
    effective = entitlement_service.get_effective_space_entitlement(session, space_id)
    if effective.tier is EntitlementTier.PREMIUM:
        raise ConflictError(
            "eimir. Pro is already active for this Space.",
            BillingErrorCode.SPACE_ALREADY_PREMIUM,
        )
    reference = session.execute(
        select(StorePurchaseReference).where(
            StorePurchaseReference.account_id == account_id,
            StorePurchaseReference.space_id == space_id,
            StorePurchaseReference.store == store.value,
        )
    ).scalar_one_or_none()
    if reference is None:
        reference = StorePurchaseReference(account_id=account_id, space_id=space_id, store=store)
        session.add(reference)
        session.flush()
    del plan  # The plan only selects the base plan the client opens; no state.
    return reference, offer


def _find_reference(session: Session, purchase_reference: UUID | None) -> StorePurchaseReference:
    if purchase_reference is None:
        raise NotFoundError("Purchase not found.", BillingErrorCode.PURCHASE_NOT_FOUND)
    row = session.execute(
        select(StorePurchaseReference)
        .where(StorePurchaseReference.reference == purchase_reference)
        .with_for_update()
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Purchase not found.", BillingErrorCode.PURCHASE_NOT_FOUND)
    return row


def _is_active_member(session: Session, account_id: UUID, space_id: UUID) -> bool:
    return (
        session.execute(
            select(Membership.id).where(
                Membership.account_id == account_id,
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        ).first()
        is not None
    )


def _record(
    session: Session,
    verified: VerifiedStoreSubscription,
    *,
    space_id: UUID,
    account_id: UUID | None,
    observed_at: Any,
) -> EntitlementGrant:
    assert verified.status is not None
    return entitlement_service.record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=verified.store.value,
        external_reference=verified.reference,
        source_event_at=observed_at,
        status=verified.status,
        tier=EntitlementTier.PREMIUM,
        effective_from=verified.started_at or observed_at,
        effective_until=verified.expires_at,
        # ``None`` = the current normalized Premium set (no frozen snapshot).
        capabilities=None,
        metadata={
            "product": verified.product_id,
            "plan": verified.plan_id,
            "autoRenewing": verified.auto_renewing,
            "testPurchase": verified.test_purchase,
            "linkedReference": verified.linked_reference,
        },
    )


def _acknowledge(adapter: StoreAdapter, token: str, verified: VerifiedStoreSubscription) -> None:
    """Acknowledge within Google's three days; failures retry on the next event."""
    if verified.acknowledged or verified.status is None:
        return
    try:
        adapter.acknowledge(token, verified.product_id)
    except (StoreProviderError, StorePurchaseInvalidError) as error:
        code = getattr(error, "code", "PLAY_PURCHASE_UNKNOWN")
        logger.warning("store_purchase_acknowledge_failed", extra={"code": code})


def _verify(adapter: StoreAdapter, token: str) -> VerifiedStoreSubscription:
    try:
        return adapter.verify(token)
    except StorePurchaseInvalidError:
        raise ValidationError(
            "The store does not confirm this purchase.", BillingErrorCode.PURCHASE_INVALID
        ) from None
    except StoreProviderError as error:
        logger.warning("store_purchase_verify_failed", extra={"code": error.code})
        raise ServiceUnavailableError(
            "The store cannot be reached right now.", BillingErrorCode.STORE_UNAVAILABLE
        ) from None


def submit_purchase(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
    store: StoreChannel,
    purchase_token: str,
    restore: bool,
) -> PurchaseOutcome:
    """Verify a token the app received and reconcile it into the Space grant.

    Only the sponsor Account that started the purchase can submit it. A
    purchase stays with the Space it was bought for while the sponsor is still
    a member there; after the sponsor left that Space, restore re-binds the
    still-paid grant to the sponsor's current Space.
    """
    _offer(store)
    adapter = _adapter(store)
    verified = _verify(adapter, purchase_token)
    observed_at = clock.now()
    reference = _find_reference(session, verified.purchase_reference)
    if reference.account_id != account_id or reference.store != store.value:
        raise NotFoundError("Purchase not found.", BillingErrorCode.PURCHASE_NOT_FOUND)
    if reference.space_id != space_id and _is_active_member(
        session, account_id, reference.space_id
    ):
        # Never move Pro away from a relationship the sponsor still belongs to.
        raise NotFoundError("Purchase not found.", BillingErrorCode.PURCHASE_NOT_FOUND)

    if verified.status is None:
        return PurchaseOutcome.PENDING

    grant = _record(
        session,
        verified,
        space_id=reference.space_id,
        account_id=reference.account_id,
        observed_at=observed_at,
    )
    _acknowledge(adapter, purchase_token, verified)

    effective, _, _ = entitlement_service.evaluate_grant_validity(grant, observed_at)
    if not effective:
        return PurchaseOutcome.EXPIRED
    if grant.space_id != space_id:
        entitlement_service.restore_grant_to_space(
            session,
            source_type=store.value,
            external_reference=verified.reference,
            space_id=space_id,
            account_id=account_id,
            at=observed_at,
        )
        clash = session.execute(
            select(StorePurchaseReference.id).where(
                StorePurchaseReference.account_id == account_id,
                StorePurchaseReference.space_id == space_id,
                StorePurchaseReference.store == store.value,
            )
        ).first()
        if clash is None:
            reference.space_id = space_id
        session.flush()
    return PurchaseOutcome.RESTORED if restore else PurchaseOutcome.CONFIRMED


@dataclass(frozen=True)
class PlayNotification:
    package: str
    purchase_token: str | None
    notification_type: int | None
    voided: bool


def parse_play_notification(envelope: object) -> PlayNotification | None:
    """Decode a Pub/Sub push envelope; ``None`` for test or unrelated messages."""
    if not isinstance(envelope, dict):
        raise ValueError("Envelope must be an object.")
    message = envelope.get("message")
    data = message.get("data") if isinstance(message, dict) else None
    if not isinstance(data, str) or len(data) > 16384:
        raise ValueError("Missing message data.")
    try:
        payload = json.loads(base64.b64decode(data, validate=True))
    except (binascii.Error, ValueError):
        raise ValueError("Invalid message data.") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("packageName"), str):
        raise ValueError("Invalid notification.")
    package = payload["packageName"]
    subscription = payload.get("subscriptionNotification")
    if isinstance(subscription, dict):
        token = subscription.get("purchaseToken")
        kind = subscription.get("notificationType")
        return PlayNotification(
            package=package,
            purchase_token=token if isinstance(token, str) else None,
            notification_type=kind if isinstance(kind, int) else None,
            voided=False,
        )
    voided = payload.get("voidedPurchaseNotification")
    if isinstance(voided, dict) and voided.get("productType") in {1, None}:
        # productType 1 = subscription; one-time products are not sold.
        token = voided.get("purchaseToken")
        return PlayNotification(
            package=package,
            purchase_token=token if isinstance(token, str) else None,
            notification_type=None,
            voided=True,
        )
    return None


def _grant_for(session: Session, reference: str) -> EntitlementGrant | None:
    return session.execute(
        select(EntitlementGrant)
        .where(
            EntitlementGrant.source_type == StoreChannel.GOOGLE_PLAY.value,
            EntitlementGrant.external_reference == reference,
        )
        .with_for_update()
    ).scalar_one_or_none()


def _revoke(session: Session, grant: EntitlementGrant, reason: str) -> None:
    entitlement_service.record_grant(
        session,
        space_id=grant.space_id,
        account_id=grant.account_id,
        source_type=grant.source_type,
        external_reference=grant.external_reference,
        source_event_at=clock.now(),
        status=EntitlementStatus.REVOKED,
        tier=EntitlementTier.PREMIUM,
        effective_from=grant.effective_from,
        effective_until=grant.effective_until,
        capabilities=grant.capabilities,
        metadata={**(grant.metadata_ or {}), "revocationReason": reason},
    )


def reconcile_notification(session: Session, notification: PlayNotification) -> None:
    """Fetch Google's current state for a notified purchase and record it.

    Notifications are triggers only: the grant follows ``subscriptionsv2``.
    Refunds (voided purchases) and revocations end access immediately.
    """
    settings = get_settings()
    if notification.package != settings.billing_google_play_package:
        logger.info("store_notification_ignored", extra={"code": "PLAY_PACKAGE_MISMATCH"})
        return
    token = notification.purchase_token
    if token is None:
        return
    from eimir.billing.google_play import SUBSCRIPTION_REVOKED, valid_purchase_token

    if not valid_purchase_token(token):
        return
    reference = token_reference(StoreChannel.GOOGLE_PLAY, token)
    existing = _grant_for(session, reference)
    if notification.voided or notification.notification_type == SUBSCRIPTION_REVOKED:
        if existing is not None:
            _revoke(session, existing, "voided" if notification.voided else "revoked")
        return

    adapter = google_play_adapter(settings)
    try:
        verified = adapter.verify(token)
    except StorePurchaseInvalidError:
        logger.info("store_notification_ignored", extra={"code": "PLAY_PURCHASE_UNKNOWN"})
        return
    observed_at = clock.now()
    if verified.status is None:
        return
    if existing is not None:
        _record(
            session,
            verified,
            space_id=existing.space_id,
            account_id=existing.account_id,
            observed_at=observed_at,
        )
    else:
        binding = (
            session.execute(
                select(StorePurchaseReference).where(
                    StorePurchaseReference.reference == verified.purchase_reference
                )
            ).scalar_one_or_none()
            if verified.purchase_reference is not None
            else None
        )
        if binding is None or binding.store != StoreChannel.GOOGLE_PLAY.value:
            # A purchase without eimir.'s reference cannot be assigned safely.
            logger.info("store_notification_ignored", extra={"code": "PLAY_PURCHASE_UNBOUND"})
            return
        _record(
            session,
            verified,
            space_id=binding.space_id,
            account_id=binding.account_id,
            observed_at=observed_at,
        )
    _acknowledge(adapter, token, verified)
