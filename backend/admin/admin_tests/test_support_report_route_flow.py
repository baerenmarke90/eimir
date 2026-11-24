"""The operator routes against a faked service: no database needed (#2189).

This pins what the routes do around the Core service: the feature switch, the
authorization order, the no-store header, what the list may carry, which audit
entry follows which write, and that nothing is audited when a write fails. The
integration tests next door run the same routes against PostgreSQL.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

import pytest

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api import support_reports as routes
from fastapi import FastAPI
from fastapi.testclient import TestClient

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.api import deps
from eimir.api.errors import register_error_handlers
from eimir.auth import recent_auth
from eimir.config import Settings
from eimir.core.errors import ConflictError, ErrorCode, ForbiddenError, NotFoundError
from eimir.db.session import get_session
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind, SupportReportState
from eimir.support_reports.payload import ClientContext, FailureReference, SupportReportPayload

BASE = "/api/v1/server-admin/support-reports"
SECRET_NOTE = "private-note-text-must-stay-out-of-lists"
SECRET_REPLY = "private-reply-text-must-stay-out-of-the-audit"
CREATED = datetime(2026, 11, 24, 8, 0, tzinfo=UTC)
OPERATOR_ID = uuid4()


def _report(report_id: UUID | None = None, *, state: str = "NEW") -> SupportReport:
    return SupportReport(
        id=report_id or uuid4(),
        account_id=uuid4(),
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM.value,
        state=state,
        created_at=CREATED,
        payload=SupportReportPayload(
            note=SECRET_NOTE,
            failure=FailureReference(
                reference="GET:/api/v1/plans:500:INTERNAL:app", request_id="r"
            ),
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


class Harness:
    """A router-only app whose dependencies and service are doubles."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.report = _report()
        self.reply: service.ReporterReply | None = None
        self.enabled = True
        self.stale = False
        self.calls: list[str] = []
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
        monkeypatch.setattr(routes, "_replied_report_ids", lambda session, ids: set())
        monkeypatch.setattr(routes, "_tickets_by_report", lambda session, ids: {})
        monkeypatch.setattr(service, "get_report", self._get_report)
        monkeypatch.setattr(service, "count_new", lambda session: 4)
        monkeypatch.setattr(service, "list_reports", self._list_reports)
        monkeypatch.setattr(service, "set_state", self._set_state)
        monkeypatch.setattr(service, "send_reply", self._send_reply)
        monkeypatch.setattr(service, "get_reply", lambda session, **_: self.reply)
        monkeypatch.setattr(recent_auth, "require_grant", self._require_grant)
        monkeypatch.setattr(
            administration,
            "record_action",
            lambda session, **kwargs: self.audit.append(kwargs),
        )

    def _require_grant(self, *_: Any, **__: Any) -> None:
        if self.stale:
            raise ForbiddenError("Recent authentication is required.", "RECENT_REQUIRED")

    def _get_report(self, session: object, report_id: UUID) -> SupportReport | None:
        self.calls.append("get_report")
        return self.report if report_id == self.report.id else None

    def _list_reports(self, session: object, **kwargs: Any) -> service.Page[SupportReport]:
        self.calls.append(f"list:{kwargs['state']}:{kwargs['limit']}")
        return service.Page(items=[self.report], next_cursor="next", has_more=True)

    def _set_state(
        self, session: object, report_id: UUID, state: SupportReportState
    ) -> SupportReport:
        self.calls.append(f"set_state:{state.value}")
        if report_id != self.report.id:
            raise NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)
        self.report.state = state.value
        return self.report

    def _send_reply(self, session: object, **kwargs: Any) -> SupportReport:
        self.calls.append("send_reply")
        if kwargs["report_id"] != self.report.id:
            raise NotFoundError("Support report not found.", service.REPORT_NOT_FOUND)
        if self.reply is not None:
            raise ConflictError("The report already has a reply.", service.REPLY_ALREADY_SENT)
        assert kwargs["operator_id"] == OPERATOR_ID
        self.reply = service.ReporterReply(
            text=kwargs["text"], replied_at=CREATED, reported_at=CREATED
        )
        return self.report


@pytest.fixture
def harness(monkeypatch: pytest.MonkeyPatch) -> Harness:
    return Harness(monkeypatch)


