"""A support reply produces exactly one notice for the reporter (#2189)."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import ConflictError, NotFoundError
from eimir.domain.events import EventType
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind
from eimir.support_reports.payload import ClientContext, SupportReportPayload
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

REPLY_TEXT = "Thank you, this is fixed in the next version."
NOTE = "The list did not load."


def _report(session: Session, account_id: UUID) -> SupportReport:
    report, _ = service.create_report(
        session,
        account_id=account_id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note=NOTE,
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
    return report


def _reply_events(session: Session, report_id: UUID) -> list[OutboxEvent]:
    return list(
        session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == EventType.SUPPORT_REPLY.value,
                OutboxEvent.subject_id == report_id,
            )
        ).scalars()
    )


def _project_all(session: Session, report_id: UUID) -> None:
    session.flush()
    for event in _reply_events(session, report_id):
        engagement.project_event(session, event)
    session.flush()


def _notifications(session: Session) -> list[Notification]:
    return list(
        session.execute(
            select(Notification).where(Notification.kind == NotificationKind.SUPPORT_REPLY.value)
        ).scalars()
    )


def test_reply_creates_one_notification_for_reporter(session: Session) -> None:
    reporter = make_account(session, "Anna")
    operator = make_account(session, "Operator")
    space = make_space(session, reporter)
    report = _report(session, reporter.id)

    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=operator.id)
    events = _reply_events(session, report.id)
    _project_all(session, report.id)

    assert len(events) == 1
    event = events[0]
    assert event.space_id == space.id
    assert event.actor_id is None
    assert event.subject_type == "support_report"
    assert event.payload.recipient_id == reporter.id
    serialized = event.payload.model_dump_json()
    assert REPLY_TEXT not in serialized
    assert NOTE not in serialized

    (notice,) = _notifications(session)
    assert notice.recipient_account_id == reporter.id
    assert notice.space_id == space.id
    assert notice.actor_id is None
    assert notice.target_type == EngagementTarget.SUPPORT_REPORT.value
    assert notice.target_id == report.id
    assert notice.source_event_id == event.id

    context = AuthorizationContext(account_id=reporter.id, space_id=space.id)
    page = engagement.read_notifications(session, context)
    assert [item.id for item in page.items] == [notice.id]
    assert engagement.unread_count(session, context) == 1
    assert engagement.notification_target_available(session, notice, context)


def test_reply_uses_the_most_recent_active_space(session: Session) -> None:
    reporter = make_account(session, "Anna")
    older = make_space(session, reporter)
    founder = make_account(session, "Ben")
    newer = make_space(session, founder)
    relationship_service.add_member(session, newer.id, reporter)
    session.execute(
        update(Membership)
        .where(Membership.space_id == older.id, Membership.account_id == reporter.id)
        .values(joined_at=now() - timedelta(days=30))
    )
    session.execute(
        update(Membership)
        .where(Membership.space_id == newer.id, Membership.account_id == reporter.id)
        .values(joined_at=now())
    )
    report = _report(session, reporter.id)

    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=None)

    (event,) = _reply_events(session, report.id)
    assert event.space_id == newer.id


def test_replay_does_not_duplicate_notification(session: Session) -> None:
    reporter = make_account(session, "Anna")
    make_space(session, reporter)
    report = _report(session, reporter.id)
    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=None)

    _project_all(session, report.id)
    _project_all(session, report.id)
    with pytest.raises(ConflictError):
        service.send_reply(session, report_id=report.id, text="Again.", operator_id=None)
    _project_all(session, report.id)

    assert len(_reply_events(session, report.id)) == 1
    assert len(_notifications(session)) == 1


def test_reporter_without_active_space_gets_stored_reply_but_no_notification(
    session: Session,
) -> None:
    reporter = make_account(session, "Anna")
    report = _report(session, reporter.id)

    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=None)
    _project_all(session, report.id)

    reply = service.get_reply(session, report_id=report.id, account_id=reporter.id)
    assert reply is not None
    assert reply.text == REPLY_TEXT
    assert _reply_events(session, report.id) == []
    assert _notifications(session) == []


def test_deleted_reporter_is_rejected(session: Session) -> None:
    reporter = make_account(session, "Anna")
    make_space(session, reporter)
    report = _report(session, reporter.id)
    report_id = report.id
    session.flush()

    apply_accepted_tombstone(session, reporter.id, accepted_at=now())
    apply_core_cleanup(session, reporter.id)
    session.flush()
    session.expire_all()

    with pytest.raises(NotFoundError):
        service.send_reply(session, report_id=report_id, text=REPLY_TEXT, operator_id=None)
    assert _reply_events(session, report_id) == []
    assert session.execute(select(func.count()).select_from(Notification)).scalar_one() == 0


def test_operator_who_reported_gets_own_notification(session: Session) -> None:
    operator = make_account(session, "Operator")
    make_space(session, operator)
    report = _report(session, operator.id)

    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=operator.id)
    _project_all(session, report.id)

    (notice,) = _notifications(session)
    assert notice.recipient_account_id == operator.id
    assert notice.actor_id is None


def test_other_account_never_sees_notification(session: Session) -> None:
    reporter = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, reporter)
    relationship_service.add_member(session, space.id, partner)
    report = _report(session, reporter.id)

    service.send_reply(session, report_id=report.id, text=REPLY_TEXT, operator_id=None)
    _project_all(session, report.id)

    (notice,) = _notifications(session)
    assert notice.recipient_account_id == reporter.id
    partner_context = AuthorizationContext(account_id=partner.id, space_id=space.id)
    assert engagement.read_notifications(session, partner_context).items == []
    assert engagement.unread_count(session, partner_context) == 0
    assert not engagement.notification_target_available(session, notice, partner_context)
    # The projection rule itself refuses the partner as a recipient.
    assert not engagement._target_is_projectable(
        session, partner_context, EngagementTarget.SUPPORT_REPORT, report.id
    )
    assert engagement._target_is_projectable(
        session,
        AuthorizationContext(account_id=reporter.id, space_id=space.id),
        EngagementTarget.SUPPORT_REPORT,
        report.id,
    )
