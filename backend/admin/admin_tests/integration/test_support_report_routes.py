"""The operator routes for support reports against a real database (#2189).

Reports are created through the Core service, as the reporter's endpoint does.
The operator is a verified, allow-listed ServerAdmin; writes additionally need a
recent-authentication grant.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.support_tickets.models import SupportReportTicket, TicketState

from eimir.administration.models import AdministrationAction, InstanceAdministrationActionEvent
from eimir.auth import recent_auth
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail, DeviceSession
from eimir.plugins import loader
from eimir.support_reports import service
from eimir.support_reports.models import (
    SupportReport,
    SupportReportKind,
    SupportReportReplyRow,
    SupportReportState,
)
from eimir.support_reports.payload import (
    ClientContext,
    FailureReference,
    SupportReportPayload,
)
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/server-admin/support-reports"
ADMIN_EMAIL = "support-operator@example.test"
REPORTER_EMAIL = "reporter-private@example.test"
SECRET_NOTE = "private-report-note-must-not-leak"
SECRET_REPLY = "private-reply-text-must-not-reach-the-audit"
NO_STORE = "private, no-store"


@pytest.fixture(autouse=True)
def server_admin_allowlist(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true")
    monkeypatch.delenv("EIMIR_ADMIN_TRACKER", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def reports_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "false")
    get_settings.cache_clear()


def _operator(session: Session, *, recent: bool) -> tuple[Account, str]:
    account = make_account(session, "Support operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    token = sign_in(session, account)
    if recent:
        device_session = session.execute(
            select(DeviceSession).where(DeviceSession.account_id == account.id)
        ).scalar_one()
        recent_auth.issue_grant(
            session,
            account,
            device_session,
            purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
            method=recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD,
        )
    return account, token


def _reporter(session: Session, email: str | None = None) -> Account:
    account: Account = make_account(session, "Private Reporter Name")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=email or f"reporter-{uuid4().hex[:12]}@example.test",
            is_primary=True,
            verified_at=now(),
        )
    )
    session.flush()
    return account


def _report(
    session: Session,
    *,
    account: Account | None = None,
    note: str | None = SECRET_NOTE,
    state: SupportReportState = SupportReportState.NEW,
    failure: bool = True,
) -> SupportReport:
    reporter = account or _reporter(session)
    report, _ = service.create_report(
        session,
        account_id=reporter.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note=note,
            failure=(
                FailureReference(
                    reference="GET:/api/v1/plans:500:INTERNAL_ERROR:app", request_id="req-7"
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
    if state is not SupportReportState.NEW:
        service.set_state(session, report.id, state)
    return report


def _audit(session: Session) -> list[InstanceAdministrationActionEvent]:
    return list(
        session.execute(
            select(InstanceAdministrationActionEvent).where(
                InstanceAdministrationActionEvent.action.like("support_report.%")
            )
        ).scalars()
    )


def _requests(report_id: object) -> list[tuple[str, str, dict[str, Any] | None]]:
    return [
        ("GET", BASE, None),
        ("GET", f"{BASE}/{report_id}", None),
        ("PUT", f"{BASE}/{report_id}/state", {"state": "CLOSED"}),
        ("POST", f"{BASE}/{report_id}/reply", {"text": "Thanks"}),
    ]


def test_non_admin_is_403(client: Any, session: Session) -> None:
    report = _report(session)
    token = sign_in(session, make_account(session, "Ordinary person"))

    for method, path, body in _requests(report.id):
        response = client.request(method, path, json=body, headers=auth(token))
        assert response.status_code == 403, (method, path)
        assert response.json()["code"] == "SERVER_ADMIN_REQUIRED"


def test_anonymous_is_401(client: Any, session: Session) -> None:
    report = _report(session)

    for method, path, body in _requests(report.id):
        response = client.request(method, path, json=body)
        assert response.status_code == 401, (method, path)
        assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_stale_authentication_is_refused_on_writes(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=False)
    report = _report(session)

    state = client.put(f"{BASE}/{report.id}/state", json={"state": "CLOSED"}, headers=auth(token))
    reply = client.post(f"{BASE}/{report.id}/reply", json={"text": "Thanks"}, headers=auth(token))

    for response in (state, reply):
        assert response.status_code == 403
        assert response.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED
    session.refresh(report)
    assert report.state == SupportReportState.NEW.value
    assert (
        session.execute(
            select(SupportReportReplyRow).where(SupportReportReplyRow.report_id == report.id)
        ).scalar_one_or_none()
        is None
    )
    assert _audit(session) == []
    # Reading needs no recent authentication.
    assert client.get(BASE, headers=auth(token)).status_code == 200


@pytest.mark.usefixtures("reports_disabled")
def test_feature_off_is_404(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)
    report = _report(session)

    for method, path, body in _requests(report.id):
        response = client.request(method, path, json=body, headers=auth(token))
        assert response.status_code == 404, (method, path)
        assert response.json()["code"] == service.REPORT_NOT_FOUND
    session.refresh(report)
    assert report.state == SupportReportState.NEW.value
    assert _audit(session) == []


@pytest.mark.usefixtures("reports_disabled")
def test_feature_off_does_not_tell_a_non_admin_anything(client: Any, session: Session) -> None:
    token = sign_in(session, make_account(session, "Ordinary person"))

    response = client.get(BASE, headers=auth(token))

    assert response.status_code == 403


def test_list_filters_by_state_and_never_returns_note_text(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=False)
    new = _report(session)
    progress = _report(session, state=SupportReportState.IN_PROGRESS)
    closed = _report(session, state=SupportReportState.CLOSED)
    service.send_reply(session, report_id=progress.id, text="Hello", operator_id=None)

    everything = client.get(BASE, headers=auth(token))
    only_closed = client.get(f"{BASE}?state=CLOSED", headers=auth(token))

    assert everything.status_code == 200
    body = everything.json()
    assert {item["id"] for item in body["items"]} == {str(new.id), str(progress.id), str(closed.id)}
    assert body["newCount"] == 1
    assert body["hasMore"] is False
    assert body["nextCursor"] is None
    item = next(entry for entry in body["items"] if entry["id"] == str(progress.id))
    assert set(item) == {
        "id",
        "kind",
        "state",
        "createdAt",
        "failureReference",
        "appVersion",
        "build",
        "hasReply",
        "ticket",
    }
    assert item["hasReply"] is True
    assert item["failureReference"] == "GET:/api/v1/plans:500:INTERNAL_ERROR:app"
    assert item["appVersion"] == "0.2.0"
    assert item["build"] == "123"
    assert next(e for e in body["items"] if e["id"] == str(new.id))["hasReply"] is False
    for response in (everything, only_closed):
        assert SECRET_NOTE not in response.text
    assert [entry["id"] for entry in only_closed.json()["items"]] == [str(closed.id)]
    # The unread count is not narrowed by the list filter.
    assert only_closed.json()["newCount"] == 1


def test_list_pagination_cursor_is_bound_to_state(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=False)
    ids = [_report(session).id for _ in range(3)]

    first = client.get(f"{BASE}?limit=2", headers=auth(token)).json()
    assert len(first["items"]) == 2
    assert first["hasMore"] is True
    cursor = first["nextCursor"]
    assert cursor
    second = client.get(f"{BASE}?limit=2&cursor={cursor}", headers=auth(token)).json()
    assert second["hasMore"] is False
    assert second["nextCursor"] is None
    seen = [UUID(entry["id"]) for entry in first["items"] + second["items"]]
    assert sorted(seen) == sorted(ids)
    assert len(set(seen)) == 3

    other_state = client.get(f"{BASE}?limit=2&state=CLOSED&cursor={cursor}", headers=auth(token))
    assert other_state.status_code == 400
    assert other_state.json()["code"] == "INVALID_CURSOR"
    forged = client.get(f"{BASE}?cursor=not-a-cursor", headers=auth(token))
    assert forged.status_code == 400


def test_detail_returns_note_and_account_id_but_no_email(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=False)
    reporter = _reporter(session, REPORTER_EMAIL)
    report = _report(session, account=reporter)

    response = client.get(f"{BASE}/{report.id}", headers=auth(token))

    assert response.status_code == 200
    body = response.json()
    assert body["note"] == SECRET_NOTE
    assert body["accountId"] == str(reporter.id)
    assert body["failureReference"] == "GET:/api/v1/plans:500:INTERNAL_ERROR:app"
    assert body["requestId"] == "req-7"
    assert body["client"]["appVersion"] == "0.2.0"
    assert body["client"]["timeZone"] == "Europe/Berlin"
    assert body["reply"] is None
    assert body["ticket"] is None
    assert body["ticketAvailable"] is False
    assert REPORTER_EMAIL not in response.text
    assert "Private Reporter Name" not in response.text


def test_detail_shows_the_ticket_link_and_availability(
    client: Any, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, token = _operator(session, recent=False)
    report = _report(session)
    session.add(
        SupportReportTicket(
            report_id=report.id,
            tracker="github",
            url="https://github.com/example/tickets/issues/7",
            number=7,
            state=TicketState.CREATED.value,
        )
    )
    session.flush()
    monkeypatch.setenv("EIMIR_ADMIN_TRACKER", "github")
    monkeypatch.setenv("EIMIR_ADMIN_GITHUB_REPOSITORY", "example/tickets")
    monkeypatch.setenv("EIMIR_ADMIN_GITHUB_TOKEN", "test-token-value")

    detail = client.get(f"{BASE}/{report.id}", headers=auth(token)).json()
    listing = client.get(BASE, headers=auth(token)).json()

    expected = {
        "tracker": "github",
        "state": "CREATED",
        "url": "https://github.com/example/tickets/issues/7",
        "number": 7,
    }
    assert detail["ticket"].pop("createdAt")
    assert detail["ticket"] == expected
    assert detail["ticketAvailable"] is True
    assert listing["items"][0]["ticket"].pop("createdAt")
    assert listing["items"][0]["ticket"] == expected
    assert "test-token-value" not in str(detail)


def test_set_state_records_audit_and_sets_closed_at(client: Any, session: Session) -> None:
    operator, token = _operator(session, recent=True)
    report = _report(session)

    closed = client.put(f"{BASE}/{report.id}/state", json={"state": "CLOSED"}, headers=auth(token))

    assert closed.status_code == 200
    assert closed.json()["state"] == "CLOSED"
    assert closed.json()["note"] == SECRET_NOTE
    session.refresh(report)
    assert report.state == "CLOSED"
    assert report.closed_at is not None
    audit = _audit(session)
    assert [(e.action, e.actor_id, e.target_account_id) for e in audit] == [
        (AdministrationAction.SUPPORT_REPORT_STATE_SET.value, operator.id, report.account_id)
    ]

    reopened = client.put(
        f"{BASE}/{report.id}/state", json={"state": "IN_PROGRESS"}, headers=auth(token)
    )
    assert reopened.status_code == 200
    session.refresh(report)
    assert report.state == "IN_PROGRESS"
    assert report.closed_at is None
    assert len(_audit(session)) == 2
    invalid = client.put(f"{BASE}/{report.id}/state", json={"state": "DONE"}, headers=auth(token))
    assert invalid.status_code == 422
    assert len(_audit(session)) == 2


def test_reply_stores_once_and_second_is_409(client: Any, session: Session) -> None:
    operator, token = _operator(session, recent=True)
    report = _report(session)

    first = client.post(
        f"{BASE}/{report.id}/reply", json={"text": "  We fixed it.  "}, headers=auth(token)
    )
    second = client.post(
        f"{BASE}/{report.id}/reply", json={"text": "Another answer"}, headers=auth(token)
    )

    assert first.status_code == 200
    assert first.json()["hasReply"] is True
    assert first.json()["reply"]["text"] == "We fixed it."
    assert first.json()["reply"]["repliedAt"]
    assert first.json()["state"] == "NEW"
    assert second.status_code == 409
    assert second.json()["code"] == service.REPLY_ALREADY_SENT
    stored = service.get_reply(session, report_id=report.id, account_id=report.account_id)
    assert stored is not None
    assert stored.text == "We fixed it."
    audit = _audit(session)
    assert [(e.action, e.actor_id) for e in audit] == [
        (AdministrationAction.SUPPORT_REPORT_REPLY_SENT.value, operator.id)
    ]
    detail = client.get(f"{BASE}/{report.id}", headers=auth(token)).json()
    assert detail["reply"]["text"] == "We fixed it."


def test_reply_on_closed_report_works_once(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)
    report = _report(session, state=SupportReportState.CLOSED)

    first = client.post(f"{BASE}/{report.id}/reply", json={"text": "Done."}, headers=auth(token))
    second = client.post(f"{BASE}/{report.id}/reply", json={"text": "Again."}, headers=auth(token))

    assert first.status_code == 200
    assert first.json()["state"] == "CLOSED"
    assert second.status_code == 409


def test_reply_over_500_chars_is_422(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)
    report = _report(session)

    too_long = client.post(
        f"{BASE}/{report.id}/reply", json={"text": "x" * 501}, headers=auth(token)
    )
    blank = client.post(f"{BASE}/{report.id}/reply", json={"text": "   "}, headers=auth(token))
    unknown_field = client.post(
        f"{BASE}/{report.id}/reply", json={"text": "ok", "operatorId": "x"}, headers=auth(token)
    )
    exact = client.post(f"{BASE}/{report.id}/reply", json={"text": "y" * 500}, headers=auth(token))

    assert too_long.status_code == 422
    assert blank.status_code == 422
    assert unknown_field.status_code == 422
    assert exact.status_code == 200
    # Only the accepted reply is audited.
    assert len(_audit(session)) == 1


def test_unknown_report_is_404(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)

    for identifier in (uuid4(), "not-a-uuid", "0"):
        for method, path, body in _requests(identifier)[1:]:
            response = client.request(method, path, json=body, headers=auth(token))
            assert response.status_code == 404, (method, path)
            assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert _audit(session) == []


def test_audit_entry_contains_no_text(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)
    report = _report(session)

    client.put(f"{BASE}/{report.id}/state", json={"state": "IN_PROGRESS"}, headers=auth(token))
    client.post(f"{BASE}/{report.id}/reply", json={"text": SECRET_REPLY}, headers=auth(token))

    audit = _audit(session)
    assert len(audit) == 2
    allowed = {
        "id",
        "actor_id",
        "target_account_id",
        "target_space_id",
        "action",
        "effect_count",
        "created_at",
    }
    columns = {column.key for column in InstanceAdministrationActionEvent.__table__.columns}
    assert columns == allowed
    for entry in audit:
        values = " ".join(str(getattr(entry, name)) for name in sorted(allowed))
        assert SECRET_REPLY not in values
        assert SECRET_NOTE not in values
        assert entry.target_space_id is None
        assert entry.effect_count is None


def test_responses_are_no_store(client: Any, session: Session) -> None:
    _, token = _operator(session, recent=True)
    report = _report(session)

    responses = [
        client.get(BASE, headers=auth(token)),
        client.get(f"{BASE}/{report.id}", headers=auth(token)),
        client.put(f"{BASE}/{report.id}/state", json={"state": "CLOSED"}, headers=auth(token)),
        client.post(f"{BASE}/{report.id}/reply", json={"text": "Thanks"}, headers=auth(token)),
    ]

    for response in responses:
        assert response.status_code == 200
        assert response.headers["cache-control"] == NO_STORE


def test_routes_absent_without_the_plugin(client: Any, session: Session) -> None:
    from fastapi.testclient import TestClient

    from eimir.db.session import get_session
    from eimir.main import create_app
    from tests.support.plugins import pro_distribution_installed

    _, token = _operator(session, recent=True)
    report = _report(session)
    only_pro = (
        tuple(plugin for plugin in loader.loaded_plugins().plugins if plugin.name == "pro")
        if pro_distribution_installed()
        else ()
    )
    admin_loaded = loader._loaded
    loader._loaded = loader.LoadedPlugins(only_pro)
    try:
        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        bare = TestClient(app, raise_server_exceptions=False)
        for method, path, body in _requests(report.id):
            response = bare.request(method, path, json=body, headers=auth(token))
            assert response.status_code == 404, (method, path)
    finally:
        loader._loaded = admin_loaded
    # With the plugin loaded the same request is served.
    assert client.get(BASE, headers=auth(token)).status_code == 200
