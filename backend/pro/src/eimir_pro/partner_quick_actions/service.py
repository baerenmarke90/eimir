"""The extended partner gesture command (``partner.quick_actions.extended``).

Plugin code (Decision 0017). Sending is Premium; the projection into the
partner's notifications, the Free "thinking of you" signal, the module switch
and the shared pacing constants stay Core in ``eimir.engagement.thinking``.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import NotFoundError, RateLimitedError
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement.models import SupportGestureKind
from eimir.engagement.thinking import (
    PARTNER_NOT_AVAILABLE,
    SUPPORT_GESTURE_COOLDOWN,
    SUPPORT_GESTURE_COOLDOWN_SECONDS,
)
from eimir.outbox import service as outbox_service
from eimir.relationship import configuration as space_configuration
from eimir.relationship.models import Membership, MembershipStatus
from eimir_pro.partner_quick_actions.models import SupportGestureRequest

_SUPPORT_GESTURE_EVENT_TYPES = {
    SupportGestureKind.KISS: EventType.PARTNER_KISS,
    SupportGestureKind.CHECK_IN: EventType.PARTNER_CHECK_IN,
}


def send_support_gesture(
    session: Session,
    context: AuthorizationContext,
    *,
    kind: SupportGestureKind,
    client_request_id: UUID,
) -> SupportGestureRequest:
    """Accept one idempotent Premium extended gesture.

    Commercial authorization is enforced by the API dependency before this
    domain command. This command remains authoritative for Space ownership,
    module configuration, recipient derivation, pacing and idempotency.
    """
    existing = _existing_support_gesture_request(session, context, kind, client_request_id)
    if existing is not None:
        return existing

    sender_membership = session.execute(
        select(Membership)
        .where(
            Membership.space_id == context.space_id,
            Membership.account_id == context.account_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if sender_membership is None:
        raise NotFoundError("Partner space not available.", PARTNER_NOT_AVAILABLE)

    existing = _existing_support_gesture_request(session, context, kind, client_request_id)
    if existing is not None:
        return existing

    space_configuration.require_module_enabled(
        session,
        context.space_id,
        space_configuration.SpaceModule.SUPPORT_GESTURES,
    )

    recipient_id = session.execute(
        select(Membership.account_id)
        .where(
            Membership.space_id == context.space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.account_id != context.account_id,
        )
        .order_by(Membership.account_id)
        .limit(1)
    ).scalar_one_or_none()
    if recipient_id is None:
        raise NotFoundError("Partner not available.", PARTNER_NOT_AVAILABLE)

    current_time = clock.now()
    last_sent = session.execute(
        select(SupportGestureRequest.created_at)
        .where(
            SupportGestureRequest.space_id == context.space_id,
            SupportGestureRequest.sender_account_id == context.account_id,
            SupportGestureRequest.kind == kind.value,
        )
        .order_by(SupportGestureRequest.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if last_sent is not None:
        cooldown_until = last_sent + timedelta(seconds=SUPPORT_GESTURE_COOLDOWN_SECONDS)
        if cooldown_until > current_time:
            retry_after = max(1, int((cooldown_until - current_time).total_seconds()))
            raise RateLimitedError(
                "Partner gesture is temporarily rate limited.",
                SUPPORT_GESTURE_COOLDOWN,
                retry_after_seconds=retry_after,
            )

    request_id = new_id()
    event = outbox_service.record(
        session,
        DomainEvent(
            type=_SUPPORT_GESTURE_EVENT_TYPES[kind],
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="support_gesture",
            subject_id=request_id,
            payload=PublicEventPayload(recipient_id=recipient_id),
        ),
    )
    session.flush()

    request = SupportGestureRequest(
        id=request_id,
        space_id=context.space_id,
        sender_account_id=context.account_id,
        recipient_account_id=recipient_id,
        kind=kind.value,
        client_request_id=client_request_id,
        source_event_id=event.id,
        created_at=current_time,
    )
    session.add(request)
    session.flush()
    return request


def _existing_support_gesture_request(
    session: Session,
    context: AuthorizationContext,
    kind: SupportGestureKind,
    client_request_id: UUID,
) -> SupportGestureRequest | None:
    return session.execute(
        select(SupportGestureRequest).where(
            SupportGestureRequest.space_id == context.space_id,
            SupportGestureRequest.sender_account_id == context.account_id,
            SupportGestureRequest.kind == kind.value,
            SupportGestureRequest.client_request_id == client_request_id,
        )
    ).scalar_one_or_none()
