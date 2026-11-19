"""App-store purchase endpoints for the shared eimir. Pro paywall (#1525).

The client never decides Pro access: it starts a store purchase with an
opaque reference, hands the store's purchase token back, and then re-reads the
Space entitlement. Google Play is the connected channel; the App Store source
is prepared for the iOS launch and is not offered yet.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import Field

from eimir.api.deps import DbSession, Tenant
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.entitlements import SpaceEntitlementView
from eimir.billing import service as billing_service
from eimir.billing.models import StoreChannel, StorePlan
from eimir.billing.store import StoreProviderError
from eimir.config import get_settings
from eimir.core.errors import ServiceUnavailableError
from eimir.entitlements import service as entitlement_service

router = APIRouter(tags=["billing"])
logger = logging.getLogger(__name__)
_MAX_NOTIFICATION_BYTES = 32 * 1024


class StorePlanView(ApiModel):
    plan: StorePlan
    # Store identifier of the base plan (Google Play) the app opens.
    store_plan_id: str


class StoreChannelView(ApiModel):
    store: StoreChannel
    product_id: str
    plans: list[StorePlanView]
    # The store's own subscription management page for cancel and changes.
    manage_url: str


class BillingChannelsView(ApiModel):
    """Store channels this installation can fulfil; empty on Self-Hosted."""

    channels: list[StoreChannelView]


class StorePurchaseStartRequest(ApiModel):
    store: StoreChannel
    plan: StorePlan


class StorePurchaseStartView(ApiModel):
    # Opaque; the only identifier sent to the store with the purchase.
    purchase_reference: UUID
    product_id: str
    store_plan_id: str


class StorePurchaseSubmitRequest(ApiModel):
    purchase_token: str = Field(min_length=1, max_length=4096)
    # True when the app found the purchase through "restore", not a new sheet.
    restore: bool = False


class StorePurchaseResultView(ApiModel):
    outcome: Literal["confirmed", "restored", "pending", "expired"]
    entitlement: SpaceEntitlementView


def _channel_view(offer: billing_service.StoreOffer) -> StoreChannelView:
    return StoreChannelView(
        store=offer.store,
        product_id=offer.product_id,
        plans=[
            StorePlanView(plan=plan, store_plan_id=store_plan_id)
            for plan, store_plan_id in offer.plans.items()
        ],
        manage_url=offer.manage_url,
    )


@router.get(
    "/spaces/{spaceId}/billing/channels",
    response_model=BillingChannelsView,
    responses=problem_responses(401, 404),
)
def get_billing_channels(tenant: Tenant) -> BillingChannelsView:
    """List the purchase channels available for this Space's installation."""
    del tenant
    return BillingChannelsView(
        channels=[_channel_view(offer) for offer in billing_service.store_offers()]
    )


@router.post(
    "/spaces/{spaceId}/billing/purchases",
    response_model=StorePurchaseStartView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 404, 409),
)
def start_store_purchase(
    body: StorePurchaseStartRequest,
    tenant: Tenant,
    session: DbSession,
) -> StorePurchaseStartView:
    """Bind the purchasing Account and this Space before the store sheet opens.

    `409 BILLING_SPACE_ALREADY_PREMIUM` means Pro is already active for the
    Space, for example through the partner's subscription.
    """
    reference, offer = billing_service.start_purchase(
        session,
        account_id=tenant.account.id,
        space_id=tenant.space_id,
        store=body.store,
        plan=body.plan,
    )
    return StorePurchaseStartView(
        purchase_reference=reference.reference,
        product_id=offer.product_id,
        store_plan_id=offer.plans[body.plan],
    )


@router.post(
    "/spaces/{spaceId}/billing/google-play/purchases",
    response_model=StorePurchaseResultView,
    responses=problem_responses(401, 404, 409, 422, 503),
)
def submit_google_play_purchase(
    body: StorePurchaseSubmitRequest,
    tenant: Tenant,
    session: DbSession,
) -> StorePurchaseResultView:
    """Verify a Google Play purchase token with Google and update the Space.

    `pending` grants nothing until Google confirms the payment; the grant then
    follows from the real-time developer notification.
    """
    outcome = billing_service.submit_purchase(
        session,
        account_id=tenant.account.id,
        space_id=tenant.space_id,
        store=StoreChannel.GOOGLE_PLAY,
        purchase_token=body.purchase_token,
        restore=body.restore,
    )
    effective = entitlement_service.get_effective_space_entitlement(session, tenant.space_id)
    return StorePurchaseResultView(
        outcome=outcome.value,
        entitlement=SpaceEntitlementView(
            space_id=effective.space_id,
            tier=effective.tier,
            status=effective.status,
            effective_until=effective.effective_until,
            is_in_grace_period=effective.is_in_grace_period,
            capabilities=effective.capabilities,
        ),
    )


@router.post(
    "/billing/google-play/notifications",
    status_code=status.HTTP_204_NO_CONTENT,
    include_in_schema=False,
)
async def receive_google_play_notification(
    request: Request,
    session: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    """Pub/Sub push endpoint for Google Play real-time developer notifications.

    Unauthenticated requests get 401 and change nothing. Malformed or unrelated
    messages are acknowledged with 204 so Pub/Sub stops redelivering them; a
    temporarily unreachable Play API answers 503 so Pub/Sub retries.
    """
    from eimir.billing.google_play import verify_notification_auth

    settings = get_settings()
    # Authenticate before reading: certificate fetch and signature checks are
    # blocking, so they run off the event loop.
    if not settings.google_play_billing_configured or not await run_in_threadpool(
        verify_notification_auth, authorization, settings
    ):
        return Response(status_code=status.HTTP_401_UNAUTHORIZED)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > _MAX_NOTIFICATION_BYTES:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        notification = billing_service.parse_play_notification(json.loads(raw))
    except ValueError:
        logger.info("store_notification_ignored", extra={"code": "PLAY_NOTIFICATION_INVALID"})
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if notification is not None:
        try:
            await run_in_threadpool(billing_service.reconcile_notification, session, notification)
        except StoreProviderError as error:
            logger.warning("store_notification_deferred", extra={"code": error.code})
            raise ServiceUnavailableError(
                "The store cannot be reached right now.",
                billing_service.BillingErrorCode.STORE_UNAVAILABLE,
            ) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)