def test_the_list_has_triage_facts_and_never_the_note(harness: Harness) -> None:
    response = harness.client.get(f"{BASE}?state=NEW&limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["newCount"] == 4
    assert body["hasMore"] is True
    assert body["nextCursor"] == "next"
    assert SECRET_NOTE not in response.text
    assert body["items"][0]["appVersion"] == "0.2.0"
    assert harness.calls == ["list:NEW:10"]


def test_the_list_limit_and_state_are_validated(harness: Harness) -> None:
    assert harness.client.get(f"{BASE}?limit=0").status_code == 422
    assert harness.client.get(f"{BASE}?limit=101").status_code == 422
    assert harness.client.get(f"{BASE}?state=DONE").status_code == 422
    assert harness.calls == []


def test_every_route_is_a_404_while_the_switch_is_off(harness: Harness) -> None:
    harness.enabled = False
    report_id = harness.report.id

    responses = [
        harness.client.get(BASE),
        harness.client.get(f"{BASE}/{report_id}"),
        harness.client.put(f"{BASE}/{report_id}/state", json={"state": "CLOSED"}),
        harness.client.post(f"{BASE}/{report_id}/reply", json={"text": "Thanks"}),
    ]

    assert [response.status_code for response in responses] == [404, 404, 404, 404]
    assert harness.calls == []
    assert harness.audit == []


def test_responses_are_no_store(harness: Harness) -> None:
    report_id = harness.report.id

    responses = [
        harness.client.get(BASE),
        harness.client.get(f"{BASE}/{report_id}"),
        harness.client.put(f"{BASE}/{report_id}/state", json={"state": "CLOSED"}),
        harness.client.post(f"{BASE}/{report_id}/reply", json={"text": "Thanks"}),
    ]

    for response in responses:
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "private, no-store"


def test_the_detail_carries_the_note_and_the_account_id(harness: Harness) -> None:
    response = harness.client.get(f"{BASE}/{harness.report.id}")

    body = response.json()
    assert body["note"] == SECRET_NOTE
    assert body["accountId"] == str(harness.report.account_id)
    assert body["reply"] is None
    assert body["ticketAvailable"] is False


def test_unknown_and_malformed_ids_are_404_without_audit(harness: Harness) -> None:
    for identifier in (uuid4(), "not-a-uuid"):
        for response in (
            harness.client.get(f"{BASE}/{identifier}"),
            harness.client.put(f"{BASE}/{identifier}/state", json={"state": "CLOSED"}),
            harness.client.post(f"{BASE}/{identifier}/reply", json={"text": "Thanks"}),
        ):
            assert response.status_code == 404
            assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert harness.audit == []


def test_a_state_change_is_audited_without_content(harness: Harness) -> None:
    response = harness.client.put(f"{BASE}/{harness.report.id}/state", json={"state": "CLOSED"})

    assert response.status_code == 200
    assert response.json()["state"] == "CLOSED"
    assert harness.audit == [
        {
            "actor_id": OPERATOR_ID,
            "action": AdministrationAction.SUPPORT_REPORT_STATE_SET,
            "target_account_id": harness.report.account_id,
        }
    ]


def test_a_reply_is_stored_once_and_audited_without_its_text(harness: Harness) -> None:
    first = harness.client.post(
        f"{BASE}/{harness.report.id}/reply", json={"text": f"  {SECRET_REPLY}  "}
    )
    second = harness.client.post(f"{BASE}/{harness.report.id}/reply", json={"text": "Again"})

    assert first.status_code == 200
    assert first.json()["reply"]["text"] == SECRET_REPLY
    assert first.json()["hasReply"] is True
    assert second.status_code == 409
    assert second.json()["code"] == service.REPLY_ALREADY_SENT
    assert harness.audit == [
        {
            "actor_id": OPERATOR_ID,
            "action": AdministrationAction.SUPPORT_REPORT_REPLY_SENT,
            "target_account_id": harness.report.account_id,
        }
    ]
    assert SECRET_REPLY not in str(harness.audit)
    assert SECRET_NOTE not in str(harness.audit)


def test_a_reply_over_500_characters_never_reaches_the_service(harness: Harness) -> None:
    response = harness.client.post(f"{BASE}/{harness.report.id}/reply", json={"text": "x" * 501})

    assert response.status_code == 422
    assert response.json()["code"] == ErrorCode.VALIDATION_FAILED
    assert harness.calls == []
    assert harness.audit == []


def test_stale_authentication_changes_and_audits_nothing(harness: Harness) -> None:
    harness.stale = True
    report_id = harness.report.id

    state = harness.client.put(f"{BASE}/{report_id}/state", json={"state": "CLOSED"})
    reply = harness.client.post(f"{BASE}/{report_id}/reply", json={"text": "Thanks"})
    read = harness.client.get(f"{BASE}/{report_id}")

    assert state.status_code == 403
    assert reply.status_code == 403
    assert read.status_code == 200
    assert "set_state:CLOSED" not in harness.calls
    assert "send_reply" not in harness.calls
    assert harness.audit == []
