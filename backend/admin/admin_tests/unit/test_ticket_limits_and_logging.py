"""Tracker body limit, outcome logging and client lifecycle need no database (#2189)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import httpx
import pytest

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.support_tickets import service
from eimir_admin.tracker import github
from eimir_admin.tracker.base import TrackerError

from eimir.core.errors import ValidationError
from eimir.support_reports.payload import ClientContext, SupportReportPayload

REPORT_ID = uuid4()
SECRET_NOTE = "private-note-text-must-never-be-logged"


class FakeSession:
    """Just enough of a session for the paths that stop before any write."""

    def __init__(self, report: Any) -> None:
        self._report = report
        self.committed = False
        self.added: list[Any] = []

    def get(self, model: Any, identifier: Any) -> Any:
        return self._report

    def execute(self, statement: Any) -> Any:
        return SimpleNamespace(scalar_one_or_none=lambda: None)

    def add(self, row: Any) -> None:
        self.added.append(row)

    def commit(self) -> None:
        self.committed = True


class CountingTracker:
    name = "github"

    def __init__(self) -> None:
        self.calls = 0

    def create_issue(self, *, title: str, body: str, labels: Any) -> Any:
        self.calls += 1
        raise AssertionError("must not be called")


def _stored_report() -> Any:
    payload = SupportReportPayload(
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
    )
    return SimpleNamespace(id=REPORT_ID, kind="PROBLEM", account_id=uuid4(), payload=payload)


def test_a_body_the_footer_pushes_over_the_tracker_limit_is_refused_before_reserving(
    caplog: pytest.LogCaptureFixture,
) -> None:
    session = FakeSession(_stored_report())
    tracker = CountingTracker()
    caplog.set_level("INFO", logger=service.log.name)

    with pytest.raises(ValidationError) as raised:
        service.create_ticket(
            session,  # type: ignore[arg-type]
            tracker,
            report_id=REPORT_ID,
            title="private-title-text",
            body="b" * 65536,
            operator_id=uuid4(),
        )

    assert raised.value.code == service.TICKET_TOO_LONG
    assert tracker.calls == 0
    assert session.added == []
    assert session.committed is False
    [record] = caplog.records
    assert (record.outcome, record.report_id) == (  # type: ignore[attr-defined]
        "refused_too_long",
        str(REPORT_ID),
    )
    for text in ("private-title-text", "bbbbbbbb", SECRET_NOTE):
        assert text not in caplog.text


def test_the_github_adapter_closes_the_client_it_opened(monkeypatch: pytest.MonkeyPatch) -> None:
    closed: list[bool] = []

    class FakeClient:
        def __init__(self, **_: Any) -> None:
            pass

        def post(self, *_: Any, **__: Any) -> Any:
            raise httpx.ConnectError("boom")

        def close(self) -> None:
            closed.append(True)

    monkeypatch.setattr(httpx, "Client", FakeClient)
    tracker = github.GitHubIssueTracker("example/tickets", "t")

    with pytest.raises(TrackerError):
        tracker.create_issue(title="t", body="b", labels=())

    assert closed == [True]
