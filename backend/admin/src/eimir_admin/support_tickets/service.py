"""Creating and clearing the tracker ticket of a support report (#2189, design section 5.4).

What leaves the instance. The ticket text is the operator's title and body plus a
fixed footer of technical facts: kind, app version, build, platform, failure
reference, request id and report id. The footer is built by ``compose_body`` from
exactly those named values. The report note, the reply and every other stored
free text are never read into the request.

Transactions. The plugin route code owns the commits around the tracker call;
this is the one place where the request transaction is deliberately split. Core's
unit of work (``eimir.db.session``) would otherwise hold one transaction across
a slow external call and could roll back after the tracker accepted the issue.

1. Reserve: insert a ``PENDING`` link row and **commit**. The unique index on the
   report id is the lock: of two concurrent requests exactly one inserts, the
   other fails with the existing link and never calls the tracker. The commit
   also ends whatever the request transaction held before (authentication reads).
2. Call the tracker. No database connection is held during the call.
3. Finish: set ``CREATED`` with url and number, record the audit entry and
   **commit** both together.

If the tracker call fails the ``PENDING`` row stays: a blind retry could create
a second issue after an unseen success, so the operator clears the link first
(``clear_ticket``) and then retries. The request unit of work that follows the
service call has nothing pending and commits or rolls back an empty transaction.
A report that is deleted meanwhile takes its link row with it (foreign-key
cascade); that case answers "report not found" instead of failing.
"""

from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.core.errors import NotFoundError
from eimir.support_reports.models import SupportReport
from eimir.support_reports.service import REPORT_NOT_FOUND
from eimir_admin.support_tickets.models import SupportReportTicket, TicketState
from eimir_admin.tracker.base import IssueTracker, TrackerError

TICKET_EXISTS = "SUPPORT_TICKET_EXISTS"
TICKET_NOT_CONFIGURED = "SUPPORT_TICKET_NOT_CONFIGURED"
TICKET_FAILED = "SUPPORT_TICKET_FAILED"
TICKET_NOT_FOUND = "SUPPORT_TICKET_NOT_FOUND"

TICKET_LABELS = ("support-report",)

_UNSAFE = re.compile(r"[^A-Za-z0-9._+:/{}-]")


class TicketExistsError(Exception):
    """The report already has a link row, ``PENDING`` or ``CREATED``."""

    def __init__(self, ticket: SupportReportTicket) -> None:
        super().__init__("The report already has a ticket.")
        self.ticket = ticket


class TicketFailedError(Exception):
    """The tracker call failed; the ``PENDING`` row stays. Carries no tracker text."""

    def __init__(self, *, retryable: bool) -> None:
        super().__init__("The tracker did not create the ticket.")
        self.retryable = retryable


def _value(text: str | None) -> str:
    """One footer value: only characters that cannot form markup, links or mentions."""
    if text is None:
        return "none"
    cleaned = _UNSAFE.sub("_", text)
    return f"`{cleaned}`" if cleaned else "`none`"


def compose_body(
    operator_body: str,
    *,
    report_id: UUID,
    kind: str,
    app_version: str,
    build: str,
    platform: str,
    failure_reference: str | None,
    request_id: str | None,
) -> str:
    """The operator's text followed by the technical footer, built from these values only."""
    footer = (
        "---",
        "Support report (technical details)",
        f"- Report: {_value(str(report_id))}",
        f"- Kind: {_value(kind)}",
        f"- App version: {_value(app_version)}",
        f"- Build: {_value(build)}",
        f"- Platform: {_value(platform)}",
        f"- Failure reference: {_value(failure_reference)}",
        f"- Request id: {_value(request_id)}",
    )
    lines = "\n".join(footer)
    return f"{operator_body}\n\n{lines}" if operator_body else lines


def _find(session: Session, report_id: UUID) -> SupportReportTicket | None:
    return session.execute(
        select(SupportReportTicket).where(SupportReportTicket.report_id == report_id)
    ).scalar_one_or_none()


