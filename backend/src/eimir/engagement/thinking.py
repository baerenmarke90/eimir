"""Content-free partner-signal commands using one notification/push pipeline."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import NotFoundError, RateLimitedError
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    SupportGestureKind,
    SupportGestureRequest,
    ThinkingOfYouRequest,
)
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from eimir.relationship import configuration as space_configuration
from eimir.relationship.models import Membership, MembershipStatus

COOLDOWN_SECONDS = 30 * 60
"""Product pacing decision (#790/#791), not merely a technical anti-spam
bound: 30 minutes between logical sends from the same sender/Space. Remains
Free/Core behavior, not a Premium quota."""

PARTNER_NOT_AVAILABLE = "PARTNER_NOT_AVAILABLE"
THINKING_OF_YOU_COOLDOWN = "THINKING_OF_YOU_COOLDOWN"
SUPPORT_GESTURE_COOLDOWN = "SUPPORT_GESTURE_COOLDOWN"
SUPPORT_GESTURE_COOLDOWN_SECONDS = COOLDOWN_SECONDS
"""Extended gestures use the same quiet product pacing as Thinking-of-You,
scoped per gesture kind so one deliberate gesture does not suppress a
different deliberate gesture."""

_SUPPORT_GESTURE_EVENT_TYPES = {
    SupportGestureKind.KISS: EventType.PARTNER_KISS,
    SupportGestureKind.CHECK_IN: EventType.PARTNER_CHECK_IN,
}
_SUPPORT_GESTURE_NOTIFICATION_KINDS = {
    EventType.PARTNER_KISS: NotificationKind.PARTNER_KISS,
    EventType.PARTNER_CHECK_IN: NotificationKind.PARTNER_CHECK_IN,
}


def _last_sent_at(
    session: Session,
    space_id: UUID,
    sender_account_id: UUID,
) -> datetime | None:
    return session.execute(
        select(ThinkingOfYouRequest.created_at)
        .where(
            ThinkingOfYouRequest.space_id == space_id,
            ThinkingOfYouRequest.sender_account_id == sender_account_id,
        )
        .order_by(ThinkingOfYouRequest.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def available_at(session: Session, context: AuthorizationContext) -> datetime | None:
    """The server-authoritative instant this caller may next send, or ``None``
    if a send is available right now.

    This is the read side of the same cooldown ``send`` enforces, exposed so
    a client can reflect the real state (e.g. on the Dashboard) without
    guessing from a local timer or waiting for a blocked request.
    """
    last_sent = _last_sent_at(session, context.space_id, context.account_id)
    if last_sent is None:
        return None
    cooldown_until = last_sent + timedelta(seconds=COOLDOWN_SECONDS)
    return cooldown_until if cooldown_until > clock.now() else None


def send(
    session: Session,
    context: AuthorizationContext,
    *,
    client_request_id: UUID,
) -> ThinkingOfYouRequest:
    """Accept one idempotent content-free partner nudge."""
    existing = _existing_request(session, context, client_request_id)
    if existing is not None:
        return existing

    # Serialize new signals for one sender/Space so concurrent request IDs
    # cannot both pass the rolling cooldown check.
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

    existing = _existing_request(session, context, client_request_id)
    if existing is not None:
        return existing

    # Configuration writes take the exclusive Space-row lock. Holding a shared
    # lock while admitting a gesture makes disable vs. send deterministic:
    # either this already-authorized send finishes first, or a committed
    # disable is observed before a new event/request is created.
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
    last_sent = _last_sent_at(session, context.space_id, context.account_id)
    if last_sent is not None:
        cooldown_until = last_sent + timedelta(seconds=COOLDOWN_SECONDS)
        if cooldown_until > current_time:
            retry_after = max(1, int((cooldown_until - current_time).total_seconds()))
            raise RateLimitedError(
                "Thinking-of-you is temporarily rate limited.",
                THINKING_OF_YOU_COOLDOWN,
                retry_after_seconds=retry_after,
            )

    request_id = new_id()
    event = outbox_service.record(
        session,
        DomainEvent(
            type=EventType.PARTNER_THINKING_OF_YOU,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="thinking_of_you",
            subject_id=request_id,
            payload=PublicEventPayload(recipient_id=recipient_id),
        ),
    )
    session.flush()

    request = ThinkingOfYouRequest(
        id=request_id,
        space_id=context.space_id,
        sender_account_id=context.account_id,
        recipient_account_id=recipient_id,
        client_request_id=client_request_id,
        source_event_id=event.id,
        created_at=current_time,
    )
    session.add(request)
    session.flush()
    return request


def project_notification(session: Session, event: OutboxEvent) -> None:
    """Project the Free/Core Thinking-of-You signal."""
    _project_partner_signal_notification(
        session,
        event,
        NotificationKind.THINKING_OF_YOU,
    )


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


def project_support_gesture_notification(
    session: Session,
    event: OutboxEvent,
) -> None:
    """Project an extended gesture through the same recipient pipeline."""
    try:
        event_type = EventType(event.event_type)
    except ValueError:
        return
    kind = _SUPPORT_GESTURE_NOTIFICATION_KINDS.get(event_type)
    if kind is None:
        return
    _project_partner_signal_notification(session, event, kind)


def _project_partner_signal_notification(
    session: Session,
    event: OutboxEvent,
    kind: NotificationKind,
) -> None:
    # Queued gesture effects re-check the authoritative Space switch. The
    # shared Space lock serializes projection with a concurrent disable;
    # disabling never deletes an already-persisted Notification.
    if not space_configuration.is_module_enabled(
        session,
        event.space_id,
        space_configuration.SpaceModule.SUPPORT_GESTURES,
        lock_space=True,
    ):
        return

    recipient_id = event.payload.recipient_id
    if recipient_id is None or recipient_id == event.actor_id:
        return

    active_recipient = session.execute(
        select(Membership.account_id).where(
            Membership.space_id == event.space_id,
            Membership.account_id == recipient_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one_or_none()
    if active_recipient is None:
        return

    statement = (
        postgresql.insert(Notification)
        .values(
            space_id=event.space_id,
            recipient_account_id=recipient_id,
            source_event_id=event.id,
            kind=kind.value,
            actor_id=event.actor_id,
            target_type=None,
            target_id=None,
            created_at=event.created_at,
        )
        .on_conflict_do_nothing(index_elements=["recipient_account_id", "source_event_id", "kind"])
    )
    session.execute(statement)


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


def _existing_request(
    session: Session,
    context: AuthorizationContext,
    client_request_id: UUID,
) -> ThinkingOfYouRequest | None:
    return session.execute(
        select(ThinkingOfYouRequest).where(
            ThinkingOfYouRequest.space_id == context.space_id,
            ThinkingOfYouRequest.sender_account_id == context.account_id,
            ThinkingOfYouRequest.client_request_id == client_request_id,
        )
    ).scalar_one_or_none()
