"""Durable at-most-once handoff for optional adaptive PushDelivery records."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.ids import new_id
from eimir.engagement import gentle
from eimir.engagement.models import (
    GentleOccasion,
    GentleProfile,
    Notification,
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
)
from eimir.identity import effects


def prepare(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Claim once durably; a crash after this point must never resubmit blindly."""
    try:
        identifier = UUID(str(payload.get("deliveryId")))
    except ValueError:
        return payload
    pair = session.execute(
        select(PushDelivery, Notification)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(PushDelivery.id == identifier)
    ).first()
    if pair is None or pair[1].kind != gentle.KIND:
        return payload
    delivery, notification = pair
    accounts = effects.lock_enabled_accounts(session, {notification.recipient_account_id})
    occasion = session.scalar(
        select(GentleOccasion).where(GentleOccasion.notification_id == notification.id)
    )
    if accounts is None or occasion is None:
        return payload
    account = accounts[notification.recipient_account_id]
    session.refresh(delivery)
    profile = session.get(GentleProfile, account.id)
    endpoint = session.get(PushEndpoint, delivery.push_endpoint_id)
    at = clock.now()
    from eimir.engagement import push

    if (
        delivery.status not in gentle.PENDING_PUSH
        or occasion.attempted_at is not None
        or occasion.cancelled_at
        or occasion.dismissed_at
        or occasion.opened_at
        or occasion.expires_at <= at
        or profile is None
        or endpoint is None
        or endpoint.disabled_at is not None
        or not push.supports_targeted_delivery(session, endpoint)
        or gentle.eligible_window(session, account, profile, at=at, occasion=occasion) is None
    ):
        return payload
    context = AuthorizationContext(account_id=account.id, space_id=occasion.space_id)
    if occasion.kind == "MEMORY" and (
        occasion.memory_id is None
        or not gentle.source_available(
            session, context, occasion.memory_id, at=at, own_occasion=occasion.id
        )
    ):
        return payload
    token = new_id()
    occasion.attempted_at = at
    occasion.submission_token = token
    profile.attempts_since_use += 1
    profile.last_attempt_at = at
    session.flush()
    return {**payload, "gentleSubmissionToken": str(token)}


def admitted(session: Session, notification: Notification, payload: dict[str, Any]) -> bool:
    occasion = session.scalar(
        select(GentleOccasion).where(
            GentleOccasion.notification_id == notification.id,
            GentleOccasion.account_id == notification.recipient_account_id,
        )
    )
    if occasion is None or not occasion.submission_token:
        return False
    if payload.get("gentleSubmissionToken") != str(occasion.submission_token):
        return False
    from eimir.identity.models import Account

    account = session.get(Account, notification.recipient_account_id)
    profile = session.get(GentleProfile, notification.recipient_account_id)
    at = clock.now()
    if (
        account is None
        or profile is None
        or occasion.cancelled_at
        or occasion.dismissed_at
        or occasion.opened_at
        or occasion.expires_at <= at
        or gentle.eligible_window(session, account, profile, at=at, occasion=occasion) is None
    ):
        return False
    if occasion.kind == "MEMORY" and (
        occasion.memory_id is None
        or not gentle.source_available(
            session,
            AuthorizationContext(account_id=account.id, space_id=occasion.space_id),
            occasion.memory_id,
            at=at,
            own_occasion=occasion.id,
        )
    ):
        return False
    occasion.submission_token = None
    return True


def release_certain_non_delivery(session: Session, payload: dict[str, Any]) -> None:
    """An unavailable pre-provider handoff is not evidence of an ignored prompt."""
    if not payload.get("gentleSubmissionToken"):
        return
    identifier = UUID(str(payload["deliveryId"]))
    delivery = session.get(PushDelivery, identifier)
    if delivery is None or delivery.status != PushDeliveryStatus.UNAVAILABLE.value:
        return
    occasion = session.scalar(
        select(GentleOccasion).where(GentleOccasion.notification_id == delivery.notification_id)
    )
    if occasion is None:
        return
    attempted_at = occasion.attempted_at
    occasion.attempted_at = None
    occasion.submission_token = None
    occasion.cancelled_at = clock.now()
    session.flush()
    profile = session.get(GentleProfile, occasion.account_id)
    if profile is not None and profile.last_attempt_at == attempted_at:
        profile.last_attempt_at = session.scalar(
            select(func.max(GentleOccasion.attempted_at)).where(
                GentleOccasion.account_id == occasion.account_id,
            )
        )
        if profile.last_use_at == occasion.baseline_use_at:
            profile.attempts_since_use = max(0, profile.attempts_since_use - 1)
