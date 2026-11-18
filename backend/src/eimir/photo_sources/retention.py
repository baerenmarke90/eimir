"""Recover cleanup if an individual expiry job exhausted its retry budget."""

from datetime import timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.db.locks import lock_subject
from eimir.identity.models import DeviceSession
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import registry
from eimir.photo_sources.models import PhotoSelection
from eimir.photo_sources.service import EXPIRE_JOB, expire, remove

KIND = "photo_selection_cleanup"
INTERVAL = timedelta(minutes=5)


def _pending(session: Session, *, running: bool) -> bool:
    states = [JobStatus.PENDING.value]
    if running:
        states.append(JobStatus.RUNNING.value)
    return (
        session.scalar(select(Job.id).where(Job.kind == KIND, Job.status.in_(states)).limit(1))
        is not None
    )


def ensure_scheduled(session: Session) -> None:
    lock_subject(session, KIND, "periodic")
    if not _pending(session, running=True):
        queue.enqueue(session, KIND)


def cleanup(session: Session, payload: dict[str, Any]) -> None:
    del payload
    rows = session.scalars(
        select(PhotoSelection)
        .join(DeviceSession, DeviceSession.id == PhotoSelection.device_session_id)
        .where(
            or_(
                PhotoSelection.expires_at <= now(),
                DeviceSession.revoked_at.is_not(None),
                DeviceSession.expires_at <= now(),
                DeviceSession.absolute_expires_at <= now(),
            )
        )
        .order_by(PhotoSelection.expires_at)
        .limit(5)
        .with_for_update(skip_locked=True, of=PhotoSelection)
    ).all()
    for row in rows:
        remove(session, row)
    lock_subject(session, KIND, "periodic")
    if not _pending(session, running=False):
        queue.enqueue(session, KIND, delay=INTERVAL)


def register_handlers() -> None:
    for kind, handler in [(KIND, cleanup), (EXPIRE_JOB, expire)]:
        if registry.get(kind) is None:
            registry.register(kind, handler)
