"""The ServerAdmin overview carries the support-report signal (#2189)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind, SupportReportState
from eimir.support_reports.payload import ClientContext, SupportReportPayload
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "support-operator@example.test"
OVERVIEW = "/api/v1/server-admin/overview"
SECRET_NOTE = "private-report-note-must-not-leak"


@pytest.fixture
def server_admin_allowlist(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def reports_enabled(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin_token(session: Session) -> str:
    account = make_account(session, "Support operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=ADMIN_EMAIL,
            is_primary=True,
            verified_at=now(),
        )
    )
    session.flush()
    return sign_in(session, account)


def _report(
    session: Session,
    account_id: UUID,
    *,
    age: timedelta = timedelta(0),
    state: SupportReportState = SupportReportState.NEW,
    note: str = "The list did not load.",
) -> SupportReport:
    report, _ = service.create_report(
        session,
        account_id=account_id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note=note,
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
    report.created_at = now() - age
    if state is not SupportReportState.NEW:
        service.set_state(session, report.id, state)
    session.flush()
    return report


def _overview(client: Any, token: str) -> dict[str, Any]:
    response = client.get(OVERVIEW, headers=auth(token))
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def test_overview_counts_new_reports(
    client: Any, session: Session, server_admin_allowlist: None, reports_enabled: None
) -> None:
    token = _admin_token(session)
    assert _overview(client, token)["supportReportsNew"] == 0

    reporter = make_account(session, "Anna")
    _report(session, reporter.id)
    _report(session, reporter.id)
    _report(session, reporter.id, state=SupportReportState.IN_PROGRESS)
    _report(session, reporter.id, state=SupportReportState.CLOSED)

    assert _overview(client, token)["supportReportsNew"] == 2


def test_warning_only_when_enabled_and_older_than_14_days(
    client: Any,
    session: Session,
    server_admin_allowlist: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = _admin_token(session)
    reporter = make_account(session, "Anna")
    old = _report(session, reporter.id, age=timedelta(days=15))

    # Feature off: the count stays 0 and there is no warning, however old.
    disabled = _overview(client, token)
    assert disabled["supportReportsNew"] == 0
    assert "support_reports_unread" not in disabled["warningCodes"]

    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true")
    get_settings.cache_clear()
    try:
        stale = _overview(client, token)
        assert stale["supportReportsNew"] == 1
        assert "support_reports_unread" in stale["warningCodes"]

        # Once the old report is triaged, only a recent NEW report is left.
        service.set_state(session, old.id, SupportReportState.IN_PROGRESS)
        _report(session, reporter.id, age=timedelta(days=13))
        recent = _overview(client, token)
        assert recent["supportReportsNew"] == 1
        assert "support_reports_unread" not in recent["warningCodes"]
    finally:
        get_settings.cache_clear()


def test_overview_exposes_no_report_content(
    client: Any, session: Session, server_admin_allowlist: None, reports_enabled: None
) -> None:
    token = _admin_token(session)
    reporter = make_account(session, "Anna")
    report = _report(session, reporter.id, age=timedelta(days=20), note=SECRET_NOTE)

    response = client.get(OVERVIEW, headers=auth(token))

    assert response.status_code == 200
    assert SECRET_NOTE not in response.text
    assert str(report.id) not in response.text
    assert str(reporter.id) not in response.text
    assert "support_reports_unread" in response.json()["warningCodes"]


def test_overview_reports_no_operator_plugin_with_core_only(
    client: Any, session: Session, server_admin_allowlist: None, reports_enabled: None
) -> None:
    from eimir.plugins import loader

    previous = loader._loaded
    loader._loaded = loader.LoadedPlugins(())
    try:
        token = _admin_token(session)
        assert _overview(client, token)["supportReportsOperatorAvailable"] is False
    finally:
        loader._loaded = previous
