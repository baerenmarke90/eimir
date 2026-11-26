"""The alert job through the real worker: a retry never repeats a sent alert."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from eimir.config import Deployment, MediaStoreBackend, get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail
from eimir.jobs import worker
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry
from eimir.mail import MailMessage
from eimir.monitoring import alerts
from eimir.monitoring.models import MonitoringAlertState
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def committed(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> Iterator[sessionmaker[Session]]:
    """Real commits, as the worker makes them; everything is removed afterwards."""
    from eimir.db import session as db_session

    maker = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(db_session, "get_sessionmaker", lambda: maker)
    created: list[object] = []

    def clear() -> None:
        with maker() as session:
            session.execute(delete(Job))
            session.execute(delete(MonitoringAlertState))
            for account_id in created:
                session.execute(delete(Account).where(Account.id == account_id))
            session.commit()

    clear()
    maker.created = created  # type: ignore[attr-defined]
    yield maker
    clear()


def test_a_failure_after_sending_does_not_send_the_alert_again(committed, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(
        update={
            "deployment": Deployment.CLOUD,
            "media_store": MediaStoreBackend.S3,
            "server_admin_emails": [ADMIN_EMAIL],
            "public_base_url": "https://eimir.example.test",
        }
    )
    monkeypatch.setattr(alerts, "get_settings", lambda: settings)
    outbox: list[MailMessage] = []

    class Sender:
        def send(self, message: MailMessage) -> None:
            outbox.append(message)

    monkeypatch.setattr(alerts, "mail_sender", lambda: Sender())
    with committed() as session:
        account = make_account(session, "Operator")
        session.add(
            AccountEmail(
                account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now()
            )
        )
        committed.created.append(account.id)
        alerts.ensure_scheduled(session)
        session.commit()

    # Any failure after the mail went out (here: scheduling the next run) used
    # to roll the "sent" mark back, so every retry mailed the alert again.
    calls = {"count": 0}
    original = alerts.schedule_next

    def failing_once(session: Session, **kwargs):  # type: ignore[no-untyped-def]
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("scheduling failed")
        return original(session, **kwargs)

    monkeypatch.setattr(alerts, "schedule_next", failing_once)
    local_registry = JobRegistry()
    alerts.register_handlers(local_registry)
    monkeypatch.setattr(worker, "registry", local_registry)

    assert worker.run_once("test-worker") == 1
    with committed() as session:
        [job] = session.scalars(select(Job).where(Job.kind == alerts.JOB_KIND)).all()
        assert job.status == JobStatus.PENDING.value
        job.run_after = now() - timedelta(seconds=1)
        session.commit()
    assert worker.run_once("test-worker") == 1

    assert [message.to for message in outbox] == [ADMIN_EMAIL]
    with committed() as session:
        state = session.get(MonitoringAlertState, "backup_not_configured")
        assert state is not None and state.last_sent_at is not None


def test_without_mail_transport_the_job_still_succeeds_and_continues(
    committed, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from eimir.mail import MailUnavailableError

    settings = get_settings().model_copy(
        update={
            "deployment": Deployment.CLOUD,
            "media_store": MediaStoreBackend.S3,
            "server_admin_emails": [ADMIN_EMAIL],
        }
    )
    monkeypatch.setattr(alerts, "get_settings", lambda: settings)

    def unavailable():  # type: ignore[no-untyped-def]
        raise MailUnavailableError

    monkeypatch.setattr(alerts, "mail_sender", unavailable)
    with committed() as session:
        account = make_account(session, "Operator")
        session.add(
            AccountEmail(
                account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now()
            )
        )
        committed.created.append(account.id)
        alerts.ensure_scheduled(session)
        session.commit()
    local_registry = JobRegistry()
    alerts.register_handlers(local_registry)
    monkeypatch.setattr(worker, "registry", local_registry)

    assert worker.run_once("test-worker") == 1

    with committed() as session:
        statuses = sorted(
            job.status for job in session.scalars(select(Job).where(Job.kind == alerts.JOB_KIND))
        )
        assert statuses == [JobStatus.PENDING.value, JobStatus.SUCCEEDED.value]
