"""Enqueue and claim background jobs."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.ids import new_id
from eimir.jobs.models import Job, JobStatus
from eimir.observability import get_correlation_id

DEFAULT_LEASE = timedelta(minutes=5)


def enqueue(
    session: Session,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    delay: timedelta | None = None,
    max_attempts: int = 5,
) -> Job:
    """Enqueue a job.

    Deliberately does not commit: a job resulting from a domain mutation
    belongs in the same transaction as that mutation.

    Materialize the UUID before the first flush so callers can safely persist
    references to the job in the same unit of work.
    """
    job_payload = dict(payload or {})
    active_corr_id = get_correlation_id()
    if (
        active_corr_id
        and "_correlation_id" not in job_payload
        and "correlation_id" not in job_payload
    ):
        job_payload["_correlation_id"] = active_corr_id

    job = Job(
        id=new_id(),
        kind=kind,
        payload=job_payload,
        max_attempts=max_attempts,
        run_after=now() + delay if delay else now(),
    )
    session.add(job)
    return job


def claim(
    session: Session, worker: str, limit: int = 10, lease: timedelta = DEFAULT_LEASE
) -> Sequence[Job]:
    """Claim due jobs.

    `FOR UPDATE SKIP LOCKED` ensures concurrent workers claim disjoint sets
    without blocking one another.

    Also claim jobs still marked RUNNING whose lease has expired. Such a job
    belonged to a worker that died; without this branch it would remain stuck
    forever.
    """
    current_time = now()
    stmt = (
        select(Job)
        .where(
            Job.run_after <= current_time,
            or_(
                Job.status == JobStatus.PENDING.value,
                (Job.status == JobStatus.RUNNING.value) & (Job.locked_until < current_time),
            ),
        )
        .order_by(Job.run_after)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    jobs = session.execute(stmt).scalars().all()

    for job in jobs:
        job.status = JobStatus.RUNNING.value
        job.locked_by = worker
        job.locked_until = current_time + lease
        job.attempts += 1

    return jobs


def succeed(job: Job) -> None:
    job.status = JobStatus.SUCCEEDED.value
    job.finished_at = now()
    job.locked_until = None
    job.locked_by = None
    job.last_error = None


def defer(job: Job, *, until: datetime) -> None:
    """Return a claimed job to the queue without treating a hold as failure."""
    job.status = JobStatus.PENDING.value
    job.run_after = max(until, now() + timedelta(seconds=1))
    job.attempts = max(0, job.attempts - 1)
    job.locked_until = None
    job.locked_by = None
    job.last_error = None


def fail(job: Job, error: str, *, backoff: timedelta | None = None) -> None:
    """Record a failed attempt.

    While attempts remain, return the job to the queue with a delay so a
    persistently broken recipient is not retried every second. Once attempts
    are exhausted, retain the job as FAILED rather than silently discarding
    it.
    """
    job.last_error = error[:2000]
    job.locked_until = None
    job.locked_by = None

    if job.attempts >= job.max_attempts:
        job.status = JobStatus.FAILED.value
        job.finished_at = now()
        return

    job.status = JobStatus.PENDING.value
    job.run_after = now() + (backoff or _backoff_for(job.attempts))


def _backoff_for(attempts: int) -> timedelta:
    """Use exponential backoff capped at one hour."""
    seconds = min(2 ** min(attempts, 12) * 5, 3600)
    return timedelta(seconds=seconds)
