"""Mail and push alerts for ServerAdmins (monitoring, #2317; admin push, #2314)."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationSetting
from eimir.config import Deployment, MediaStoreBackend, get_settings
from eimir.core.clock import now
from eimir.engagement.models import Notification
from eimir.identity.models import AccountEmail
from eimir.jobs.models import Job, JobStatus
from eimir.mail import MailMessage
from eimir.monitoring import alerts
from eimir.support_reports.models import SupportReport
from eimir.support_reports.payload import ClientContext, SupportReportPayload
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


def test_repeated_new_failures_mail_at_most_once_a_day(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    at = now()
    _failed_job(session, at - timedelta(minutes=1))
    assert _run(session, at, outbox) == ["failed_jobs"]
    _failed_job(session, at + timedelta(minutes=8))
    assert _run(session, at + timedelta(minutes=10), outbox) == []
    _failed_job(session, at + timedelta(minutes=18))
    assert _run(session, at + timedelta(minutes=20), outbox) == []
    assert len(outbox) == 1


def test_old_failures_before_the_first_run_are_not_mailed(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    at = now()
    _failed_job(session, at - timedelta(days=60))
    assert _run(session, at, outbox) == []
    assert outbox == []


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
    # Resolved and active again within a day: still at most one mail a day.
    monkeypatch.setattr(alerts, "_space_quota_pressure", lambda session, settings: False)
    assert _run(session, at + timedelta(hours=26), outbox) == []
    monkeypatch.setattr(alerts, "_space_quota_pressure", lambda session, settings: True)
    assert _run(session, at + timedelta(hours=27), outbox) == []
    assert _run(session, at + timedelta(hours=49), outbox) == ["space_quota_pressure"]


def _switch(session: Session, admin, setting: AdministrationSetting, enabled: bool) -> None:  # type: ignore[no-untyped-def]
    administration.update_setting(session, actor_id=admin.id, setting=setting, enabled=enabled)


def _pushes(session: Session) -> list[Notification]:
    return list(
        session.scalars(
            select(Notification)
            .where(Notification.kind == "OPERATOR_ALERT")
            .order_by(Notification.created_at, Notification.expires_at)
        )
    )


def test_switched_off_sends_nothing_and_re_enabling_sends_no_backlog(
    session: Session, outbox
) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    _switch(session, admin, AdministrationSetting.MONITORING_ALERTS_ENABLED, False)
    _switch(session, admin, AdministrationSetting.MONITORING_PUSH_ENABLED, False)
    at = now()
    _failed_job(session, at - timedelta(minutes=1))
    assert _run(session, at, outbox, "cloud") == []
    assert outbox == []
    assert _pushes(session) == []

    _switch(session, admin, AdministrationSetting.MONITORING_ALERTS_ENABLED, True)
    _switch(session, admin, AdministrationSetting.MONITORING_PUSH_ENABLED, True)
    assert _run(session, at + timedelta(minutes=5), outbox, "cloud") == []
    assert outbox == []
    assert _pushes(session) == []


def test_every_alert_mail_also_reaches_the_admin_as_push_once(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    at = now()
    _failed_job(session, at - timedelta(minutes=1))

    assert _run(session, at, outbox) == ["failed_jobs"]
    assert _run(session, at + timedelta(hours=2), outbox) == []

    assert len(outbox) == 1
    [notice] = _pushes(session)
    assert notice.recipient_account_id == admin.id
    assert notice.operator_topic == "failed_jobs"
    assert notice.space_id is None


def test_push_only_while_alert_mails_are_off(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    _switch(session, admin, AdministrationSetting.MONITORING_ALERTS_ENABLED, False)
    _failed_job(session, now() - timedelta(minutes=1))

    assert _run(session, now(), outbox) == ["failed_jobs"]

    assert outbox == []
    assert [notice.operator_topic for notice in _pushes(session)] == ["failed_jobs"]


def test_mail_only_while_alert_push_is_off(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    _switch(session, admin, AdministrationSetting.MONITORING_PUSH_ENABLED, False)
    _failed_job(session, now() - timedelta(minutes=1))

    assert _run(session, now(), outbox) == ["failed_jobs"]

    assert len(outbox) == 1
    assert _pushes(session) == []


def test_one_push_per_account_even_with_two_allow_listed_addresses(
    session: Session, outbox
) -> None:  # type: ignore[no-untyped-def]
    admin = _admin(session)
    session.add(
        AccountEmail(
            account_id=admin.id, email="second@example.test", is_primary=False, verified_at=now()
        )
    )
    session.flush()
    settings = _settings().model_copy(
        update={"server_admin_emails": [ADMIN_EMAIL, "second@example.test"]}
    )
    _failed_job(session, now() - timedelta(minutes=1))

    alerts.run(session, now(), settings, send=outbox.append)

    assert sorted(message.to for message in outbox) == [ADMIN_EMAIL, "second@example.test"]
    assert len(_pushes(session)) == 1


def _new_report(session: Session, account_id, at) -> SupportReport:  # type: ignore[no-untyped-def]
    report = SupportReport(
        account_id=account_id,
        client_request_id=uuid4(),
        kind="FEEDBACK",
        created_at=at,
        payload=SupportReportPayload(
            client=ClientContext(
                app_version="0.2.0",
                build="1",
                platform="web",
                os="Linux",
                engine="Firefox",
                locale="de-DE",
                theme="light",
                online=True,
                local_time="2026-11-26T12:00:00",
                time_zone="Europe/Berlin",
            )
        ),
    )
    session.add(report)
    session.flush()
    return report


def test_new_support_reports_notify_once_and_at_most_daily(
    session: Session, outbox, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(alerts, "_support_operator_available", lambda settings: True)
    admin = _admin(session)
    reporter = make_account(session, "Reporter")
    at = now()
    # Reports from before the first evaluation (an upgrade) are no backlog.
    _new_report(session, reporter.id, at - timedelta(days=3))
    assert _run(session, at, outbox) == []

    _new_report(session, reporter.id, at + timedelta(minutes=2))
    assert _run(session, at + timedelta(minutes=5), outbox) == ["support_reports"]
    # The same reports do not notify again.
    assert _run(session, at + timedelta(hours=30), outbox) == []
    # A newer report after the last notice notifies, at most once a day.
    _new_report(session, reporter.id, at + timedelta(hours=30, minutes=1))
    assert _run(session, at + timedelta(hours=30, minutes=5), outbox) == ["support_reports"]
    _new_report(session, reporter.id, at + timedelta(hours=31))
    assert _run(session, at + timedelta(hours=31, minutes=5), outbox) == []
    assert _run(session, at + timedelta(hours=54, minutes=10), outbox) == ["support_reports"]

    notices = _pushes(session)
    # Three notices were sent; the first expired more than a day ago and is pruned.
    assert [notice.operator_topic for notice in notices] == ["support_reports"] * 2
    assert {notice.recipient_account_id for notice in notices} == {admin.id}
    assert "/server-admin?section=reports&state=NEW" in outbox[0].body


def test_support_reports_stay_silent_without_the_operator_plugin(session: Session, outbox) -> None:  # type: ignore[no-untyped-def]
    _admin(session)
    reporter = make_account(session, "Reporter")
    at = now()
    _run(session, at, outbox)
    _new_report(session, reporter.id, at + timedelta(minutes=1))

    assert _run(session, at + timedelta(minutes=5), outbox) == []
    assert _pushes(session) == []


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
    assert _pushes(session) == []
