"""The ticket link table of the operator plugin (#2189, design section 5.4).

The metadata tests need no database. The integration tests run against the
PostgreSQL test database with the Core support report table.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.support_tickets.models import (
    SupportReportTicket,
    TicketState,
)

from eimir.support_reports.models import SupportReport, SupportReportKind
from eimir.support_reports.payload import ClientContext, SupportReportPayload
from tests.conftest import make_account, requires_database

TABLE = SupportReportTicket.__table__


def test_the_table_and_its_states() -> None:
    assert TABLE.name == "support_report_tickets"
    assert [state.value for state in TicketState] == ["PENDING", "CREATED"]
    assert set(TABLE.columns.keys()) == {
        "id",
        "report_id",
        "tracker",
        "url",
        "number",
        "state",
        "created_at",
    }


def test_the_report_reference_cascades_and_is_unique() -> None:
    foreign_keys = [c for c in TABLE.constraints if isinstance(c, ForeignKeyConstraint)]
    assert [(key.elements[0].target_fullname, key.ondelete) for key in foreign_keys] == [
        ("support_reports.id", "CASCADE")
    ]
    uniques = [c for c in TABLE.constraints if isinstance(c, UniqueConstraint)]
    assert [[column.name for column in unique.columns] for unique in uniques] == [["report_id"]]
    assert TABLE.columns["report_id"].nullable is False


def test_the_state_is_checked_in_the_database() -> None:
    checks = {c.name: str(c.sqltext) for c in TABLE.constraints if isinstance(c, CheckConstraint)}
    assert checks == {"ck_support_report_tickets_state_allowed": "state IN ('PENDING', 'CREATED')"}


def test_only_the_link_details_are_nullable() -> None:
    assert {column.name for column in TABLE.columns if column.nullable} == {"url", "number"}


def _report(session: Session) -> SupportReport:
    account = make_account(session)
    report = SupportReport(
        account_id=account.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM.value,
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
    session.add(report)
    session.flush()
    return report


@pytest.mark.integration
@requires_database
def test_report_id_is_unique(session: Session) -> None:
    report = _report(session)
    session.add(SupportReportTicket(report_id=report.id, tracker="github", state="PENDING"))
    session.flush()

    session.add(SupportReportTicket(report_id=report.id, tracker="github", state="PENDING"))
    with pytest.raises(IntegrityError):
        session.flush()


@pytest.mark.integration
@requires_database
def test_row_is_deleted_with_its_report(session: Session) -> None:
    report = _report(session)
    ticket = SupportReportTicket(
        report_id=report.id,
        tracker="github",
        url="https://github.com/o/r/issues/7",
        number=7,
        state=TicketState.CREATED.value,
    )
    session.add(ticket)
    session.flush()
    session.refresh(ticket)
    assert isinstance(ticket.created_at, datetime)
    assert ticket.created_at.tzinfo is not None

    # The database cascades; the ORM must not need to load the ticket first.
    session.execute(SupportReport.__table__.delete().where(SupportReport.id == report.id))
    # Forget the loaded instance: its row is gone, so refreshing it would fail.
    session.expunge_all()

    assert session.get(SupportReportTicket, ticket.id) is None


@pytest.mark.integration
@requires_database
def test_state_check_constraint(session: Session) -> None:
    report = _report(session)
    session.add(SupportReportTicket(report_id=report.id, tracker="github", state="BOGUS"))

    with pytest.raises(IntegrityError, match="state_allowed"):
        session.flush()
