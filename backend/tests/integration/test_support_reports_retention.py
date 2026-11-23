"""Retention and account-deletion cleanup of support reports (#2189).

Needs PostgreSQL: the replies leave through the foreign key's cascade.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.jobs import maintenance
from eimir.support_reports import service
from eimir.support_reports.models import (
    SupportReport,
    SupportReportKind,
    SupportReportReplyRow,
    SupportReportState,
)
from eimir.support_reports.payload import ClientContext, SupportReportPayload
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _fixed_now(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "now", lambda: NOW)


def _report(session: Session, account_id: UUID) -> SupportReport:
    report, _ = service.create_report(
        session,
        account_id=account_id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note="The list did not load.",
            client=ClientContext(
                app_version="0.2.0",
                build="123",
                platform="app",
                os="Android 16",
                engine="WebView 142",
                locale="de-DE",
                theme="dark",
                online=True,
                local_time="2026-11-23T10:15:00",
                time_zone="Europe/Berlin",
            ),
        ),
    )
    return report


def _closed(session: Session, account_id: UUID, *, closed_ago: timedelta) -> UUID:
    report = _report(session, account_id)
    report.state = SupportReportState.CLOSED.value
    report.closed_at = NOW - closed_ago
    session.flush()
    return report.id


def _open(session: Session, account_id: UUID, *, created_ago: timedelta) -> UUID:
    report = _report(session, account_id)
    report.created_at = NOW - created_ago
    session.flush()
    return report.id


def _remaining(session: Session) -> set[UUID]:
    return set(session.execute(select(SupportReport.id)).scalars())


def test_prune_removes_closed_after_90_days(session: Session) -> None:
    account = make_account(session)
    expired = _closed(session, account.id, closed_ago=timedelta(days=90, seconds=1))

    assert service.prune_expired(session) == 1
    session.expire_all()

    assert expired not in _remaining(session)


def test_prune_keeps_closed_exactly_at_the_boundary(session: Session) -> None:
    account = make_account(session)
    boundary = _closed(session, account.id, closed_ago=timedelta(days=90))

    assert service.prune_expired(session) == 0

    assert boundary in _remaining(session)


def test_prune_leaves_recent_closed_reports(session: Session) -> None:
    account = make_account(session)
    recent = _closed(session, account.id, closed_ago=timedelta(days=89))

    assert service.prune_expired(session) == 0

    assert recent in _remaining(session)


def test_prune_keeps_open_before_365_days(session: Session) -> None:
    account = make_account(session)
    open_report = _open(session, account.id, created_ago=timedelta(days=364))
    older_open = _open(session, account.id, created_ago=timedelta(days=200))

    assert service.prune_expired(session) == 0

    assert {open_report, older_open} <= _remaining(session)


def test_prune_keeps_open_exactly_at_365_days(session: Session) -> None:
    account = make_account(session)
    boundary = _open(session, account.id, created_ago=timedelta(days=365))

    assert service.prune_expired(session) == 0

    assert boundary in _remaining(session)


def test_prune_removes_open_after_365_days(session: Session) -> None:
    account = make_account(session)
    expired = _open(session, account.id, created_ago=timedelta(days=365, seconds=1))

    assert service.prune_expired(session) == 1
    session.expire_all()

    assert expired not in _remaining(session)


def test_prune_removes_closed_report_created_over_a_year_ago_even_if_closed_recently(
    session: Session,
) -> None:
    account = make_account(session)
    report_id = _closed(session, account.id, closed_ago=timedelta(days=1))
    report = session.get(SupportReport, report_id)
    assert report is not None
    report.created_at = NOW - timedelta(days=366)
    session.flush()

    assert service.prune_expired(session) == 1


def test_prune_removes_the_reply_with_its_report(session: Session) -> None:
    account = make_account(session)
    expired = _closed(session, account.id, closed_ago=timedelta(days=91))
    kept = _open(session, account.id, created_ago=timedelta(days=1))
    service.send_reply(session, report_id=expired, text="Thanks.", operator_id=None)
    service.send_reply(session, report_id=kept, text="Thanks.", operator_id=None)

    assert service.prune_expired(session) == 1
    session.expire_all()

    replies = set(session.execute(select(SupportReportReplyRow.report_id)).scalars())
    assert replies == {kept}


def test_security_retention_prunes_support_reports(session: Session) -> None:
    account = make_account(session)
    expired = _closed(session, account.id, closed_ago=timedelta(days=91))

    maintenance.run_security_retention(session, {})
    session.flush()
    session.expire_all()

    assert expired not in _remaining(session)


def test_account_deletion_removes_reports_and_replies(session: Session) -> None:
    reporter = make_account(session, "Anna")
    other = make_account(session, "Ben")
    make_space(session, reporter)
    report = _report(session, reporter.id)
    other_report = _report(session, other.id)
    report_id = report.id
    other_report_id = other_report.id
    service.send_reply(session, report_id=report_id, text="Thanks.", operator_id=None)
    service.send_reply(session, report_id=other_report_id, text="Thanks.", operator_id=None)
    session.flush()

    apply_accepted_tombstone(session, reporter.id, accepted_at=clock.now())
    apply_core_cleanup(session, reporter.id)
    session.flush()
    session.expire_all()

    assert _remaining(session) == {other_report_id}
    replies = set(session.execute(select(SupportReportReplyRow.report_id)).scalars())
    assert replies == {other_report_id}
    assert (
        session.execute(
            select(func.count())
            .select_from(SupportReportReplyRow)
            .where(SupportReportReplyRow.report_id == report_id)
        ).scalar_one()
        == 0
    )
