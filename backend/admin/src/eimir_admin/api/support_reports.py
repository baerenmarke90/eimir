"""Operator routes for support reports (#2189, design section 5.3).

The routes read, triage and answer reports through the Core service interface
``eimir.support_reports.service``. Every route needs a ServerAdmin, answers
``Cache-Control: private, no-store`` and is a 404 while the operator has not
enabled support reports, like the reporter's own endpoint. Changes need recent
authentication and leave a content-free entry in the privileged audit: the
action and the reporter's account, never the report or reply text.

The list shows triage facts only. The note is read per report, in the detail,
which names the reporter by the opaque account id and nothing else.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.api.deps import CurrentServerAdmin, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.support_reports import ClientContextBody
from eimir.auth import recent_auth
from eimir.config import get_settings
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir.identity.models import Account
from eimir.support_reports import service
from eimir.support_reports.models import (
    SupportReport,
    SupportReportKind,
    SupportReportReplyRow,
    SupportReportState,
)
from eimir_admin.api.models import (
    SupportReportDetailView,
    SupportReportListItem,
    SupportReportListView,
    SupportReportOperatorReply,
    SupportReportReplyCreate,
    SupportReportStateUpdate,
    SupportReportTicketSummary,
)
from eimir_admin.support_tickets.models import SupportReportTicket, TicketState
from eimir_admin.tracker.settings import load_admin_settings, tracker_from_settings

NO_STORE = "private, no-store"


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = NO_STORE


router = APIRouter(
    prefix="/server-admin/support-reports",
    tags=["server-admin-support-reports"],
    dependencies=[Depends(_no_store)],
)


def _require_operator(admin: CurrentServerAdmin) -> Account:
    """A ServerAdmin, and only while the operator switch is on.

    The switch is checked after the authorization, so a caller who is not a
    ServerAdmin learns nothing about it.
    """
    if not get_settings().support_reports_enabled:
        raise NotFoundError("Support reports are not available.", service.REPORT_NOT_FOUND)
    return admin


Operator = Annotated[Account, Depends(_require_operator)]
ReportIdPath = Annotated[str, Path(alias="reportId", max_length=64)]


def _report_id(value: str) -> UUID:
    """Unknown and malformed ids are the same 404."""
    parsed = parse_id(value)
    if parsed is None:
        raise NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)
    return parsed


def _require_recent_authentication(
    session: Session, admin: Account, device_session: CurrentSession
) -> None:
    recent_auth.require_grant(
        session,
        admin,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
    )


def _ticket_summary(ticket: SupportReportTicket | None) -> SupportReportTicketSummary | None:
    if ticket is None:
        return None
    return SupportReportTicketSummary(
        tracker=ticket.tracker,
        state=TicketState(ticket.state),
        url=ticket.url,
        number=ticket.number,
    )


def list_item(
    report: SupportReport,
    *,
    has_reply: bool,
    ticket: SupportReportTicket | None,
) -> SupportReportListItem:
    """Triage facts of one report; the note is deliberately not read here."""
    payload = report.payload
    return SupportReportListItem(
        id=report.id,
        kind=SupportReportKind(report.kind),
        state=SupportReportState(report.state),
        created_at=report.created_at,
        failure_reference=payload.failure.reference if payload.failure else None,
        app_version=payload.client.app_version,
        build=payload.client.build,
        has_reply=has_reply,
        ticket=_ticket_summary(ticket),
    )


def detail_view(
    report: SupportReport,
    *,
    reply: SupportReportOperatorReply | None,
    ticket: SupportReportTicket | None,
    ticket_available: bool,
) -> SupportReportDetailView:
    payload = report.payload
    item = list_item(report, has_reply=reply is not None, ticket=ticket)
    return SupportReportDetailView(
        **item.model_dump(),
        note=payload.note,
        request_id=payload.failure.request_id if payload.failure else None,
        client=ClientContextBody.model_validate(payload.client.model_dump()),
        account_id=report.account_id,
        reply=reply,
        ticket_available=ticket_available,
    )


def _replied_report_ids(session: Session, report_ids: Sequence[UUID]) -> set[UUID]:
    """Which of these reports have a reply; reads no reply text."""
    if not report_ids:
        return set()
    return set(
        session.execute(
            select(SupportReportReplyRow.report_id).where(
                SupportReportReplyRow.report_id.in_(report_ids)
            )
        ).scalars()
    )


def _tickets_by_report(
    session: Session, report_ids: Sequence[UUID]
) -> dict[UUID, SupportReportTicket]:
    if not report_ids:
        return {}
    rows = session.execute(
        select(SupportReportTicket).where(SupportReportTicket.report_id.in_(report_ids))
    ).scalars()
    return {ticket.report_id: ticket for ticket in rows}


def _ticket_available() -> bool:
    """A ticket can be created only when a tracker is configured."""
    return tracker_from_settings(load_admin_settings()) is not None


def _detail(session: Session, report: SupportReport) -> SupportReportDetailView:
    reply = service.get_reply(session, report_id=report.id, account_id=report.account_id)
    return detail_view(
        report,
        reply=(
            SupportReportOperatorReply(text=reply.text, replied_at=reply.replied_at)
            if reply is not None
            else None
        ),
        ticket=_tickets_by_report(session, [report.id]).get(report.id),
        ticket_available=_ticket_available(),
    )


@router.get(
    "",
    response_model=SupportReportListView,
    operation_id="listSupportReports",
    responses=problem_responses(400, 401, 403, 404, 422),
)
def list_support_reports(
    _: Operator,
    session: DbSession,
    state: Annotated[SupportReportState | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
) -> SupportReportListView:
    """List reports newest first without note text; the cursor is bound to the state filter."""
    page = service.list_reports(session, state=state, limit=limit, cursor=cursor)
    ids = [report.id for report in page.items]
    replied = _replied_report_ids(session, ids)
    tickets = _tickets_by_report(session, ids)
    return SupportReportListView(
        items=[
            list_item(report, has_reply=report.id in replied, ticket=tickets.get(report.id))
            for report in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        new_count=service.count_new(session),
    )


@router.get(
    "/{reportId}",
    response_model=SupportReportDetailView,
    operation_id="getSupportReport",
    responses=problem_responses(401, 403, 404),
)
def get_support_report(
    report_id_text: ReportIdPath,
    _: Operator,
    session: DbSession,
) -> SupportReportDetailView:
    """Return one report in full; the reporter is the opaque account id only."""
    report = service.get_report(session, _report_id(report_id_text))
    if report is None:
        raise NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)
    return _detail(session, report)


@router.put(
    "/{reportId}/state",
    response_model=SupportReportDetailView,
    operation_id="setSupportReportState",
    responses=problem_responses(401, 403, 404, 422),
)
def set_support_report_state(
    report_id_text: ReportIdPath,
    body: SupportReportStateUpdate,
    admin: Operator,
    device_session: CurrentSession,
    session: DbSession,
) -> SupportReportDetailView:
    """Set the triage marker of a report. Needs recent authentication."""
    _require_recent_authentication(session, admin, device_session)
    report = service.set_state(session, _report_id(report_id_text), body.state)
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SUPPORT_REPORT_STATE_SET,
        target_account_id=report.account_id,
    )
    return _detail(session, report)


@router.post(
    "/{reportId}/reply",
    response_model=SupportReportDetailView,
    operation_id="replyToSupportReport",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def reply_to_support_report(
    report_id_text: ReportIdPath,
    body: SupportReportReplyCreate,
    admin: Operator,
    device_session: CurrentSession,
    session: DbSession,
) -> SupportReportDetailView:
    """Send the single reply of at most 500 characters. Needs recent authentication."""
    _require_recent_authentication(session, admin, device_session)
    report = service.send_reply(
        session,
        report_id=_report_id(report_id_text),
        text=body.text,
        operator_id=admin.id,
    )
    administration.record_action(
        session,
        actor_id=admin.id,
        action=AdministrationAction.SUPPORT_REPORT_REPLY_SENT,
        target_account_id=report.account_id,
    )
    return _detail(session, report)