def _report_exists(session: Session, report_id: UUID) -> bool:
    """Ask the database, not the identity map: the report may be deleted meanwhile."""
    return (
        session.execute(select(SupportReport.id).where(SupportReport.id == report_id)).first()
        is not None
    )


def _report_missing() -> NotFoundError:
    return NotFoundError("Support report not found.", REPORT_NOT_FOUND)


def _reserve(session: Session, *, report_id: UUID, tracker_name: str) -> SupportReportTicket:
    """Insert the ``PENDING`` row; the unique index decides between concurrent requests."""
    ticket = SupportReportTicket(
        report_id=report_id, tracker=tracker_name, state=TicketState.PENDING.value
    )
    try:
        with session.begin_nested():
            session.add(ticket)
            session.flush()
    except IntegrityError:
        # A unique violation (a concurrent or earlier link) and a foreign-key
        # violation (the report was deleted) are told apart by what is there now,
        # which does not depend on the database driver.
        existing = _find(session, report_id)
        if existing is not None:
            raise TicketExistsError(existing) from None
        if not _report_exists(session, report_id):
            raise _report_missing() from None
        raise
    return ticket


def create_ticket(
    session: Session,
    tracker: IssueTracker,
    *,
    report_id: UUID,
    title: str,
    body: str,
    operator_id: UUID,
) -> SupportReportTicket:
    """Create the one tracker ticket of a report; see the module docstring."""
    report = session.get(SupportReport, report_id)
    if report is None:
        raise _report_missing()
    existing = _find(session, report_id)
    if existing is not None:
        raise TicketExistsError(existing)

    # Only these technical fields are read from the stored report.
    payload = report.payload
    composed = compose_body(
        body,
        report_id=report.id,
        kind=report.kind,
        app_version=payload.client.app_version,
        build=payload.client.build,
        platform=payload.client.platform,
        failure_reference=payload.failure.reference if payload.failure else None,
        request_id=payload.failure.request_id if payload.failure else None,
    )
    account_id = report.account_id

    pending = _reserve(session, report_id=report_id, tracker_name=tracker.name)
    ticket_id = pending.id
    session.commit()

    try:
        ref = tracker.create_issue(title=title, body=composed, labels=TICKET_LABELS)
    except TrackerError as error:
        raise TicketFailedError(retryable=error.retryable) from None

    # Read the row again from the database: it may have been cleared meanwhile.
    ticket = session.execute(
        select(SupportReportTicket)
        .where(SupportReportTicket.id == ticket_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if ticket is None:
        # Cleared while the call ran, or the report was deleted (the row cascaded).
        # The issue exists, so the link is restored when the report is still there.
        if not _report_exists(session, report_id):
            raise _report_missing()
        ticket = SupportReportTicket(report_id=report_id, tracker=tracker.name)
        session.add(ticket)
    ticket.state = TicketState.CREATED.value
    ticket.url = ref.url
    ticket.number = ref.number
    administration.record_action(
        session,
        actor_id=operator_id,
        action=AdministrationAction.SUPPORT_REPORT_TICKET_CREATED,
        target_account_id=account_id,
    )
    session.commit()
    return ticket


def clear_ticket(session: Session, *, report_id: UUID, operator_id: UUID) -> None:
    """Remove the link row after the operator confirmed; the tracker issue is untouched.

    The deletion and its audit entry belong to the request transaction.
    """
    report = session.get(SupportReport, report_id)
    if report is None:
        raise _report_missing()
    removed = session.execute(
        delete(SupportReportTicket)
        .where(SupportReportTicket.report_id == report_id)
        .returning(SupportReportTicket.id)
    ).first()
    if removed is None:
        raise NotFoundError("The report has no ticket.", TICKET_NOT_FOUND)
    administration.record_action(
        session,
        actor_id=operator_id,
        action=AdministrationAction.SUPPORT_REPORT_TICKET_CLEARED,
        target_account_id=report.account_id,
    )
