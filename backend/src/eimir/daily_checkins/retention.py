"""Bounded Daily Check-in minimization on the existing PostgreSQL Job queue."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Date, case, cast, func, literal, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.daily_checkins.models import DailyCheckIn
from eimir.entitlements.models import Capability
from eimir.entitlements.service import has_capability
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.relationship.models import SpaceConfiguration

log = logging.getLogger(__name__)

JOB_KIND = "daily_check_in_retention"
SCAN_INTERVAL = timedelta(hours=6)
# Spaces that hold ``daily.insights`` keep this many Space days, today
# included: the server cap of the insights read (ADR 0007 amendment, #2169).
INSIGHTS_HISTORY_DAYS = 90
BATCH_SIZE = 100
_LOCK_KEY = 8_150_432


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.kind == JOB_KIND,
                Job.status.in_([status.value for status in statuses]),
            )
        ).scalar_one()
    )


def _schedule_lock(session: Session) -> None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    _schedule_lock(session)
    if _open_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay)


def schedule_next(session: Session, *, delay: timedelta | None = None) -> Job | None:
    _schedule_lock(session)
    if _open_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay or SCAN_INTERVAL)


def _history_spaces(session: Session, candidates: list[UUID], instant: datetime) -> list[UUID]:
    """Spaces whose current entitlement extends retention for Pro insights."""
    return [
        space_id
        for space_id in candidates
        if has_capability(session, space_id, Capability.DAILY_INSIGHTS, at=instant)
    ]


def purge_expired(
    session: Session,
    *,
    current_time: datetime | None = None,
    limit: int = BATCH_SIZE,
) -> int:
    """Delete at most ``limit`` rows outside their Space's retention window.

    The window ends before the previous authoritative Space day. A Space whose
    current entitlement holds ``daily.insights`` keeps ``INSIGHTS_HISTORY_DAYS``
    Space days instead (ADR 0007 amendment, #2169). The capability is
    re-evaluated on every run, so an ended entitlement returns the Space to the
    two-day window on the next run.

    ``daily_context_timezone`` is validated at the configuration write boundary.
    PostgreSQL therefore evaluates each candidate in that persisted IANA zone;
    no account/device timezone participates. Rows are locked with SKIP LOCKED so
    retention never waits on another owner of an otherwise eligible row.
    """
    instant = current_time or now()
    local_day = cast(
        func.timezone(SpaceConfiguration.daily_context_timezone, instant),
        Date,
    )
    previous_local_day = local_day - 1
    candidates = list(
        session.execute(
            select(DailyCheckIn.space_id)
            .join(
                SpaceConfiguration,
                SpaceConfiguration.space_id == DailyCheckIn.space_id,
            )
            .where(
                SpaceConfiguration.daily_context_timezone.is_not(None),
                DailyCheckIn.checked_on < previous_local_day,
            )
            .distinct()
        ).scalars()
    )
    history = _history_spaces(session, candidates, instant)
    cutoff = (
        case(
            (
                DailyCheckIn.space_id.in_(history),
                local_day - literal(INSIGHTS_HISTORY_DAYS - 1),
            ),
            else_=previous_local_day,
        )
        if history
        else previous_local_day
    )
    expired = list(
        session.execute(
            select(DailyCheckIn)
            .join(
                SpaceConfiguration,
                SpaceConfiguration.space_id == DailyCheckIn.space_id,
            )
            .where(
                SpaceConfiguration.daily_context_timezone.is_not(None),
                DailyCheckIn.checked_on < cutoff,
            )
            .order_by(DailyCheckIn.checked_on, DailyCheckIn.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        ).scalars()
    )
    for check_in in expired:
        session.delete(check_in)
    if expired:
        session.flush()
    return len(expired)


def handle_retention(session: Session, payload: dict[str, Any]) -> None:
    del payload
    removed = purge_expired(session)
    log.info("daily check-in retention completed", extra={"rows_removed": removed})
    schedule_next(
        session,
        delay=timedelta(seconds=1) if removed == BATCH_SIZE else SCAN_INTERVAL,
    )


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_retention)
