"""Hourly operational history (ServerAdmin monitoring, #2317).

A self-scheduling job in the existing queue (pattern of
``daily_checkins/retention.py``) turns the per-minute request rows and the
operational tables into one row per hour, kept for 90 days. It also prunes
the minute rows and the heartbeats of processes that no longer exist.
"""

from __future__ import annotations

import logging
import math
import shutil
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, distinct, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import MediaStoreBackend, Settings, get_settings
from eimir.core.clock import now
from eimir.engagement.models import (
    EmailDelivery,
    EmailDeliveryStatus,
    PushDelivery,
    PushDeliveryStatus,
)
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.monitoring import heartbeat
from eimir.monitoring.models import OperationalMetricHour, RequestMetricMinute
from eimir.monitoring.requests import LATENCY_BUCKETS_MS
from eimir.relationship.models import Membership, MembershipStatus

log = logging.getLogger(__name__)

JOB_KIND = "monitoring_history"
INTERVAL = timedelta(hours=1)
MINUTE_RETENTION = timedelta(hours=48)
HOUR_RETENTION = timedelta(days=90)
_LOCK_KEY = 8_150_517


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
    return queue.enqueue(session, JOB_KIND, delay=delay or INTERVAL)


def _p95(buckets: list[int]) -> int | None:
    total = sum(buckets)
    if total == 0:
        return None
    rank = math.ceil(total * 0.95)
    seen = 0
    for index, count in enumerate(buckets):
        seen += count
        if seen >= rank:
            return LATENCY_BUCKETS_MS[min(index, len(LATENCY_BUCKETS_MS) - 1)]
    return LATENCY_BUCKETS_MS[-1]


def _count(session: Session, statement: Any) -> int:
    return int(session.execute(statement).scalar_one() or 0)


def snapshot_hour(session: Session, hour: datetime, settings: Settings) -> OperationalMetricHour:
    """Write (or rewrite) the history row of the hour starting at ``hour``."""
    start = hour.replace(minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=1)
    minutes = list(
        session.execute(
            select(RequestMetricMinute).where(
                RequestMetricMinute.minute >= start, RequestMetricMinute.minute < end
            )
        ).scalars()
    )
    buckets = [0] * (len(LATENCY_BUCKETS_MS) + 1)
    for minute in minutes:
        for index, value in enumerate(minute.latency_buckets):
            buckets[index] += int(value)

    disk_used: int | None = None
    disk_total: int | None = None
    if settings.media_store is MediaStoreBackend.LOCAL:
        try:
            usage = shutil.disk_usage(settings.media_root)
            disk_used, disk_total = usage.used, usage.total
        except OSError:
            log.warning("media filesystem usage unavailable")

    values = {
        "hour": start,
        "requests": sum(minute.requests for minute in minutes),
        "server_errors": sum(minute.server_errors for minute in minutes),
        "p95_ms": _p95(buckets),
        "new_accounts": _count(
            session,
            select(func.count())
            .select_from(Account)
            .where(Account.created_at >= start, Account.created_at < end),
        ),
        "active_spaces": _count(
            session,
            select(func.count(distinct(Membership.space_id))).where(
                Membership.status == MembershipStatus.ACTIVE.value
            ),
        ),
        "stored_bytes": _count(
            session,
            select(func.coalesce(func.sum(Attachment.size), 0)).where(
                Attachment.status == AttachmentStatus.READY.value
            ),
        ),
        "disk_used_bytes": disk_used,
        "disk_total_bytes": disk_total,
        "failed_jobs": _count(
            session,
            select(func.count())
            .select_from(Job)
            .where(
                Job.status == JobStatus.FAILED.value,
                Job.finished_at >= start,
                Job.finished_at < end,
            ),
        ),
        "failed_emails": _count(
            session,
            select(func.count())
            .select_from(EmailDelivery)
            .where(
                EmailDelivery.status == EmailDeliveryStatus.FAILED.value,
                EmailDelivery.finished_at >= start,
                EmailDelivery.finished_at < end,
            ),
        ),
        "failed_pushes": _count(
            session,
            select(func.count())
            .select_from(PushDelivery)
            .where(
                PushDelivery.status == PushDeliveryStatus.FAILED.value,
                PushDelivery.finished_at >= start,
                PushDelivery.finished_at < end,
            ),
        ),
    }
    statement = insert(OperationalMetricHour).values(**values)
    session.execute(
        statement.on_conflict_do_update(
            index_elements=[OperationalMetricHour.hour],
            set_={key: statement.excluded[key] for key in values if key != "hour"},
        )
    )
    session.flush()
    row = session.get(OperationalMetricHour, start, populate_existing=True)
    assert row is not None
    return row


def prune(session: Session, at: datetime) -> None:
    """Drop minute rows after 48 hours, hour rows after 90 days, old heartbeats."""
    session.execute(
        delete(RequestMetricMinute).where(RequestMetricMinute.minute < at - MINUTE_RETENTION)
    )
    session.execute(
        delete(OperationalMetricHour).where(OperationalMetricHour.hour < at - HOUR_RETENTION)
    )
    heartbeat.prune(session, at)


def handle(session: Session, payload: dict[str, Any]) -> None:
    del payload
    at = now()
    settings = get_settings()
    # The finished hour, and the running one so the page is never an hour behind.
    current = at.replace(minute=0, second=0, microsecond=0)
    snapshot_hour(session, current - timedelta(hours=1), settings)
    snapshot_hour(session, current, settings)
    prune(session, at)
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    (target or registry).register(JOB_KIND, handle)
