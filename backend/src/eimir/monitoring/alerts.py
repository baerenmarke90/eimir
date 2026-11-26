"""Mail alerts to ServerAdmins (ServerAdmin monitoring, #2317).

The operator's own Uptime Kuma already reports a dead server or a silent
worker. These alerts cover what it cannot see from outside: new failed jobs,
Spaces near their Cloud quota, a nearly full media disk, bursts of failed
email/push deliveries, and a missing backup on Cloud.

Each condition keeps one state row. A mail goes out when the condition becomes
active, and per condition at most once a day even if it flaps; the backup
notice goes out once only. Nothing is mailed on resolution. Failed jobs older
than the first evaluation (an upgrade) are never mailed. While alerts are switched off,
active conditions are marked as handled, so switching them on again does not
send a backlog. Mails name the condition and link to ServerAdmin; they carry
no names, addresses or content.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.attachments import quota as storage_quota
from eimir.config import Deployment, MediaStoreBackend, Settings, get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.mail import MailMessage
from eimir.mail import sender as mail_sender
from eimir.mail.service_mail import service_mail
from eimir.monitoring.models import MonitoringAlertState
from eimir.monitoring.status import DELIVERY_FAILURE_BURST, failed_deliveries_since

log = logging.getLogger(__name__)

JOB_KIND = "monitoring_alerts"
INTERVAL = timedelta(minutes=5)
REMINDER = timedelta(days=1)
PRESSURE_RATIO = 0.85
_LOCK_KEY = 8_150_518

CODES = (
    "failed_jobs",
    "space_quota_pressure",
    "disk_pressure",
    "delivery_failures",
    "backup_not_configured",
)
_ONE_TIME = {"backup_not_configured"}


def _newest_failure(session: Session) -> datetime | None:
    return session.execute(
        select(func.max(Job.finished_at)).where(Job.status == JobStatus.FAILED.value)
    ).scalar_one()


def _space_quota_pressure(session: Session, settings: Settings) -> bool:
    count, _ = storage_quota.spaces_near_quota(
        session, ratio=PRESSURE_RATIO, limit=1, settings=settings
    )
    return count > 0


def _disk_pressure(settings: Settings) -> bool:
    if settings.media_store is not MediaStoreBackend.LOCAL:
        return False
    try:
        usage = shutil.disk_usage(settings.media_root)
    except OSError:
        return False
    return usage.total > 0 and usage.used / usage.total >= PRESSURE_RATIO


def _recipients(session: Session, settings: Settings) -> list[tuple[str, str]]:
    allowed = [email.lower() for email in settings.server_admin_emails]
    if not allowed:
        return []
    rows = session.execute(
        select(AccountEmail.email, Account.locale)
        .join(Account, Account.id == AccountEmail.account_id)
        .where(
            Account.disabled_at.is_(None),
            AccountEmail.verified_at.is_not(None),
            func.lower(AccountEmail.email).in_(allowed),
        )
        .order_by(AccountEmail.email)
    ).all()
    return [(email, locale) for email, locale in rows]


def _state(session: Session, code: str) -> MonitoringAlertState:
    state = session.get(MonitoringAlertState, code)
    if state is None:
        state = MonitoringAlertState(code=code)
        session.add(state)
    return state


def _due(code: str, state: MonitoringAlertState, at: datetime) -> bool:
    if state.last_sent_at is None:
        return True
    if code in _ONE_TIME:
        return False
    return at - state.last_sent_at >= REMINDER


def run(
    session: Session,
    at: datetime,
    settings: Settings,
    *,
    send: Callable[[MailMessage], None],
) -> list[str]:
    """Evaluate every condition; mail what is due. Return the codes handled."""
    enabled = bool(administration.get_settings(session).monitoring_alerts_enabled)
    newest_failure = _newest_failure(session)
    failed_jobs_state = _state(session, "failed_jobs")
    if failed_jobs_state.high_water_mark is None and failed_jobs_state.last_sent_at is None:
        # First evaluation (fresh install or upgrade): only failures from the
        # last interval are new; older rows stay in the Jobs page.
        failed_jobs_state.high_water_mark = at - INTERVAL
    emails, pushes = failed_deliveries_since(session, at - timedelta(hours=1))
    active = {
        "failed_jobs": newest_failure is not None
        and newest_failure > failed_jobs_state.high_water_mark,
        "space_quota_pressure": _space_quota_pressure(session, settings),
        "disk_pressure": _disk_pressure(settings),
        "delivery_failures": max(emails, pushes) > DELIVERY_FAILURE_BURST,
        "backup_not_configured": settings.deployment is Deployment.CLOUD,
    }
    recipients = _recipients(session, settings) if enabled else []
    link = f"{settings.public_base_url.rstrip('/')}/server-admin?section=monitoring"
    handled: list[str] = []
    for code in CODES:
        state = _state(session, code)
        if not active[code]:
            state.active_since = None
            continue
        if state.active_since is None:
            state.active_since = at
        if not _due(code, state, at):
            continue
        state.last_sent_at = at
        if code == "failed_jobs" and newest_failure is not None:
            state.high_water_mark = newest_failure
        if not enabled:
            continue
        handled.append(code)
        for email, locale in recipients:
            try:
                send(service_mail(f"monitoring.{code}", to=email, locale=locale, url=link))
            except Exception:
                log.warning("monitoring alert could not be sent", extra={"alert": code})
    session.flush()
    return handled


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


def handle(session: Session, payload: dict[str, Any]) -> None:
    del payload
    sender = mail_sender()
    handled = run(session, now(), get_settings(), send=sender.send)
    if handled:
        log.info("monitoring alerts sent", extra={"alerts": handled})
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    (target or registry).register(JOB_KIND, handle)
