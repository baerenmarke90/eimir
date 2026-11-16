"""Scheduled deletion of Herzversteck rounds and their photos on the Job queue."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.heart_hunt import service
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry

log = logging.getLogger(__name__)

JOB_KIND = "heart_hunt_retention"
SCAN_INTERVAL = timedelta(hours=1)
BATCH_SIZE = 100
_LOCK_KEY = 8_190_731


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(Job.kind == JOB_KIND, Job.status.in_([status.value for status in statuses]))
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


def handle_retention(session: Session, payload: dict[str, Any]) -> None:
    del payload
    removed = service.purge_due(session, limit=BATCH_SIZE)
    log.info("heart hunt retention completed", extra={"rows_removed": removed})
    schedule_next(session, delay=timedelta(seconds=1) if removed == BATCH_SIZE else SCAN_INTERVAL)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_retention)
