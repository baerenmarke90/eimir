"""Mail alerts for ServerAdmins (ServerAdmin monitoring, #2317)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationSetting
from eimir.config import Deployment, MediaStoreBackend, get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.jobs.models import Job, JobStatus
from eimir.mail import MailMessage
from eimir.monitoring import alerts
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def outbox() -> list[MailMessage]:
    return []


def _settings(deployment: str = "self_hosted"):  # type: ignore[no-untyped-def]
    return get_settings().model_copy(
        update={
            "deployment": Deployment(deployment),
            "media_store": MediaStoreBackend.S3,
            "server_admin_emails": [ADMIN_EMAIL],
            "public_base_url": "https://eimir.example.test",
        }
    )


def _admin(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    return account


def _failed_job(session: Session, at) -> None:  # type: ignore[no-untyped-def]
    session.add(
        Job(
            kind="example",
            status=JobStatus.FAILED.value,
            payload={},
            attempts=3,
            max_attempts=3,
            run_after=at,
            finished_at=at,
        )
    )
    session.flush()


def _run(session: Session, at, outbox, deployment: str = "self_hosted") -> list[str]:  # type: ignore[no-untyped-def]
    return alerts.run(session, at, _settings(deployment), send=outbox.append)


def test_activation_mails_once_and_reminds_after_a_day(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    at = now()
    _run(session, at, outbox, "cloud")
    assert [message.to for message in outbox] == [ADMIN_EMAIL]
    assert "backup" in outbox[0].subject.lower() or outbox[0].subject

    _run(session, at + timedelta(hours=2), outbox, "cloud")
    assert len(outbox) == 1
    # The backup notice is a one-time mail, never a daily reminder.
    _run(session, at + timedelta(hours=25), outbox, "cloud")
    assert len(outbox) == 1


def test_new_failed_jobs_mail_once_per_new_failure(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    at = now()
    _failed_job(session, at - timedelta(minutes=1))
    assert _run(session, at, outbox) == ["failed_jobs"]
    # The same old failure stays in the table but is not new any more.
    assert _run(session, at + timedelta(hours=25), outbox) == []
    _failed_job(session, at + timedelta(hours=26))
    assert _run(session, at + timedelta(hours=26, minutes=5), outbox) == ["failed_jobs"]


def test_space_quota_pressure_reminds_daily_while_active(
    session: Session, outbox, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    make_space(session, make_account(session, "Owner"))
    monkeypatch.setattr(alerts, "_space_quota_pressure", lambda session, settings: True)
    at = now()
    assert _run(session, at, outbox) == ["space_quota_pressure"]
    assert _run(session, at + timedelta(hours=2), outbox) == []
    assert _run(session, at + timedelta(hours=25), outbox) == ["space_quota_pressure"]
    # Resolved, then active again: a new activation mail.
    monkeypatch.setattr(alerts, "_space_quota_pressure", lambda session, settings: False)
    assert _run(session, at + timedelta(hours=26), outbox) == []
    monkeypatch.setattr(alerts, "_space_quota_pressure", lambda session, settings: True)
    assert _run(session, at + timedelta(hours=27), outbox) == ["space_quota_pressure"]


def test_switched_off_sends_nothing_and_re_enabling_sends_no_backlog(
    session: Session, outbox
) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    administration.update_setting(
        session,
        actor_id=admin.id,
        setting=AdministrationSetting.MONITORING_ALERTS_ENABLED,
        enabled=False,
    )
    at = now()
    _failed_job(session, at - timedelta(minutes=1))
    assert _run(session, at, outbox, "cloud") == []
    assert outbox == []

    administration.update_setting(
        session,
        actor_id=admin.id,
        setting=AdministrationSetting.MONITORING_ALERTS_ENABLED,
        enabled=True,
    )
    assert _run(session, at + timedelta(minutes=5), outbox, "cloud") == []
    assert outbox == []


def test_mail_names_no_account_or_space(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    space = make_space(session, admin)
    _failed_job(session, now() - timedelta(minutes=1))
    _run(session, now(), outbox)

    [message] = outbox
    for text in (message.subject, message.body, message.html or ""):
        assert str(space.id) not in text
        assert str(admin.id) not in text
    assert "https://eimir.example.test/server-admin?section=monitoring" in message.body


def test_no_recipient_without_a_verified_allow_listed_address(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    make_account(session, "Not an operator")
    _failed_job(session, now() - timedelta(minutes=1))
    assert _run(session, now(), outbox) == ["failed_jobs"]
    assert outbox == []
