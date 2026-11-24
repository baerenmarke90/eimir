"""Wire models and route table of the operator API need no database (#2189)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api import models, support_reports
from eimir_admin.support_tickets.models import SupportReportTicket, TicketState

from eimir.support_reports.models import SupportReport, SupportReportKind, SupportReportState
from eimir.support_reports.payload import ClientContext, FailureReference, SupportReportPayload

NOTE = "private-note-text-must-stay-out-of-lists"
CREATED = datetime(2026, 11, 24, 8, 0, tzinfo=UTC)


def _report(*, note: str | None = NOTE, failure: bool = True) -> SupportReport:
    return SupportReport(
        id=uuid4(),
        account_id=uuid4(),
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM.value,
        state=SupportReportState.NEW.value,
        created_at=CREATED,
        payload=SupportReportPayload(
            note=note,
            failure=(
                FailureReference(
                    reference="GET:/api/v1/plans:500:INTERNAL_ERROR:app", request_id="r-1"
                )
                if failure
                else None
            ),
            client=ClientContext(
                app_version="0.2.0",
                build="123",
                platform="app",
                os="Android 16",
                engine="WebView 142",
                locale="de-DE",
                theme="dark",
                online=True,
                local_time="2026-11-24T09:00:00",
                time_zone="Europe/Berlin",
            ),
        ),
    )


def _ticket(report: SupportReport) -> SupportReportTicket:
    return SupportReportTicket(
        id=uuid4(),
        report_id=report.id,
        tracker="github",
        url="https://github.com/example/tickets/issues/7",
        number=7,
        state=TicketState.CREATED.value,
        created_at=CREATED,
    )


def test_a_list_item_never_carries_the_note_text() -> None:
    report = _report()

    item = support_reports.list_item(report, has_reply=False, ticket=None)
    wire = item.model_dump(by_alias=True, mode="json")

    assert set(wire) == {
        "id",
        "kind",
        "state",
        "createdAt",
        "archivedAt",
        "failureReference",
        "appVersion",
        "build",
        "hasReply",
        "ticket",
    }
    assert NOTE not in str(wire)
    assert wire["failureReference"] == "GET:/api/v1/plans:500:INTERNAL_ERROR:app"
    assert wire["appVersion"] == "0.2.0"
    assert wire["ticket"] is None


def test_a_list_item_without_failure_has_no_reference() -> None:
    item = support_reports.list_item(_report(failure=False), has_reply=True, ticket=None)

    assert item.failure_reference is None
    assert item.has_reply is True


def test_a_list_item_summarizes_the_ticket_without_content() -> None:
    report = _report()

    wire = support_reports.list_item(report, has_reply=False, ticket=_ticket(report)).model_dump(
        by_alias=True, mode="json"
    )

    assert wire["ticket"] == {
        "tracker": "github",
        "state": "CREATED",
        "url": "https://github.com/example/tickets/issues/7",
        "number": 7,
        "createdAt": "2026-11-24T08:00:00Z",
    }


def test_the_detail_carries_the_note_and_the_account_id_only() -> None:
    report = _report()
    reply_at = datetime(2026, 11, 24, 9, 30, tzinfo=UTC)

    detail = support_reports.detail_view(
        report,
        reply=models.SupportReportOperatorReply(text="Thanks, fixed.", replied_at=reply_at),
        ticket=None,
        ticket_available=True,
    )
    wire = detail.model_dump(by_alias=True, mode="json")

    assert set(wire) == {
        "id",
        "kind",
        "state",
        "createdAt",
        "archivedAt",
        "failureReference",
        "appVersion",
        "build",
        "hasReply",
        "ticket",
        "note",
        "requestId",
        "client",
        "accountId",
        "reply",
        "ticketAvailable",
    }
    assert wire["note"] == NOTE
    assert wire["accountId"] == str(report.account_id)
    assert wire["requestId"] == "r-1"
    assert wire["hasReply"] is True
    assert wire["reply"] == {"text": "Thanks, fixed.", "repliedAt": "2026-11-24T09:30:00Z"}
    assert wire["client"]["timeZone"] == "Europe/Berlin"
    assert wire["ticketAvailable"] is True
    assert "email" not in str(wire).lower()


def test_the_detail_without_reply_or_failure() -> None:
    detail = support_reports.detail_view(
        _report(note=None, failure=False), reply=None, ticket=None, ticket_available=False
    )

    assert detail.note is None
    assert detail.request_id is None
    assert detail.failure_reference is None
    assert detail.has_reply is False
    assert detail.reply is None
    assert detail.ticket_available is False


def test_reply_text_is_trimmed_and_limited_to_500_characters() -> None:
    assert models.SupportReportReplyCreate(text="  Thanks  ").text == "Thanks"
    assert len(models.SupportReportReplyCreate(text="x" * 500).text) == 500
    with pytest.raises(ValidationError):
        models.SupportReportReplyCreate(text="x" * 501)
    with pytest.raises(ValidationError):
        models.SupportReportReplyCreate(text="   ")


def test_requests_reject_unknown_fields_and_unknown_states() -> None:
    with pytest.raises(ValidationError):
        models.SupportReportReplyCreate.model_validate({"text": "ok", "operatorId": "x"})
    with pytest.raises(ValidationError):
        models.SupportReportStateUpdate.model_validate({"state": "DONE"})
    with pytest.raises(ValidationError):
        models.SupportReportStateUpdate.model_validate({"state": "NEW", "note": "x"})
    assert models.SupportReportStateUpdate.model_validate({"state": "CLOSED"}).state is (
        SupportReportState.CLOSED
    )


def test_the_router_serves_exactly_the_eight_operator_routes() -> None:
    routes = {
        (method, route.path, route.operation_id)  # type: ignore[attr-defined]
        for route in support_reports.router.routes
        for method in route.methods  # type: ignore[attr-defined]
    }

    prefix = "/server-admin/support-reports"
    assert routes == {
        ("GET", prefix, "listSupportReports"),
        ("GET", f"{prefix}/{{reportId}}", "getSupportReport"),
        ("PUT", f"{prefix}/{{reportId}}/state", "setSupportReportState"),
        ("PUT", f"{prefix}/{{reportId}}/archive", "setSupportReportArchived"),
        ("DELETE", f"{prefix}/{{reportId}}", "deleteSupportReport"),
        ("POST", f"{prefix}/{{reportId}}/reply", "replyToSupportReport"),
        ("POST", f"{prefix}/{{reportId}}/ticket", "createSupportReportTicket"),
        ("DELETE", f"{prefix}/{{reportId}}/ticket", "clearSupportReportTicket"),
    }


def test_the_plugin_mounts_the_router_without_a_route_collision() -> None:
    from eimir_admin.plugin import plugin
    from fastapi import FastAPI

    from eimir.api.v1 import router as core_router
    from eimir.plugins.loader import check_route_collisions

    app = FastAPI()
    app.include_router(core_router, prefix="/api/v1")

    assert list(plugin.routers()) == [support_reports.router]
    check_route_collisions(app.routes, [("admin", support_reports.router)], prefix="/api/v1")


def test_the_core_test_support_lists_exactly_the_operator_operations() -> None:
    from tests.support.plugins import ADMIN_OPERATIONS, operation_key

    mounted = {
        operation_key(method, f"/api/v1{route.path}")  # type: ignore[attr-defined]
        for route in support_reports.router.routes
        for method in route.methods  # type: ignore[attr-defined]
    }

    assert mounted == {operation_key(*operation) for operation in ADMIN_OPERATIONS}
