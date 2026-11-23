"""Creation, replay, paging and triage of support reports (#2189)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core.errors import BadRequestError, ConflictError, NotFoundError, ValidationError
from eimir.support_reports import service
from eimir.support_reports.models import (
    SupportReport,
    SupportReportKind,
    SupportReportReplyRow,
    SupportReportState,
)
from eimir.support_reports.payload import ClientContext, FailureReference, SupportReportPayload
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _payload(note: str | None = "The list did not load.", **changes: Any) -> SupportReportPayload:
    return SupportReportPayload(
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
        **changes,
    )


def _count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(SupportReport)).scalar_one()


def test_create_is_idempotent_by_client_request_id(session: Session) -> None:
    account = make_account(session)
    request_id = uuid4()
    payload = _payload(
        failure=FailureReference(reference="GET:/api/v1/plans:500", request_id="r-1")
    )

    first, created = service.create_report(
        session,
        account_id=account.id,
        client_request_id=request_id,
        kind=SupportReportKind.PROBLEM,
        payload=payload,
    )
    again, created_again = service.create_report(
        session,
        account_id=account.id,
        client_request_id=request_id,
        kind=SupportReportKind.PROBLEM,
        payload=payload,
    )

    assert created is True
    assert created_again is False
    assert again.id == first.id
    assert _count(session) == 1
    assert first.state == "NEW"
    assert first.closed_at is None
    assert first.account_id == account.id
    assert first.payload == payload


def test_replay_with_different_payload_conflicts(session: Session) -> None:
    account = make_account(session)
    request_id = uuid4()
    service.create_report(
        session,
        account_id=account.id,
        client_request_id=request_id,
        kind=SupportReportKind.PROBLEM,
        payload=_payload(),
    )

    with pytest.raises(ConflictError):
        service.create_report(
            session,
            account_id=account.id,
            client_request_id=request_id,
            kind=SupportReportKind.PROBLEM,
            payload=_payload(note="Something else."),
        )
    with pytest.raises(ConflictError):
        service.create_report(
            session,
            account_id=account.id,
            client_request_id=request_id,
            kind=SupportReportKind.FEEDBACK,
            payload=_payload(),
        )
    assert _count(session) == 1


def test_same_request_id_of_two_accounts_creates_two_reports(session: Session) -> None:
    request_id = uuid4()
    reports = [
        service.create_report(
            session,
            account_id=make_account(session, name).id,
            client_request_id=request_id,
            kind=SupportReportKind.PROBLEM,
            payload=_payload(),
        )
        for name in ("Anna", "Ben")
    ]
    assert [created for _, created in reports] == [True, True]
    assert reports[0][0].id != reports[1][0].id


def test_set_state_closed_sets_closed_at(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    account = make_account(session)
    report, _ = service.create_report(
        session,
        account_id=account.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=_payload(),
    )
    closed_at = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(clock, "now", lambda: closed_at)

    closed = service.set_state(session, report.id, SupportReportState.CLOSED)
    assert closed.state == "CLOSED"
    assert closed.closed_at == closed_at

    # Closing again keeps the original time, so retention is not extended.
    monkeypatch.setattr(clock, "now", lambda: closed_at + timedelta(days=3))
    assert service.set_state(session, report.id, SupportReportState.CLOSED).closed_at == closed_at

    reopened = service.set_state(session, report.id, SupportReportState.IN_PROGRESS)
    assert reopened.state == "IN_PROGRESS"
    assert reopened.closed_at is None
    session.expire_all()
    stored = service.get_report(session, report.id)
    assert stored is not None
    assert stored.closed_at is None


def test_set_state_of_unknown_report_is_not_found(session: Session) -> None:
    with pytest.raises(NotFoundError):
        service.set_state(session, uuid4(), SupportReportState.CLOSED)
    assert service.get_report(session, uuid4()) is None


def test_list_filters_by_state(session: Session) -> None:
    account = make_account(session)
    made = [
        service.create_report(
            session,
            account_id=account.id,
            client_request_id=uuid4(),
            kind=SupportReportKind.PROBLEM,
            payload=_payload(note=f"Note {index}"),
        )[0]
        for index in range(3)
    ]
    service.set_state(session, made[0].id, SupportReportState.CLOSED)
    service.set_state(session, made[1].id, SupportReportState.IN_PROGRESS)

    def ids(state: SupportReportState | None) -> set[object]:
        page = service.list_reports(session, state=state, limit=50, cursor=None)
        return {report.id for report in page.items}

    assert ids(SupportReportState.NEW) == {made[2].id}
    assert ids(SupportReportState.IN_PROGRESS) == {made[1].id}
    assert ids(SupportReportState.CLOSED) == {made[0].id}
    assert ids(None) == {report.id for report in made}


def test_list_pages_newest_first_with_a_bound_cursor(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    account = make_account(session)
    base = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
    made = []
    for index in range(3):
        monkeypatch.setattr(clock, "now", lambda index=index: base + timedelta(minutes=index))
        made.append(
            service.create_report(
                session,
                account_id=account.id,
                client_request_id=uuid4(),
                kind=SupportReportKind.PROBLEM,
                payload=_payload(note=f"Note {index}"),
            )[0]
        )

    first = service.list_reports(session, state=None, limit=2, cursor=None)
    assert [report.id for report in first.items] == [made[2].id, made[1].id]
    assert first.has_more is True
    assert first.next_cursor is not None

    second = service.list_reports(session, state=None, limit=2, cursor=first.next_cursor)
    assert [report.id for report in second.items] == [made[0].id]
    assert second.has_more is False
    assert second.next_cursor is None

    # A cursor is bound to the filter it was issued for.
    with pytest.raises(BadRequestError):
        service.list_reports(
            session, state=SupportReportState.NEW, limit=2, cursor=first.next_cursor
        )


def test_payload_is_stored_in_the_protected_envelope(session: Session, encryption: Any) -> None:
    encryption.apply("required")
    account = make_account(session)
    report, _ = service.create_report(
        session,
        account_id=account.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=_payload(note="A very private sentence."),
    )
    stored, version = session.execute(
        text("SELECT payload::text, crypto_version FROM support_reports WHERE id = :id"),
        {"id": report.id},
    ).one()
    assert "A very private sentence." not in stored
    assert version == 2
    session.expire_all()
    loaded = service.get_report(session, report.id)
    assert loaded is not None
    assert loaded.payload.note == "A very private sentence."


# --- reply -----------------------------------------------------------------


def _report(session: Session, account_id: Any) -> SupportReport:
    report, _ = service.create_report(
        session,
        account_id=account_id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=_payload(),
    )
    return report


def _reply_rows(session: Session) -> int:
    return session.execute(select(func.count()).select_from(SupportReportReplyRow)).scalar_one()


def test_reply_is_stored_once(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    account = make_account(session)
    report = _report(session, account.id)
    reported_at = report.created_at
    replied_at = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(clock, "now", lambda: replied_at)

    returned = service.send_reply(
        session, report_id=report.id, text="  Thank you, fixed.  ", operator_id=uuid4()
    )

    assert returned.id == report.id
    assert _reply_rows(session) == 1
    reply = service.get_reply(session, report_id=report.id, account_id=account.id)
    assert reply is not None
    assert reply.text == "Thank you, fixed."
    assert reply.replied_at == replied_at
    assert reply.reported_at == reported_at
    stored = session.execute(select(SupportReportReplyRow)).scalar_one()
    assert stored.replied_at == replied_at
    assert stored.payload.replied_at == replied_at


def test_second_reply_conflicts(session: Session) -> None:
    account = make_account(session)
    report = _report(session, account.id)
    service.send_reply(session, report_id=report.id, text="First.", operator_id=None)

    with pytest.raises(ConflictError):
        service.send_reply(session, report_id=report.id, text="Second.", operator_id=None)

    assert _reply_rows(session) == 1
    reply = service.get_reply(session, report_id=report.id, account_id=account.id)
    assert reply is not None
    assert reply.text == "First."


def test_reply_to_an_unknown_report_is_not_found(session: Session) -> None:
    with pytest.raises(NotFoundError):
        service.send_reply(session, report_id=uuid4(), text="Hello.", operator_id=None)
    assert _reply_rows(session) == 0


def test_reply_does_not_change_state(session: Session) -> None:
    account = make_account(session)
    report = _report(session, account.id)
    closed = service.set_state(session, report.id, SupportReportState.CLOSED)
    closed_at = closed.closed_at

    service.send_reply(session, report_id=report.id, text="Done.", operator_id=None)

    session.expire_all()
    stored = service.get_report(session, report.id)
    assert stored is not None
    assert stored.state == "CLOSED"
    assert stored.closed_at == closed_at


def test_reply_over_500_is_rejected(session: Session) -> None:
    account = make_account(session)
    report = _report(session, account.id)

    with pytest.raises(ValidationError):
        service.send_reply(session, report_id=report.id, text="x" * 501, operator_id=None)

    assert _reply_rows(session) == 0
    # Exactly 500 characters is accepted.
    service.send_reply(session, report_id=report.id, text="x" * 500, operator_id=None)
    assert _reply_rows(session) == 1


def test_get_reply_is_limited_to_the_reporter(session: Session) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    report = _report(session, anna.id)
    assert service.get_reply(session, report_id=report.id, account_id=anna.id) is None
    service.send_reply(session, report_id=report.id, text="Hello.", operator_id=None)

    assert service.get_reply(session, report_id=report.id, account_id=anna.id) is not None
    assert service.get_reply(session, report_id=report.id, account_id=ben.id) is None
    assert service.get_reply(session, report_id=uuid4(), account_id=anna.id) is None


def test_reply_payload_is_stored_in_the_protected_envelope(
    session: Session, encryption: Any
) -> None:
    encryption.apply("required")
    account = make_account(session)
    report = _report(session, account.id)
    service.send_reply(session, report_id=report.id, text="A private answer.", operator_id=None)

    stored, version = session.execute(
        text("SELECT payload::text, crypto_version FROM support_report_replies")
    ).one()
    assert "A private answer." not in stored
    assert version == 2
    session.expire_all()
    reply = service.get_reply(session, report_id=report.id, account_id=account.id)
    assert reply is not None
    assert reply.text == "A private answer."
