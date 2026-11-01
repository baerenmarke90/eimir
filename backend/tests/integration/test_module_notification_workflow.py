"""Real PostgreSQL admission, disclosure, expiry and recipient acceptance."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.domain.events import EventType
from eimir.engagement import notification_preferences
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.outbox.models import OutboxEvent
from eimir.relationship.models import SpaceConfiguration
from eimir.transfer import jobs as transfer_jobs
from eimir.transfer.models import ExportStatus, TransferExport
from eimir.wish_selections import service as selections
from eimir.wishes import service as wishes
from tests.conftest import auth, requires_database
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import grant, path

pytestmark = [pytest.mark.integration, requires_database]


def project(session):  # type: ignore[no-untyped-def]
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def rows(session, kind):  # type: ignore[no-untyped-def]
    return list(session.scalars(select(Notification).where(Notification.kind == kind.value)))


def test_shared_questions_use_space_day_for_both_partners_and_emit_nothing(
    client, session, actors, monkeypatch
):  # type: ignore[no-untyped-def]
    grant(session, actors["space"].id, actors["a"].id)
    config = session.scalar(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == actors["space"].id)
    )
    if config is None:
        config = SpaceConfiguration(space_id=actors["space"].id)
        session.add(config)
    config.daily_context_timezone = "Europe/Berlin"
    actors["b"].timezone = "America/Los_Angeles"
    session.flush()
    before = session.scalar(select(func.count()).select_from(OutboxEvent))
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 11, 1, 23, 30, tzinfo=UTC))
    url = path(actors, "experiences/HAPPINESS/questions")
    a = client.get(url, headers=auth(actors["token_a"]))
    b = client.get(url, headers=auth(actors["token_b"]))
    assert a.status_code == b.status_code == 200
    assert a.json() == b.json()
    assert a.json()["localDate"] == "2026-11-02"
    assert len(set(a.json()["questionIds"])) == 3
    assert a.headers["cache-control"] == "private, no-store"
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 11, 2, 23, 30, tzinfo=UTC))
    changed = client.get(url, headers=auth(actors["token_b"]))
    assert not set(a.json()["questionIds"]) & set(changed.json()["questionIds"])
    assert client.get(url, headers=auth(actors["token_outsider"])).status_code == 404
    assert session.scalar(select(func.count()).select_from(OutboxEvent)) == before


def test_plan_content_edits_stay_silent_but_imminent_schedule_changes_notify_once(
    client, session, actors
):  # type: ignore[no-untyped-def]
    url = path(actors, "plans")
    start = clock.now() + timedelta(hours=10)
    created = client.post(
        url,
        headers=auth(actors["token_a"]),
        json={"title": "Private plan title", "schedule": {"plannedStart": start.isoformat()}},
    )
    assert created.status_code == 201, created.text
    plan = created.json()
    project(session)
    notice = rows(session, NotificationKind.PLAN_CREATED)
    assert len(notice) == 1 and notice[0].recipient_account_id == actors["b"].id
    assert session.scalar(select(func.count()).select_from(PushDelivery)) == 0
    headers = {**auth(actors["token_a"]), "If-Match": f'"{plan["version"]}"'}
    edited = client.patch(
        f"{url}/{plan['id']}", headers=headers, json={"description": "Only words"}
    )
    assert edited.status_code == 200, edited.text
    project(session)
    assert not rows(session, NotificationKind.PLAN_CHANGED)
    headers["If-Match"] = f'"{edited.json()["version"]}"'
    moved = client.patch(
        f"{url}/{plan['id']}",
        headers=headers,
        json={"schedule": {"plannedStart": (start + timedelta(hours=1)).isoformat()}},
    )
    assert moved.status_code == 200, moved.text
    project(session)
    project(session)
    notices = rows(session, NotificationKind.PLAN_CHANGED)
    assert len(notices) == 1 and notices[0].expires_at is not None
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.event_type == EventType.PLAN_ATTENDANCE_CHANGED.value)
    )
    assert "Private plan title" not in event.payload.model_dump_json()
    context = AuthorizationContext(actors["b"].id, actors["space"].id)
    assert engagement.notification_target_available(session, notices[0], context)
    notices[0].expires_at = clock.now() - timedelta(seconds=1)
    session.flush()
    assert not engagement.notification_target_available(session, notices[0], context)
    assert notices[0].id not in [
        item.id for item in engagement.read_notifications(session, context).items
    ]


def test_wish_round_invitation_never_discloses_single_partner_publication(session, actors):  # type: ignore[no-untyped-def]
    a = AuthorizationContext(actors["a"].id, actors["space"].id)
    b = AuthorizationContext(actors["b"].id, actors["space"].id)
    sources = [wishes.create_wish(session, a, title=f"Idea {i}") for i in range(2)]
    current = selections.replace_round(
        session,
        a,
        expected_token="absent",
        wish_ids=[item.id for item in sources],
        title="Our time",
    )
    project(session)
    assert len(rows(session, NotificationKind.WISH_SELECTION_SHARED)) == 1
    selections.update_own_selection(
        session,
        a,
        expected_token=current.selection_token,
        favorite_wish_ids=[sources[0].id],
        published=True,
    )
    project(session)
    assert not rows(session, NotificationKind.WISH_SELECTION_READY)
    current_b = selections.get_selection(session, b)
    selections.update_own_selection(
        session,
        b,
        expected_token=current_b.selection_token,
        favorite_wish_ids=[sources[0].id],
        published=True,
    )
    project(session)
    project(session)
    ready = rows(session, NotificationKind.WISH_SELECTION_READY)
    assert len(ready) == 1 and ready[0].recipient_account_id == a.account_id
    current_a = selections.get_selection(session, a)
    selections.update_own_selection(
        session, a, expected_token=current_a.selection_token, favorite_wish_ids=[], published=False
    )
    assert not engagement.notification_target_available(session, ready[0], a)


def test_unscheduling_an_imminent_plan_notifies_only_partner_and_keeps_no_deleted_title(
    client, session, actors
):  # type: ignore[no-untyped-def]
    url = path(actors, "plans")
    created = client.post(
        url,
        headers=auth(actors["token_a"]),
        json={
            "title": "Synthetic private plan title",
            "schedule": {"plannedStart": (clock.now() + timedelta(hours=2)).isoformat()},
        },
    )
    assert created.status_code == 201
    source = created.json()
    removed = client.post(
        f"{url}/{source['id']}/unschedule",
        json={},
        headers={**auth(actors["token_a"]), "If-Match": f'"{source["version"]}"'},
    )
    assert removed.status_code == 200, removed.text
    project(session)
    project(session)
    notices = rows(session, NotificationKind.PLAN_CANCELLED)
    assert len(notices) == 1
    assert notices[0].recipient_account_id == actors["b"].id
    assert notices[0].target_type is None and notices[0].expires_at is not None
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.event_type == EventType.PLAN_CANCELLED.value)
    )
    assert "Synthetic private plan title" not in event.payload.model_dump_json()


def test_transfer_outcome_is_owner_only_and_expires(session, actors):  # type: ignore[no-untyped-def]
    transfer = TransferExport(
        space_id=actors["space"].id,
        created_by=actors["a"].id,
        scope="PERSONAL",
        status=ExportStatus.READY.value,
        expires_at=clock.now() + timedelta(hours=1),
    )
    session.add(transfer)
    session.flush()
    transfer_jobs._record_outcome(session, transfer, EventType.TRANSFER_READY)
    project(session)
    assert len(rows(session, NotificationKind.TRANSFER_READY)) == 1
    a = AuthorizationContext(actors["a"].id, actors["space"].id)
    b = AuthorizationContext(actors["b"].id, actors["space"].id)
    assert len(engagement.read_notifications(session, a).items) == 1
    assert not engagement.read_notifications(session, b).items
    transfer.expires_at = clock.now() - timedelta(seconds=1)
    assert not engagement.read_notifications(session, a).items


def test_existing_channel_opt_outs_are_inherited_for_new_workflows(session, actors):  # type: ignore[no-untyped-def]
    notification_preferences.set_push_enabled(
        session, account_id=actors["b"].id, kind=NotificationKind.REMINDER_DUE, enabled=False
    )
    assert not notification_preferences.push_enabled(
        session, account_id=actors["b"].id, kind=NotificationKind.PLAN_CHANGED.value
    )
    assert not notification_preferences.own_push_choices(session, account_id=actors["b"].id)[
        NotificationKind.PLAN_CHANGED
    ]


def test_external_open_resolves_hidden_center_item_only_for_its_recipient(client, session, actors):  # type: ignore[no-untyped-def]
    from eimir.memories import service as memories

    memory = memories.create_memory(
        session,
        AuthorizationContext(actors["a"].id, actors["space"].id),
        title="Shared source",
        body="Synthetic words",
        happened_on=None,
    )
    notification = Notification(
        space_id=actors["space"].id,
        recipient_account_id=actors["b"].id,
        actor_id=actors["a"].id,
        source_event_id=memory.id,
        target_type="MEMORY",
        target_id=memory.id,
        kind=NotificationKind.COUPLE_EXPERIENCE_SHARED.value,
        in_app_visible=False,
    )
    session.add(notification)
    session.flush()
    url = path(actors, f"notifications/{notification.id}")
    assert client.post(url + "/read", headers=auth(actors["token_b"])).status_code == 404
    assert client.post(url + "/open", headers=auth(actors["token_a"])).status_code == 404
    opened = client.post(url + "/open", headers=auth(actors["token_b"]))
    assert opened.status_code == 200, opened.text
    assert opened.json()["targetId"] == str(memory.id)
    assert opened.json()["readAt"] is not None
    assert not engagement.read_notifications(
        session, AuthorizationContext(actors["b"].id, actors["space"].id)
    ).items
