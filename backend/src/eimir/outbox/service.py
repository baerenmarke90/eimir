"""Write events to the outbox and claim them for delivery."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.domain.events import DomainEvent
from eimir.outbox.models import OutboxEvent

MAX_ATTEMPTS = 20
"""Cap retries before a poison event is marked terminally failed instead of
retried forever, mirroring `jobs.queue`'s `max_attempts`/`JobStatus.FAILED`.
With the existing backoff capped at one hour (`_backoff_for`), twenty
consecutive failures span more than eleven hours. This leaves a substantial
transient-recovery window while ensuring a persistently broken projector
eventually surfaces to an operator instead of occupying a claim slot forever."""


def record(session: Session, event: DomainEvent) -> OutboxEvent:
    """Record an event for the current transaction.

    Deliberately does not commit: the event belongs in the same transaction as
    the domain mutation. Committing here would break that guarantee.
    """
    row = OutboxEvent(
        event_type=event.type.value,
        space_id=event.space_id,
        actor_id=event.actor_id,
        subject_type=event.subject_type,
        subject_id=event.subject_id,
        resource_version=event.resource_version,
        payload=event.payload,
    )
    session.add(row)
    return row


def claim_unprocessed(session: Session, limit: int = 50) -> Sequence[OutboxEvent]:
    """Claim unprocessed, currently-eligible events for delivery.

    `FOR UPDATE SKIP LOCKED` ensures two workers never claim the same row and
    neither waits for the other. Without it, delivery would either duplicate
    or the second worker would block.

    A row backed off by `mark_failed` (`next_attempt_at` in the future) is
    excluded rather than merely deprioritized: without this, a persistently
    failing event -- always the oldest unprocessed row -- would occupy a
    claim slot on every poll, starving newer events out of this batch once
    enough such rows accumulate. A terminally failed row (`failed_at` set)
    is excluded the same way, permanently: its retry budget is exhausted, so
    reclaiming it indefinitely would only repeat the same failure.
    """
    current_time = now()
    stmt = (
        select(OutboxEvent)
        .where(
            OutboxEvent.processed_at.is_(None),
            OutboxEvent.failed_at.is_(None),
            or_(
                OutboxEvent.next_attempt_at.is_(None),
                OutboxEvent.next_attempt_at <= current_time,
            ),
        )
        .order_by(OutboxEvent.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return session.execute(stmt).scalars().all()


def mark_processed(event: OutboxEvent) -> None:
    event.processed_at = now()
    event.last_error = None
    event.next_attempt_at = None


def mark_failed(event: OutboxEvent, error: str) -> bool:
    """Record a failed delivery attempt.

    While attempts remain, `processed_at` stays empty so the event is
    retried, but not before an exponential backoff elapses -- otherwise a
    persistently broken event would be reclaimed and retried at full speed on
    every poll forever. Once `MAX_ATTEMPTS` is exhausted, the event is marked
    terminally failed (`failed_at`) instead of retried forever, matching
    `jobs.queue.fail`'s terminal `JobStatus.FAILED`. The message is truncated
    so an excessively long error cannot make the row unbounded.

    Returns ``True`` when this call made the event terminally failed, so the
    caller can log/alert distinctly from an ordinary retry-scheduled failure.
    """
    event.attempts += 1
    event.last_error = error[:2000]
    if event.attempts >= MAX_ATTEMPTS:
        event.failed_at = now()
        event.next_attempt_at = None
        return True
    event.next_attempt_at = now() + _backoff_for(event.attempts)
    return False


def _backoff_for(attempts: int) -> timedelta:
    """Use exponential backoff capped at one hour, mirroring jobs.queue."""
    seconds = min(2 ** min(attempts, 12) * 5, 3600)
    return timedelta(seconds=seconds)
