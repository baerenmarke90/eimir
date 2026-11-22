"""Remove the retired good-days rhythm from stored recap editions (#2210).

Monthly and yearly recaps used to freeze the counts of days on which both
partners shared a good Vibe. The rhythm was removed together with Einblicke and
is no longer composed or served; this one-off job deletes the counts that older
editions still carry.

A migration cannot do this: the payload is protected and Alembic runs without
the encryption keys. The job runs in the worker, visits every edition once in
id order and stops for good after a pass that found nothing left. Each edition
is rewritten by a single guarded ``UPDATE`` (``version`` must be unchanged),
so a concurrent application write wins and is visited again by the next pass.
``version`` and ``updated_at`` are not touched: nobody changed the recap.

No function returns or logs content; reports contain counts only.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.orm import Session

from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.recaps.models import RecapEdition

log = logging.getLogger(__name__)

JOB_KIND = "recap_mood_purge"
BATCH_SIZE = 100
# After a pass that left an edition behind because it changed concurrently.
RETRY_INTERVAL = timedelta(hours=1)
_LOCK_KEY = 2_210_001


def _jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(Job.kind == JOB_KIND, Job.status.in_([s.value for s in statuses]))
        ).scalar_one()
    )


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    """Schedule the purge unless it is open or a pass already found nothing left."""
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))
    if _jobs(session, JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay)


def purge_batch(
    session: Session, *, after: UUID | None, limit: int = BATCH_SIZE
) -> tuple[int, int, UUID | None]:
    """Clear the rhythm of up to ``limit`` editions after ``after``.

    Returns ``(cleared, missed, last_id)``; ``last_id`` is None at the end.
    """
    statement = select(RecapEdition).order_by(RecapEdition.id).limit(limit)
    if after is not None:
        statement = statement.where(RecapEdition.id > after)
    editions = list(session.execute(statement).scalars())
    cleared = missed = 0
    for edition in editions:
        if edition.payload.mood is None:
            continue
        result = cast(
            "CursorResult[Any]",
            session.execute(
                update(RecapEdition)
                .where(RecapEdition.id == edition.id, RecapEdition.version == edition.version)
                .values(payload=edition.payload.model_copy(update={"mood": None}))
                .execution_options(synchronize_session=False)
            ),
        )
        if result.rowcount == 1:
            cleared += 1
        else:
            missed += 1
    session.expunge_all()
    last = editions[-1].id if len(editions) == limit else None
    return cleared, missed, last


def handle_purge(session: Session, payload: dict[str, Any]) -> None:
    after = UUID(payload["after"]) if payload.get("after") else None
    missed_so_far = int(payload.get("missed", 0))
    cleared, missed, last = purge_batch(session, after=after)
    missed_so_far += missed
    log.info("recap mood purge batch", extra={"cleared": cleared, "missed": missed})
    if last is not None:
        queue.enqueue(session, JOB_KIND, payload={"after": str(last), "missed": missed_so_far})
    elif missed_so_far:
        # Something changed concurrently: start one more full pass later.
        queue.enqueue(session, JOB_KIND, delay=RETRY_INTERVAL)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_purge)
