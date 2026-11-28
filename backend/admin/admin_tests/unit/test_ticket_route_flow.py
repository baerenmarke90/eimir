"""The ticket routes against a faked ticket service: no database needed (#2189).

This pins what the routes do around the service: the gates and their order,
which error becomes which response (including the link and the retry flag in the
problem body), the empty 204 of the clear route and that a clear is audited
exactly once. The integration tests next door run the same routes against
PostgreSQL with a real service.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api import support_reports as routes
from eimir_admin.support_tickets import service as tickets
from eimir_admin.support_tickets.models import SupportReportTicket, TicketState
from fastapi import FastAPI
from fastapi.testclient import TestClient

from eimir.api import deps
from eimir.api.errors import register_error_handlers
from eimir.config import Settings
from eimir.core.errors import ErrorCode, NotFoundError
from eimir.db.session import get_session
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind
from eimir.support_reports.payload import ClientContext, SupportReportPayload

BASE = "/api/v1/server-admin/support-reports"
OPERATOR_ID = uuid4()
SECRET_NOTE = "private-note-text-must-never-reach-the-tracker"


def _report() -> SupportReport:
    return SupportReport(
        id=uuid4(),
        account_id=uuid4(),
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM.value,
        state="NEW",
        created_at=datetime(2026, 11, 24, 8, 0, tzinfo=UTC),
        payload=SupportReportPayload(
            note=SECRET_NOTE,
            client=ClientContext(
                app_version="0.2.0",
                build="9",
                platform="web",
                os="Linux",
                engine="Chromium",
                locale="en",
                theme="light",
                online=True,
                local_time="2026-11-24T09:00:00",
                time_zone="UTC",
            ),
        ),
    )


def _ticket(report_id: UUID, *, state: TicketState = TicketState.CREATED) -> SupportReportTicket:
    created = state is TicketState.CREATED
    return SupportReportTicket(
        id=uuid4(),
        report_id=report_id,
        tracker="github",
        url="https://github.com/example/tickets/issues/7" if created else None,
        number=7 if created else None,
        state=state.value,
        created_at=datetime(2026, 11, 24, 8, 0, tzinfo=UTC),
    )


class Harness:
    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.report = _report()
        self.enabled = True
        self.configured = True
        self.outcome: Exception | SupportReportTicket | None = None
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.audit: list[dict[str, Any]] = []

        app = FastAPI()
        register_error_handlers(app)
        app.include_router(routes.router, prefix="/api/v1")
        app.dependency_overrides[deps.current_server_admin] = lambda: SimpleNamespace(
            id=OPERATOR_ID
        )
        app.dependency_overrides[deps.current_session] = lambda: SimpleNamespace(id=uuid4())
        app.dependency_overrides[get_session] = lambda: object()
        self.client = TestClient(app, raise_server_exceptions=False)

        monkeypatch.setattr(
            routes,
            "get_settings",
            lambda: Settings.model_validate({"support_reports_enabled": self.enabled}),
        )
        monkeypatch.setattr(service, "get_report", self._get_report)
        monkeypatch.setattr(routes, "_configured_tracker", self._tracker)
        monkeypatch.setattr(tickets, "create_ticket", self._create)
        monkeypatch.setattr(tickets, "clear_ticket", self._clear)

    def _tracker(self) -> object | None:
        return object() if self.configured else None

    def _get_report(self, session: object, report_id: UUID) -> SupportReport | None:
        return self.report if report_id == self.report.id else None

    def _create(self, session: object, tracker: object, **kwargs: Any) -> SupportReportTicket:
        self.calls.append(("create", kwargs))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome or _ticket(kwargs["report_id"])

    def _clear(self, session: object, **kwargs: Any) -> None:
        if kwargs["report_id"] != self.report.id:
            raise NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)
        self.calls.append(("clear", kwargs))
        if isinstance(self.outcome, Exception):
            raise self.outcome

    def url(self, report_id: object | None = None) -> str:
        return f"{BASE}/{report_id or self.report.id}/ticket"


@pytest.fixture
def harness(monkeypatch: pytest.MonkeyPatch) -> Harness:
    return Harness(monkeypatch)


BODY = {"title": "Plans fail to load", "body": "Seen twice."}


def test_create_returns_the_link_and_passes_the_operator_text(harness: Harness) -> None:
    response = harness.client.post(harness.url(), json=BODY)

    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "tracker": "github",
        "state": "CREATED",
        "url": "https://github.com/example/tickets/issues/7",
        "number": 7,
        "createdAt": "2026-11-24T08:00:00Z",
    }
    assert harness.calls == [
        (
            "create",
            {
                "report_id": harness.report.id,
                "title": "Plans fail to load",
                "body": "Seen twice.",
                "operator_id": OPERATOR_ID,
            },
        )
    ]


def test_an_existing_link_is_a_conflict_that_carries_the_link(harness: Harness) -> None:
    harness.outcome = tickets.TicketExistsError(_ticket(harness.report.id))

    response = harness.client.post(harness.url(), json=BODY)

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "SUPPORT_TICKET_EXISTS"
    assert body["ticket"]["url"] == "https://github.com/example/tickets/issues/7"
    assert body["ticket"]["state"] == "CREATED"
    assert body["retryable"] is None
    assert response.headers["cache-control"] == "private, no-store"


def test_a_pending_link_is_reported_as_pending(harness: Harness) -> None:
    harness.outcome = tickets.TicketExistsError(
        _ticket(harness.report.id, state=TicketState.PENDING)
    )

    body = harness.client.post(harness.url(), json=BODY).json()

    assert body["ticket"] == {
        "tracker": "github",
        "state": "PENDING",
        "url": None,
        "number": None,
        "createdAt": "2026-11-24T08:00:00Z",
    }


def test_no_tracker_is_a_conflict_and_calls_nothing(harness: Harness) -> None:
    harness.configured = False

    response = harness.client.post(harness.url(), json=BODY)

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPORT_TICKET_NOT_CONFIGURED"
    assert harness.calls == []


@pytest.mark.parametrize("retryable", [True, False])
def test_a_tracker_failure_is_a_502_with_the_retry_flag(harness: Harness, retryable: bool) -> None:
    harness.outcome = tickets.TicketFailedError(retryable=retryable)

    response = harness.client.post(harness.url(), json=BODY)

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "SUPPORT_TICKET_FAILED"
    assert body["retryable"] is retryable
    assert body["ticket"] is None
    assert "token" not in response.text.lower()


def test_limits_are_validated_before_the_service(harness: Harness) -> None:
    for payload in (
        {"title": "", "body": ""},
        {"title": "t" * 257, "body": ""},
        {"title": "t", "body": "b" * 65537},
        {"title": "t"},
    ):
        response = harness.client.post(harness.url(), json=payload)
        assert response.status_code == 422
        assert response.json()["code"] == ErrorCode.VALIDATION_FAILED
    assert harness.calls == []
    assert (
        harness.client.post(harness.url(), json={"title": "t" * 256, "body": ""}).status_code == 201
    )


def test_an_empty_body_is_allowed(harness: Harness) -> None:
    assert harness.client.post(harness.url(), json={"title": "t", "body": ""}).status_code == 201


def test_unknown_and_malformed_ids_are_404_and_call_nothing(harness: Harness) -> None:
    for identifier in (uuid4(), "not-a-uuid"):
        post = harness.client.post(harness.url(identifier), json=BODY)
        delete = harness.client.delete(harness.url(identifier))
        for response in (post, delete):
            assert response.status_code == 404
            assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert harness.calls == []


def test_a_report_deleted_in_between_is_a_404(harness: Harness) -> None:
    harness.outcome = NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)

    response = harness.client.post(harness.url(), json=BODY)

    assert response.status_code == 404
    assert response.json()["code"] == service.REPORT_NOT_FOUND


def test_every_ticket_route_is_a_404_while_the_switch_is_off(harness: Harness) -> None:
    harness.enabled = False

    responses = [
        harness.client.post(harness.url(), json=BODY),
        harness.client.delete(harness.url()),
    ]

    assert [response.status_code for response in responses] == [404, 404]
    assert harness.calls == []


def test_clear_answers_204_without_a_body_and_no_store(harness: Harness) -> None:
    response = harness.client.delete(harness.url())

    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["cache-control"] == "private, no-store"
    assert harness.calls == [
        ("clear", {"report_id": harness.report.id, "operator_id": OPERATOR_ID})
    ]


def test_clear_without_a_link_is_a_404(harness: Harness) -> None:
    harness.outcome = NotFoundError("The report has no ticket.", tickets.TICKET_NOT_FOUND)

    response = harness.client.delete(harness.url())

    assert response.status_code == 404
    assert response.json()["code"] == "SUPPORT_TICKET_NOT_FOUND"
