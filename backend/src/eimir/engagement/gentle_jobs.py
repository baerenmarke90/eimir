"""Bounded recurring eligibility checks in the existing PostgreSQL queue."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.engagement import gentle
from eimir.engagement.models import GentleOccasion, GentleProfile
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import registry

JOB_KIND = "gentle-prompts-reconcile"
BATCH_SIZE = 100
INTERVAL = timedelta(minutes=15)
LOCK_KEY = 8_150_228


def ensure_scheduled(
    session: Session, *, successor: bool = False, delay: timedelta | None = None
) -> None:
    session.execute(select(func.pg_advisory_xact_lock(LOCK_KEY)))
    states = (
        [JobStatus.PENDING.value]
        if successor
        else [JobStatus.PENDING.value, JobStatus.RUNNING.value]
    )
    if session.scalar(select(Job.id).where(Job.kind == JOB_KIND, Job.status.in_(states)).limit(1)):
        return
    queue.enqueue(session, JOB_KIND, delay=delay or (INTERVAL if successor else None))


def handle_reconcile(session: Session, payload: dict[str, Any]) -> None:
    del payload
    at = clock.now()
    identifiers = list(
        session.scalars(
            select(GentleProfile.account_id)
            .where(GentleProfile.next_check_at <= at)
            .order_by(GentleProfile.next_check_at, GentleProfile.account_id)
            .limit(BATCH_SIZE)
        )
    )
    for account_id in identifiers:
        gentle.reserve(session, account_id)
    expired = (
        select(GentleOccasion.id)
        .where(GentleOccasion.created_at < at - timedelta(days=120))
        .order_by(GentleOccasion.created_at, GentleOccasion.id)
        .limit(BATCH_SIZE)
    )
    session.execute(delete(GentleOccasion).where(GentleOccasion.id.in_(expired)))
    ensure_scheduled(
        session,
        successor=True,
        delay=timedelta(seconds=1) if len(identifiers) == BATCH_SIZE else INTERVAL,
    )


def register_handlers() -> None:
    if registry.get(JOB_KIND) is None:
        registry.register(JOB_KIND, handle_reconcile)
