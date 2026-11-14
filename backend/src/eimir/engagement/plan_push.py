"""Delivery rules for a new scheduled Plan and its standard start reminders."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind, PushDelivery
from eimir.identity.models import Account
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan
from eimir.reminders.models import Reminder
from eimir.reminders.rules import PLAN_START_RULE
from eimir.reminders.runtime_models import ReminderOccurrence

OVERLAP = timedelta(hours=24)


def short_term(session: Session, notice: Notification, account: Account) -> bool:
    plan = session.get(Plan, notice.target_id) if notice.target_id is not None else None
    if plan is None:
        return False
    zone = clock.resolve_zone(account.timezone)
    scheduled = (
        plan.planned_start.astimezone(zone).date() if plan.planned_start else plan.planned_on
    )
    created = notice.created_at.astimezone(zone).date()
    return scheduled is not None and created <= scheduled <= created + timedelta(days=1)


def schedule_is_current(session: Session, notice: Notification, account: Account) -> bool:
    plan = session.get(Plan, notice.target_id, populate_existing=True) if notice.target_id else None
    if plan is None or notice.expires_at is None:
        return False
    if plan.planned_start is not None:
        return plan.planned_start == notice.expires_at
    if plan.planned_on is None:
        return False
    actor = session.get(Account, notice.actor_id) if notice.actor_id else account
    zone = clock.resolve_zone(actor.timezone if actor else "UTC")
    return notice.expires_at.astimezone(zone).date() == plan.planned_on + timedelta(days=1)


def overlaps_attempted_delivery(
    session: Session, notice: Notification, delivery: PushDelivery
) -> bool:
    """Account locks already serialize the two handoffs on the same endpoint."""
    endpoint_notices = (
        select(Notification)
        .join(PushDelivery, PushDelivery.notification_id == Notification.id)
        .where(
            Notification.space_id == notice.space_id,
            Notification.recipient_account_id == notice.recipient_account_id,
            PushDelivery.push_endpoint_id == delivery.push_endpoint_id,
        )
    )
    if notice.kind == NotificationKind.PLAN_CREATED.value:
        return (
            notice.target_id is not None
            and notice.expires_at is not None
            and _attempted_start_reminder(
                session, endpoint_notices, notice.target_id, notice.expires_at, notice.created_at
            )
        )
    if (
        notice.kind != NotificationKind.REMINDER_DUE.value
        or notice.target_type != EngagementTarget.PLAN.value
        or notice.target_id is None
    ):
        return False
    event = session.get(OutboxEvent, notice.source_event_id)
    if (
        event is None
        or event.payload.rule_key != PLAN_START_RULE
        or not event.payload.occurrence_id
    ):
        return False
    occurrence = session.get(ReminderOccurrence, event.payload.occurrence_id)
    if occurrence is None:
        return False
    due_at = occurrence.due_at
    starts_at = due_at + timedelta(days=occurrence.days_before)
    creations = session.execute(
        endpoint_notices.with_only_columns(Notification.created_at, PushDelivery.attempts).where(
            Notification.kind == NotificationKind.PLAN_CREATED.value,
            Notification.target_id == notice.target_id,
            Notification.expires_at == starts_at,
            Notification.created_at.between(due_at - OVERLAP, due_at + OVERLAP),
        )
    )
    # The preparation reminder can win the race with creation. Apply the same
    # window to a subsequent start reminder even if creation never sent.
    plan_id = notice.target_id
    return any(
        attempts > 0
        or _attempted_start_reminder(session, endpoint_notices, plan_id, starts_at, created_at)
        for created_at, attempts in creations
    )


def _attempted_start_reminder(
    session: Session,
    endpoint_notices: Select[tuple[Notification]],
    plan_id: UUID,
    starts_at: datetime,
    created_at: datetime,
) -> bool:
    events = session.scalars(
        endpoint_notices.with_only_columns(OutboxEvent, maintain_column_froms=True)
        .join(OutboxEvent, OutboxEvent.id == Notification.source_event_id)
        .join(Reminder, Reminder.id == OutboxEvent.subject_id)
        .where(
            Notification.kind == NotificationKind.REMINDER_DUE.value,
            PushDelivery.attempts > 0,
            Reminder.rule_key == PLAN_START_RULE,
            Reminder.source_id == plan_id,
            # A due event may be created up to one day late during catch-up.
            Notification.created_at.between(created_at - OVERLAP, created_at + 2 * OVERLAP),
        )
    )
    for event in events:
        occurrence_id = event.payload.occurrence_id
        occurrence = session.get(ReminderOccurrence, occurrence_id) if occurrence_id else None
        if occurrence is not None and (
            occurrence.due_at + timedelta(days=occurrence.days_before) == starts_at
            and abs(occurrence.due_at - created_at) <= OVERLAP
        ):
            return True
    return False
