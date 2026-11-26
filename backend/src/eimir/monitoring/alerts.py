"""Mail and push alerts to ServerAdmins (monitoring, #2317; admin push, #2314).

The operator's own Uptime Kuma already reports a dead server or a silent
worker. These alerts cover what it cannot see from outside: new failed jobs,
Spaces near their Cloud quota, a nearly full media disk, bursts of failed
email/push deliveries, a missing backup on Cloud, and new support reports
while the operator plugin can triage them.

Each condition keeps one state row. An alert goes out when the condition
becomes active, and per condition at most once a day even if it flaps; the
backup notice goes out once only. Nothing is sent on resolution. Failed jobs
and support reports older than the first evaluation (an upgrade) are never
sent. Two instance switches choose the channels: alert mails and alert push.
The state is shared, so one activation is one mail and one push. While both
switches are off, active conditions are marked as handled, so switching them
on again does not send a backlog. Alerts name the condition and link to
ServerAdmin; they carry no names, addresses or content.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.attachments import quota as storage_quota
from eimir.config import Deployment, MediaStoreBackend, Settings, get_settings
from eimir.core.clock import now
from eimir.entitlements.models import Capability
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.mail import MailMessage, MailUnavailableError
from eimir.mail import sender as mail_sender
from eimir.mail.service_mail import service_mail
from eimir.monitoring import operator_push
from eimir.monitoring.models import MonitoringAlertState
from eimir.monitoring.status import DELIVERY_FAILURE_BURST, failed_deliveries_since
from eimir.plugins.loader import loaded_plugins
from eimir.support_reports.models import SupportReport, SupportReportState

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
    "support_reports",
)
_ONE_TIME = {"backup_not_configured"}
# Conditions about new rows: only rows newer than the high-water mark count.
_WATERMARKED = ("failed_jobs", "support_reports")


def _newest_failure(session: Session) -> datetime | None:
    return session.execute(
        select(func.max(Job.finished_at)).where(Job.status == JobStatus.FAILED.value)
    ).scalar_one()


def _newest_new_report(session: Session) -> datetime | None:
    return session.execute(
        select(func.max(SupportReport.created_at)).where(
            SupportReport.state == SupportReportState.NEW.value,
            SupportReport.archived_at.is_(None),
        )
    ).scalar_one()


def _support_operator_available(settings: Settings) -> bool:
    """Reports are collected and the operator plugin can triage them."""
    return (
        settings.support_reports_enabled
        and Capability.SUPPORT_OPERATOR.value in loaded_plugins().capabilities()
    )


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


@dataclass(frozen=True)
class PlannedMail:
    """One alert mail decided by :func:`evaluate`, sent only after its commit."""

    code: str
    to: str
    locale: str
    url: str


def evaluate(
    session: Session, at: datetime, settings: Settings
) -> tuple[list[str], list[PlannedMail]]:
    """Mark what is due as sent, queue its push and return the mails to send.

    The caller commits before sending: a failure after the mails went out must
    never roll back the "sent" mark, or every retry would send them again.
    """
    switches = administration.get_settings(session)
    mail_enabled = bool(switches.monitoring_alerts_enabled)
    push_enabled = bool(switches.monitoring_push_enabled)
    newest = {
        "failed_jobs": _newest_failure(session),
        "support_reports": (
            _newest_new_report(session) if _support_operator_available(settings) else None
        ),
    }
    seen: dict[str, datetime] = {}
    for code in _WATERMARKED:
        state = _state(session, code)
        if state.high_water_mark is None and state.last_sent_at is None:
            # First evaluation (fresh install or upgrade): only rows from the
            # last interval are new; older ones stay on their ServerAdmin page.
            state.high_water_mark = at - INTERVAL
        seen[code] = state.high_water_mark or at - INTERVAL
    emails, pushes = failed_deliveries_since(session, at - timedelta(hours=1))
    active = {
        **{
            code: newest[code] is not None and newest[code] > seen[code]  # type: ignore[operator]
            for code in _WATERMARKED
        },
        "space_quota_pressure": _space_quota_pressure(session, settings),
        "disk_pressure": _disk_pressure(settings),
        "delivery_failures": max(emails, pushes) > DELIVERY_FAILURE_BURST,
        "backup_not_configured": settings.deployment is Deployment.CLOUD,
    }
    enabled = mail_enabled or push_enabled
    recipients = operator_push.recipients(session, settings) if enabled else []
    base = settings.public_base_url.rstrip("/")
    handled: list[str] = []
    mails: list[PlannedMail] = []
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
        if code in newest and newest[code] is not None:
            state.high_water_mark = newest[code]
        if not enabled:
            continue
        handled.append(code)
        if mail_enabled:
            link = base + (
                operator_push.route(code)
                if code == "support_reports"
                else "/server-admin?section=monitoring"
            )
            mails.extend(
                PlannedMail(code=code, to=recipient.email, locale=recipient.locale, url=link)
                for recipient in recipients
            )
        if push_enabled:
            operator_push.notify(
                session,
                topic=code,
                at=at,
                recipients=[recipient.account_id for recipient in recipients],
            )
    operator_push.prune(session, at=at)
    session.flush()
    return handled, mails


def send_mails(mails: list[PlannedMail], send: Callable[[MailMessage], None]) -> None:
    """Send planned alert mails; one failed mail never stops the others."""
    for mail in mails:
        try:
            send(
                service_mail(
                    f"monitoring.{mail.code}", to=mail.to, locale=mail.locale, url=mail.url
                )
            )
        except Exception:
            log.warning("monitoring alert could not be sent", extra={"alert": mail.code})


def run(
    session: Session,
    at: datetime,
    settings: Settings,
    *,
    send: Callable[[MailMessage], None],
) -> list[str]:
    """Evaluate every condition and send its mails at once. Return the codes handled.

    The job itself never uses this: it commits the evaluation first (see
    :func:`prepare`), then sends.
    """
    handled, mails = evaluate(session, at, settings)
    send_mails(mails, send)
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


def prepare(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Commit the evaluation before any mail leaves (the worker's preparation step).

    The planned mails travel to :func:`handle` in memory only; they are never
    stored in the job. A retry evaluates again and finds them already sent.
    """
    del payload
    handled, mails = evaluate(session, now(), get_settings())
    return {"handled": handled, "mails": mails}


def handle(session: Session, payload: dict[str, Any]) -> None:
    mails: list[PlannedMail] = payload.get("mails", [])
    if mails:
        try:
            sender = mail_sender()
        except MailUnavailableError:
            # An instance without mail still pushes and keeps evaluating.
            log.warning("monitoring alert mails need a mail transport")
        else:
            send_mails(mails, sender.send)
    handled = payload.get("handled", [])
    if handled:
        log.info("monitoring alerts sent", extra={"alerts": handled})
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    (target or registry).register(JOB_KIND, handle, prepare=prepare)
