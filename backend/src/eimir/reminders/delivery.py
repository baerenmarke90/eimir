"""M4-C -> M4-B projection for content-minimized Reminder due events."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.engagement import notification_preferences
from eimir.engagement.models import Notification, NotificationKind
from eimir.outbox.models import OutboxEvent
from eimir.relationship.models import Membership, MembershipStatus


def project_notification(session: Session, event: OutboxEvent) -> None:
    """Create exactly one recipient Notification for a valid due fact."""
    recipient_id = event.payload.recipient_id
    occurrence_id = event.payload.occurrence_id
    if recipient_id is None or occurrence_id is None:
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
            kind=NotificationKind.REMINDER_DUE.value,
            actor_id=None,
            target_type=None,
            target_id=None,
            created_at=event.created_at,
            in_app_visible=notification_preferences.in_app_enabled(
                session, account_id=recipient_id, kind=NotificationKind.REMINDER_DUE.value
            ),
        )
        .on_conflict_do_nothing(index_elements=["recipient_account_id", "source_event_id", "kind"])
    )
    session.execute(statement)
