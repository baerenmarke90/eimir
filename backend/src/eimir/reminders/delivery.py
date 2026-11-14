"""M4-C -> M4-B projection for content-minimized Reminder due events."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.engagement import notification_preferences
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship.models import Membership, MembershipStatus
from eimir.reminders.models import Reminder, ReminderSource
from eimir.reminders.rules import PLAN_START_RULE


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

    reminder = session.get(Reminder, event.subject_id)
    target_type, target_id = None, None
    if reminder is not None and reminder.space_id == event.space_id:
        if reminder.source == ReminderSource.MANUAL.value:
            target_type, target_id = EngagementTarget.REMINDER.value, reminder.id
        elif reminder.rule_key == PLAN_START_RULE:
            plan = session.get(Plan, reminder.source_id) if reminder.source_id else None
            if plan is None or plan.status != PlanStatus.PLANNED.value:
                return
            # The start reminder may be the only external alert for a new Plan.
            target_type, target_id = EngagementTarget.PLAN.value, plan.id

    statement = (
        postgresql.insert(Notification)
        .values(
            space_id=event.space_id,
            recipient_account_id=recipient_id,
            source_event_id=event.id,
            kind=NotificationKind.REMINDER_DUE.value,
            actor_id=None,
            target_type=target_type,
            target_id=target_id,
            created_at=event.created_at,
            in_app_visible=notification_preferences.in_app_enabled(
                session, account_id=recipient_id, kind=NotificationKind.REMINDER_DUE.value
            ),
        )
        .on_conflict_do_nothing(index_elements=["recipient_account_id", "source_event_id", "kind"])
    )
    session.execute(statement)
