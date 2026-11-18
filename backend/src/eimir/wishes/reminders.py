"""Owner-only one-time scheduling for an open Wish."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, require_readable, require_readable_locked
from eimir.core import clock
from eimir.core.errors import ConflictError, ValidationError
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity import effects as account_effects
from eimir.jobs import queue
from eimir.jobs.errors import DeferredJobError
from eimir.outbox import service as outbox
from eimir.wishes.models import Wish, WishReminder, WishStatus

JOB_KIND = "wish-reminder"
MAX_LATENESS = timedelta(hours=24)


def _own_reminder(
    session: Session, context: AuthorizationContext, wish_id: UUID
) -> WishReminder | None:
    return session.scalar(
        select(WishReminder).where(
            WishReminder.space_id == context.space_id,
            WishReminder.wish_id == wish_id,
            WishReminder.account_id == context.account_id,
        )
    )


def get_own(session: Session, context: AuthorizationContext, wish_id: str) -> WishReminder | None:
    wish = require_readable(session, Wish, context, wish_id)
    if wish.status != WishStatus.OPEN.value:
        return None
    reminder = _own_reminder(session, context, wish.id)
    if reminder is None or reminder.fired_at is not None:
        return None
    return reminder


def set_own(
    session: Session, context: AuthorizationContext, wish_id: str, due_at: datetime
) -> WishReminder:
    wish = require_readable_locked(session, Wish, context, wish_id)
    if wish.status != WishStatus.OPEN.value:
        raise ConflictError("The Wish is no longer open.", "WISH_REMINDER_UNAVAILABLE")
    now = clock.now()
    if due_at <= now:
        raise ValidationError("Choose a time in the future.", "WISH_REMINDER_TIME_INVALID")
    reminder = _own_reminder(session, context, wish.id)
    if reminder is not None:
        if reminder.due_at == due_at and reminder.fired_at is None:
            return reminder
        session.delete(reminder)
        session.flush()
    reminder = WishReminder(
        id=new_id(),
        space_id=context.space_id,
        wish_id=wish.id,
        account_id=context.account_id,
        due_at=due_at,
    )
    session.add(reminder)
    queue.enqueue(session, JOB_KIND, {"reminderId": str(reminder.id)}, delay=due_at - now)
    return reminder


def clear_own(session: Session, context: AuthorizationContext, wish_id: str) -> None:
    wish = require_readable_locked(session, Wish, context, wish_id)
    reminder = _own_reminder(session, context, wish.id)
    if reminder is not None:
        session.delete(reminder)


def cancel_for_wish(session: Session, wish_id: UUID) -> None:
    session.execute(delete(WishReminder).where(WishReminder.wish_id == wish_id))


def purge_member(session: Session, *, account_id: UUID, space_id: UUID) -> None:
    session.execute(
        delete(WishReminder).where(
            WishReminder.account_id == account_id,
            WishReminder.space_id == space_id,
        )
    )


def lock_delivery_source(session: Session, wish_id: UUID, reminder_id: UUID) -> bool:
    """Order the push handoff against replacement and Wish lifecycle writes."""
    current = session.scalar(
        select(Wish.id)
        .where(Wish.id == wish_id, Wish.status == WishStatus.OPEN.value)
        .with_for_update(read=True)
    )
    if current is None:
        return False
    return (
        session.scalar(
            select(WishReminder.id)
            .where(WishReminder.id == reminder_id, WishReminder.wish_id == wish_id)
            .with_for_update(read=True)
        )
        is not None
    )


def handle_due(session: Session, payload: dict[str, Any]) -> None:
    raw_id = payload.get("reminderId")
    if not isinstance(raw_id, str):
        return
    try:
        reminder_id = UUID(raw_id)
    except ValueError:
        return
    snapshot = session.get(WishReminder, reminder_id)
    if snapshot is None or snapshot.fired_at is not None:
        return
    if account_effects.lock_enabled_accounts(session, {snapshot.account_id}) is None:
        return
    if not account_effects.has_active_membership(
        session, account_id=snapshot.account_id, space_id=snapshot.space_id
    ):
        return
    # API scheduling and Wish lifecycle also lock Wish before schedule mutation.
    wish = session.scalar(select(Wish).where(Wish.id == snapshot.wish_id).with_for_update())
    reminder = session.get(WishReminder, reminder_id, populate_existing=True)
    if (
        wish is None
        or wish.status != WishStatus.OPEN.value
        or reminder is None
        or reminder.fired_at is not None
    ):
        return
    now = clock.now()
    if reminder.due_at > now:
        raise DeferredJobError(reminder.due_at)
    if now >= reminder.due_at + MAX_LATENESS:
        session.delete(reminder)
        return
    reminder.fired_at = now
    outbox.record(
        session,
        DomainEvent(
            type=EventType.WISH_REMINDER_DUE,
            space_id=reminder.space_id,
            subject_type="wish",
            subject_id=wish.id,
            payload=PublicEventPayload(
                recipient_id=reminder.account_id,
                occurrence_id=reminder.id,
                due_at=reminder.due_at,
            ),
        ),
    )
