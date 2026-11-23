"""Catalog and event contract of the support reply notice, without a database (#2189)."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.dialects import postgresql

from eimir.authorization import AuthorizationContext
from eimir.domain.events import EventType
from eimir.engagement import notification_policy
from eimir.engagement import service as engagement_service
from eimir.engagement.models import COALESCED_NOTIFICATION_KINDS, Notification, NotificationKind
from eimir.support_reports import service


def test_support_reply_is_push_only_and_never_an_email() -> None:
    kind = NotificationKind.SUPPORT_REPLY.value
    assert notification_policy.push_choice_allowed(kind)
    assert not notification_policy.email_choice_allowed(kind)


def test_support_reply_never_coalesces() -> None:
    assert NotificationKind.SUPPORT_REPLY.value not in COALESCED_NOTIFICATION_KINDS


def test_reply_event_carries_references_only() -> None:
    report_id = uuid4()
    reporter_id = uuid4()
    space_id = uuid4()

    event = service.reply_event(report_id=report_id, reporter_id=reporter_id, space_id=space_id)

    assert event.type is EventType.SUPPORT_REPLY
    assert event.space_id == space_id
    assert event.subject_type == service.REPLY_SUBJECT_TYPE == "support_report"
    assert event.subject_id == report_id
    # The notice is attributed to the team, never to an operator account.
    assert event.actor_id is None
    # Only the recipient travels; no reply text and no report content.
    assert event.payload.model_dump(exclude_none=True) == {"recipient_id": reporter_id}


def test_projection_matches_the_subject_the_reply_event_carries() -> None:
    # The producer's constant decides; a renamed subject must not silently
    # stop the notice.
    event = service.reply_event(report_id=uuid4(), reporter_id=uuid4(), space_id=uuid4())
    assert engagement_service._is_support_report_subject(event.subject_type)
    assert not engagement_service._is_support_report_subject("transfer_export")


def test_support_report_target_is_current_only_for_its_reporter() -> None:
    context = AuthorizationContext(account_id=uuid4(), space_id=uuid4())
    report_id = uuid4()

    own = engagement_service._support_report_is_own(context, report_id)
    sql = str(own.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    assert "support_reports.account_id = " + f"'{context.account_id}'" in sql
    assert f"support_reports.id = '{report_id}'" in sql
    # Not Space content: the Space never decides who may see the notice.
    assert str(context.space_id) not in sql


def test_notification_predicate_has_a_support_report_clause() -> None:
    context = AuthorizationContext(account_id=uuid4(), space_id=uuid4())
    predicate = engagement_service._projectable_predicate(
        Notification.target_type,
        Notification.target_id,
        context,
        None,  # type: ignore[arg-type]
        notification_kind_column=Notification.kind,
    )
    sql = str(
        predicate.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True})
    )
    assert "notifications.target_type = 'SUPPORT_REPORT'" in sql
    assert f"support_reports.account_id = '{context.account_id}'" in sql


def test_reporter_space_is_the_most_recent_active_membership() -> None:
    sql = str(
        service.reporter_space_statement(uuid4()).compile(dialect=postgresql.dialect())
    ).lower()
    assert "memberships.status =" in sql
    assert "order by memberships.joined_at desc nulls last" in sql
    assert "memberships.created_at desc" in sql
    assert "limit" in sql
