"""Create and clear tracker tickets against a real database (#2189).

A fake ``IssueTracker`` stands in for the tracker; nothing here talks to a
network. Most tests share the test transaction (the Core ``client`` fixture). The
two tests at the end use the real request unit of work (``production_client``),
because only separate committed transactions can show that the reservation
survives a failed tracker call and that concurrent creates call the tracker once.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterator, Sequence
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api import support_reports as routes
from eimir_admin.support_tickets.models import SupportReportTicket, TicketState
from eimir_admin.tracker.base import TicketRef, TrackerError

from eimir.administration.models import AdministrationAction, InstanceAdministrationActionEvent
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind
from eimir.support_reports.payload import (
    ClientContext,
    FailureReference,
    SupportReportPayload,
)
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/server-admin/support-reports"
ADMIN_EMAIL = "support-operator@example.test"
SECRET_NOTE = "private-report-note-must-not-reach-the-tracker"
SECRET_REPLY = "private-reply-text-must-not-reach-the-tracker"
TOKEN_VALUE = "tracker-token-must-never-appear"
NO_STORE = "private, no-store"
ISSUE_URL = "https://github.com/example/tickets/issues/42"
TYPED = {"title": "Plans fail to load", "body": "Reproduced on the test instance."}


class FakeTracker:
    """Records every call; can fail, block or run a hook while the call is 'in flight'."""

    name = "github"

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.error: TrackerError | None = None
        self.in_flight: Callable[[], None] | None = None
        self._lock = threading.Lock()

    def create_issue(self, *, title: str, body: str, labels: Sequence[str]) -> TicketRef:
        with self._lock:
            self.calls.append({"title": title, "body": body, "labels": tuple(labels)})
            number = len(self.calls) + 41
        if self.in_flight is not None:
            self.in_flight()
        if self.error is not None:
            raise self.error
        return TicketRef(url=f"https://github.com/example/tickets/issues/{number}", number=number)


@pytest.fixture
def tracker(monkeypatch: pytest.MonkeyPatch) -> FakeTracker:
    fake = FakeTracker()
    monkeypatch.setattr(routes, "_configured_tracker", lambda: fake)
    return fake


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


def _operator(session: Session) -> tuple[Account, str]:
    account = make_account(session, "Support operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    token = sign_in(session, account)
    return account, token


def _report(session: Session, *, note: str | None = SECRET_NOTE) -> SupportReport:
    reporter = make_account(session, "Private Reporter Name")
    report, _ = service.create_report(
        session,
        account_id=reporter.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note=note,
            failure=FailureReference(
                reference="GET:/api/v1/plans:500:INTERNAL_ERROR:app", request_id="req-7"
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
    return report


def _links(session: Session, report_id: UUID) -> list[SupportReportTicket]:
    session.expire_all()
    return list(
        session.execute(
            select(SupportReportTicket).where(SupportReportTicket.report_id == report_id)
        ).scalars()
    )


def _audit(
    session: Session, action: AdministrationAction
) -> list[InstanceAdministrationActionEvent]:
    return list(
        session.execute(
            select(InstanceAdministrationActionEvent).where(
                InstanceAdministrationActionEvent.action == action.value
            )
        ).scalars()
    )


def _post(client: Any, token: str, report_id: object, payload: dict[str, Any] = TYPED) -> Any:
    return client.post(f"{BASE}/{report_id}/ticket", json=payload, headers=auth(token))


def _delete(client: Any, token: str, report_id: object) -> Any:
    return client.delete(f"{BASE}/{report_id}/ticket", headers=auth(token))


def test_create_ticket_happy_path_records_audit(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    operator, token = _operator(session)
    report = _report(session)

    response = _post(client, token, report.id)

    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == NO_STORE
    created = dict(response.json())
    assert created.pop("createdAt")
    assert created == {
        "tracker": "github",
        "state": "CREATED",
        "url": "https://github.com/example/tickets/issues/42",
        "number": 42,
    }
    [link] = _links(session, report.id)
    assert (link.state, link.url, link.number, link.tracker) == (
        TicketState.CREATED.value,
        ISSUE_URL,
        42,
        "github",
    )
    [call] = tracker.calls
    assert call["title"] == "Plans fail to load"
    assert call["labels"] == ("support-report",)
    assert call["body"].startswith("Reproduced on the test instance.")
    for fact in ("PROBLEM", "0.2.0", "123", "app", "req-7", str(report.id)):
        assert fact in call["body"]
    assert "GET:/api/v1/plans:500:INTERNAL_ERROR:app" in call["body"]
    audit = _audit(session, AdministrationAction.SUPPORT_REPORT_TICKET_CREATED)
    assert [(e.actor_id, e.target_account_id) for e in audit] == [(operator.id, report.account_id)]
    detail = client.get(f"{BASE}/{report.id}", headers=auth(token)).json()
    assert detail["ticket"] == response.json()


def test_body_never_contains_stored_note_or_reply(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)
    report = _report(session, note=SECRET_NOTE)
    service.send_reply(session, report_id=report.id, text=SECRET_REPLY, operator_id=None)

    response = _post(client, token, report.id)

    assert response.status_code == 201
    [call] = tracker.calls
    outgoing = f"{call['title']}\n{call['body']}\n{call['labels']}"
    assert SECRET_NOTE not in outgoing
    assert SECRET_REPLY not in outgoing
    assert "Private Reporter Name" not in outgoing
    assert str(report.account_id) not in outgoing
    assert SECRET_NOTE not in response.text
    # Positive control: what the operator types does reach the tracker.
    other = _report(session)
    typed = {"title": "Typed", "body": f"operator quotes {SECRET_NOTE}"}
    assert _post(client, token, other.id, typed).status_code == 201
    assert SECRET_NOTE in tracker.calls[1]["body"]


def test_second_create_returns_conflict_with_existing_link_and_no_second_call(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)
    report = _report(session)
    first = _post(client, token, report.id)

    second = _post(client, token, report.id, {"title": "Again", "body": ""})

    assert first.status_code == 201
    assert second.status_code == 409
    body = second.json()
    assert body["code"] == "SUPPORT_TICKET_EXISTS"
    assert body["ticket"] == first.json()
    assert second.headers["cache-control"] == NO_STORE
    assert len(tracker.calls) == 1
    assert len(_links(session, report.id)) == 1


def test_tracker_failure_leaves_pending_row_and_502(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)
    report = _report(session)
    tracker.error = TrackerError("tracker rejected the request (HTTP 503)", retryable=True)

    response = _post(client, token, report.id)

    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "SUPPORT_TICKET_FAILED"
    assert body["retryable"] is True
    assert response.headers["cache-control"] == NO_STORE
    for secret in (TOKEN_VALUE, "503", TYPED["title"], TYPED["body"]):
        assert secret not in response.text
    [link] = _links(session, report.id)
    assert (link.state, link.url, link.number) == (TicketState.PENDING.value, None, None)
    assert _audit(session, AdministrationAction.SUPPORT_REPORT_TICKET_CREATED) == []

    tracker.error = TrackerError("tracker rejected the request (HTTP 422)", retryable=False)
    other = _report(session)
    assert _post(client, token, other.id).json()["retryable"] is False


def test_retry_after_failure_is_refused_until_cleared(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)
    report = _report(session)
    tracker.error = TrackerError("timeout", retryable=True)
    assert _post(client, token, report.id).status_code == 502
    tracker.error = None

    blind_retry = _post(client, token, report.id)

    assert blind_retry.status_code == 409
    assert blind_retry.json()["code"] == "SUPPORT_TICKET_EXISTS"
    assert blind_retry.json()["ticket"]["state"] == "PENDING"
    assert len(tracker.calls) == 1

    assert _delete(client, token, report.id).status_code == 204
    retry = _post(client, token, report.id)

    assert retry.status_code == 201
    assert retry.json()["state"] == "CREATED"
    assert len(tracker.calls) == 2
    [link] = _links(session, report.id)
    assert link.state == TicketState.CREATED.value


def test_clear_deletes_row_and_records_audit(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    operator, token = _operator(session)
    report = _report(session)
    assert _post(client, token, report.id).status_code == 201

    response = _delete(client, token, report.id)

    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["cache-control"] == NO_STORE
    assert _links(session, report.id) == []
    audit = _audit(session, AdministrationAction.SUPPORT_REPORT_TICKET_CLEARED)
    assert [(e.actor_id, e.target_account_id) for e in audit] == [(operator.id, report.account_id)]
    detail = client.get(f"{BASE}/{report.id}", headers=auth(token)).json()
    assert detail["ticket"] is None
    # A link that is gone cannot be cleared again.
    again = _delete(client, token, report.id)
    assert again.status_code == 404
    assert again.json()["code"] == "SUPPORT_TICKET_NOT_FOUND"
    assert len(_audit(session, AdministrationAction.SUPPORT_REPORT_TICKET_CLEARED)) == 1


def test_not_configured_is_409_and_hides_button_flag(client: Any, session: Session) -> None:
    _, token = _operator(session)
    report = _report(session)

    response = _post(client, token, report.id)

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPORT_TICKET_NOT_CONFIGURED"
    assert _links(session, report.id) == []
    detail = client.get(f"{BASE}/{report.id}", headers=auth(token)).json()
    assert detail["ticketAvailable"] is False


def test_title_and_body_limits(client: Any, session: Session, tracker: FakeTracker) -> None:
    _, token = _operator(session)
    report = _report(session)

    refused = [
        _post(client, token, report.id, {"title": "", "body": ""}),
        _post(client, token, report.id, {"title": "   ", "body": ""}),
        _post(client, token, report.id, {"title": "t" * 257, "body": ""}),
        _post(client, token, report.id, {"title": "t", "body": "b" * 65537}),
        _post(client, token, report.id, {"title": "t"}),
    ]

    assert [response.status_code for response in refused] == [422] * 5
    assert tracker.calls == []
    assert _links(session, report.id) == []
    # The footer counts against the tracker's 65,536 characters: a body at the
    # wire limit is refused before anything is reserved or sent.
    too_long = _post(client, token, report.id, {"title": "t", "body": "b" * 65536})
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "SUPPORT_TICKET_TOO_LONG"
    assert tracker.calls == []
    assert _links(session, report.id) == []
    accepted = _post(client, token, report.id, {"title": "t" * 256, "body": "b" * 65000})
    assert accepted.status_code == 201
    assert len(tracker.calls[0]["title"]) == 256
    assert len(tracker.calls[0]["body"]) <= 65536
    empty_body = _report(session)
    assert _post(client, token, empty_body.id, {"title": "t", "body": ""}).status_code == 201


def test_report_deleted_while_pending_is_404(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)
    report = _report(session)
    report_id = report.id

    def delete_report() -> None:
        # The retention job or an account deletion removes the report mid-call;
        # the link row cascades with it.
        session.execute(delete(SupportReport).where(SupportReport.id == report_id))

    tracker.in_flight = delete_report

    response = _post(client, token, report_id)

    assert response.status_code == 404
    assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert _links(session, report_id) == []
    assert _audit(session, AdministrationAction.SUPPORT_REPORT_TICKET_CREATED) == []


def test_a_unique_violation_on_the_reservation_is_the_existing_link(session: Session) -> None:
    from eimir_admin.support_tickets import service as tickets

    report = _report(session)
    reserved = tickets._reserve(session, report_id=report.id, tracker_name="github")

    with pytest.raises(tickets.TicketExistsError) as raised:
        tickets._reserve(session, report_id=report.id, tracker_name="github")

    assert raised.value.ticket.id == reserved.id
    # The failed insert left the session usable.
    assert len(_links(session, report.id)) == 1


def test_a_foreign_key_violation_on_the_reservation_is_a_missing_report(session: Session) -> None:
    from eimir_admin.support_tickets import service as tickets

    from eimir.core.errors import NotFoundError

    with pytest.raises(NotFoundError) as raised:
        tickets._reserve(session, report_id=uuid4(), tracker_name="github")

    assert raised.value.code == service.REPORT_NOT_FOUND


def test_unknown_report_is_404_without_calling_the_tracker(
    client: Any, session: Session, tracker: FakeTracker
) -> None:
    _, token = _operator(session)

    for identifier in (uuid4(), "not-a-uuid", "0"):
        for response in (_post(client, token, identifier), _delete(client, token, identifier)):
            assert response.status_code == 404, identifier
            assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert tracker.calls == []


def test_non_admin_is_403(client: Any, session: Session, tracker: FakeTracker) -> None:
    report = _report(session)
    token = sign_in(session, make_account(session, "Ordinary person"))

    for response in (_post(client, token, report.id), _delete(client, token, report.id)):
        assert response.status_code == 403
        assert response.json()["code"] == "SERVER_ADMIN_REQUIRED"
    assert tracker.calls == []


def test_anonymous_is_401(client: Any, session: Session, tracker: FakeTracker) -> None:
    report = _report(session)

    create = client.post(f"{BASE}/{report.id}/ticket", json=TYPED)
    clear = client.delete(f"{BASE}/{report.id}/ticket")

    assert (create.status_code, clear.status_code) == (401, 401)
    assert tracker.calls == []


@pytest.mark.usefixtures("reports_disabled")
def test_feature_off_is_404(client: Any, session: Session, tracker: FakeTracker) -> None:
    _, token = _operator(session)
    report = _report(session)

    for response in (_post(client, token, report.id), _delete(client, token, report.id)):
        assert response.status_code == 404
        assert response.json()["code"] == service.REPORT_NOT_FOUND
    assert tracker.calls == []


def test_the_token_never_appears_in_any_response(
    client: Any, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, token = _operator(session)
    report = _report(session)
    monkeypatch.setenv("EIMIR_ADMIN_TRACKER", "github")
    monkeypatch.setenv("EIMIR_ADMIN_GITHUB_REPOSITORY", "example/tickets")
    monkeypatch.setenv("EIMIR_ADMIN_GITHUB_TOKEN", TOKEN_VALUE)
    detail = client.get(f"{BASE}/{report.id}", headers=auth(token))
    fake = FakeTracker()
    fake.error = TrackerError("transport error", retryable=True)
    monkeypatch.setattr(routes, "_configured_tracker", lambda: fake)

    failed = _post(client, token, report.id)

    assert detail.json()["ticketAvailable"] is True
    for response in (detail, failed):
        assert TOKEN_VALUE not in response.text


# The two tests below use the real request unit of work: every request gets its
# own session and committed transactions, as in production. Only CI with
# PostgreSQL can run them.


def _committed_setup(maker: sessionmaker[Session]) -> tuple[str, UUID]:
    with maker() as setup:
        _, token = _operator(setup)
        report_id = _report(setup).id
        setup.commit()
    return token, report_id


def test_the_pending_row_survives_a_failed_request_in_the_real_unit_of_work(
    production_client: Any, tracker: FakeTracker
) -> None:
    test_client, maker = production_client
    token, report_id = _committed_setup(maker)
    tracker.error = TrackerError("tracker rejected the request (HTTP 500)", retryable=True)

    response = _post(test_client, token, report_id)

    assert response.status_code == 502
    with maker() as other:
        [link] = _links(other, report_id)
        assert link.state == TicketState.PENDING.value
        assert other.execute(select(func.count()).select_from(SupportReportTicket)).scalar() == 1
    tracker.error = None
    assert _post(test_client, token, report_id).status_code == 409
    assert len(tracker.calls) == 1


def test_two_concurrent_creates_call_the_tracker_once(
    production_client: Any, tracker: FakeTracker
) -> None:
    test_client, maker = production_client
    token, report_id = _committed_setup(maker)
    in_flight = threading.Event()
    release = threading.Event()

    def hold() -> None:
        # The first request is inside the tracker call while the second one arrives.
        in_flight.set()
        assert release.wait(timeout=20)

    tracker.in_flight = hold
    results: list[Any] = []

    def create() -> None:
        results.append(_post(test_client, token, report_id))

    first = threading.Thread(target=create)
    first.start()
    assert in_flight.wait(timeout=20)
    second = threading.Thread(target=create)
    second.start()
    second.join(timeout=20)
    release.set()
    first.join(timeout=20)

    assert sorted(response.status_code for response in results) == [201, 409]
    assert len(tracker.calls) == 1
    loser = next(response for response in results if response.status_code == 409)
    assert loser.json()["code"] == "SUPPORT_TICKET_EXISTS"
    with maker() as other:
        [link] = _links(other, report_id)
        assert link.state == TicketState.CREATED.value
        assert len(_audit(other, AdministrationAction.SUPPORT_REPORT_TICKET_CREATED)) == 1


def test_outcomes_are_logged_without_any_text(
    client: Any, session: Session, tracker: FakeTracker, caplog: pytest.LogCaptureFixture
) -> None:
    _, token = _operator(session)
    report = _report(session, note=SECRET_NOTE)
    service.send_reply(session, report_id=report.id, text=SECRET_REPLY, operator_id=None)
    failing = _report(session)
    caplog.set_level("INFO", logger="eimir_admin.support_tickets.service")

    assert _post(client, token, report.id).status_code == 201
    assert _post(client, token, report.id).status_code == 409
    tracker.error = TrackerError("rejected", retryable=False)
    assert _post(client, token, failing.id).status_code == 502

    records = [r for r in caplog.records if r.name == "eimir_admin.support_tickets.service"]
    assert [(r.outcome, r.retryable) for r in records] == [  # type: ignore[attr-defined]
        ("created", None),
        ("refused_exists", None),
        ("tracker_failed", False),
    ]
    assert [r.report_id for r in records] == [  # type: ignore[attr-defined]
        str(report.id),
        str(report.id),
        str(failing.id),
    ]
    for text in (TYPED["title"], TYPED["body"], SECRET_NOTE, SECRET_REPLY):
        assert text not in caplog.text


def test_reply_to_a_reporter_without_membership_stores_it_and_sends_no_notice(
    client: Any, session: Session
) -> None:
    from eimir.domain.events import EventType
    from eimir.outbox.models import OutboxEvent
    from eimir.relationship.models import Membership

    _, token = _operator(session)
    report = _report(session)
    memberships = session.execute(
        select(Membership).where(Membership.account_id == report.account_id)
    ).first()
    assert memberships is None

    response = client.post(
        f"{BASE}/{report.id}/reply", json={"text": "We fixed it."}, headers=auth(token)
    )

    assert response.status_code == 200
    assert response.json()["reply"]["text"] == "We fixed it."
    stored = service.get_reply(session, report_id=report.id, account_id=report.account_id)
    assert stored is not None
    assert stored.text == "We fixed it."
    events = session.execute(
        select(OutboxEvent).where(
            OutboxEvent.event_type == EventType.SUPPORT_REPLY.value,
            OutboxEvent.subject_id == report.id,
        )
    ).all()
    assert events == []
