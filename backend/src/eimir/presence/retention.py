"""Periodic presence minimization on the existing PostgreSQL Job queue.

Reads already ignore expired or unauthorized snapshots; this job removes them
and suspends shares of Spaces that lost the Premium capability, so restoring
the entitlement cannot silently reactivate sharing.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.dml import Delete

from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.presence import service
from eimir.presence.models import (
    PartnerLocationConsent,
    PresenceDeviceCredential,
    PresenceSnapshot,
    SharingLevel,
)
from eimir.relationship.models import Membership, MembershipStatus

log = logging.getLogger(__name__)

JOB_KIND = "presence_retention"
SCAN_INTERVAL = timedelta(minutes=15)
BATCH_SIZE = 200
_LOCK_KEY = 8_150_517


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(Job.kind == JOB_KIND, Job.status.in_([status.value for status in statuses]))
        ).scalar_one()
    )


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))
    if _open_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay)


def schedule_next(session: Session, *, delay: timedelta | None = None) -> Job | None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))
    if _open_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay or SCAN_INTERVAL)


def _deleted(session: Session, statement: Delete) -> int:
    result = cast("CursorResult[Any]", session.execute(statement))
    return int(result.rowcount or 0)


def _partner_of(session: Session, space_id: Any, account_id: Any) -> Any:
    return session.execute(
        select(Membership.account_id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.account_id != account_id,
        )
        .order_by(Membership.joined_at, Membership.id)
        .limit(1)
    ).scalar_one_or_none()


def purge(
    session: Session, *, current_time: datetime | None = None, limit: int = BATCH_SIZE
) -> int:
    """Delete unreadable snapshots and suspend unentitled shares; return rows touched."""
    at = current_time or now()
    touched = _deleted(session, delete(PresenceSnapshot).where(PresenceSnapshot.expires_at <= at))
    touched += _deleted(
        session,
        delete(PresenceDeviceCredential).where(PresenceDeviceCredential.expires_at <= at),
    )

    candidates = list(
        session.execute(
            select(PartnerLocationConsent)
            .where(
                PartnerLocationConsent.level != SharingLevel.OFF.value,
                PartnerLocationConsent.suspended_at.is_(None),
            )
            .order_by(PartnerLocationConsent.updated_at, PartnerLocationConsent.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        ).scalars()
    )
    unentitled: set[Any] = set()
    for consent in candidates:
        if consent.space_id in unentitled:
            continue
        if not entitlement_service.has_capability(
            session, consent.space_id, service.CAPABILITY, lock_grants=False
        ):
            unentitled.add(consent.space_id)
            touched += service.suspend_space(session, consent.space_id, at=at)
            continue
        partner_id = _partner_of(session, consent.space_id, consent.account_id)
        state = service.consent_state(consent, current_partner_id=partner_id, at=at)
        if state is not service.SharingState.ACTIVE:
            before = session.execute(
                select(func.count())
                .select_from(PresenceSnapshot)
                .where(
                    PresenceSnapshot.space_id == consent.space_id,
                    PresenceSnapshot.account_id == consent.account_id,
                )
            ).scalar_one()
            service.delete_owner_presence(session, consent.space_id, consent.account_id)
            touched += int(before)
    session.flush()
    return touched


def handle_retention(session: Session, payload: dict[str, Any]) -> None:
    del payload
    touched = purge(session)
    log.info("presence retention completed", extra={"rows_touched": touched})
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_retention)
