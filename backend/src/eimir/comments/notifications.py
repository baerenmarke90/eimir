"""Content-free notification hook for COMMENT_CREATED.

M2-S6 has no push provider. This boundary translates an outbox row into a
generic delivery request. The outbox ID is the stable idempotency key: if the
external send succeeds but the worker dies before `mark_processed`, the retry
receives exactly the same key.
"""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from eimir.domain.events import EventType
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent


class CommentNotificationSink(Protocol):
    def send_comment_notification(
        self,
        *,
        idempotency_key: str,
        recipient_id: UUID,
        target_type: str,
        target_id: UUID,
    ) -> None: ...


def deliver(event: OutboxEvent, sink: CommentNotificationSink) -> bool:
    """Deliver a comment notification when the row belongs to this consumer.

    Returning `False` means this is another event and was not handled by this
    consumer. Sink failures are deliberately not swallowed; the calling
    outbox worker then marks the row as failed and retries it later with the
    same event ID.
    """
    if event.event_type != EventType.COMMENT_CREATED.value:
        return False

    payload = event.payload
    if payload.recipient_id is None or payload.target_type is None or payload.target_id is None:
        raise ValueError("COMMENT_CREATED event is missing safe notification references")

    sink.send_comment_notification(
        idempotency_key=str(event.id),
        recipient_id=payload.recipient_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
    )
    outbox_service.mark_processed(event)
    return True
