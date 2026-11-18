"""Push notices for shared notes never carry the note's words (#1969)."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from eimir.engagement import push, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.outbox.models import OutboxEvent
from tests.conftest import auth, requires_database
from tests.integration.test_shared_notes_api import (
    SECRET_BODY,
    SECRET_TITLE,
    create_note,
    if_match,
    path,
)
from tests.integration.test_shared_notes_api import couple as couple  # fixture
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def partner_device(session: Session, couple):  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("note-push-test", provider)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="note-push-test",
        endpoint_value="secret-note-push-test",
    )
    yield provider
    push.providers.clear()


def _project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def _deliveries(session: Session) -> list[PushDelivery]:
    return list(session.scalars(select(PushDelivery).order_by(PushDelivery.created_at)))


def _send_pending(session: Session) -> None:
    for delivery in _deliveries(session):
        if delivery.status == "PENDING":
            push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()


def _edit(client, couple, note, version: int, text: str) -> None:  # type: ignore[no-untyped-def]
    changed = client.patch(
        f"{path(couple['space'].id)}/{note['id']}",
        json={"body": text},
        headers=if_match(couple["token_a"], version),
    )
    assert changed.status_code == 200, changed.text


def _partner_reads_everything(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    session.execute(
        update(Notification)
        .where(Notification.recipient_account_id == couple["ben"].id)
        .values(read_at=datetime.now(UTC))
    )
    session.flush()


def test_a_new_note_pushes_to_the_partner_without_title_or_text(  # type: ignore[no-untyped-def]
    client, session, couple, partner_device
) -> None:
    note = create_note(client, couple, title=SECRET_TITLE, body=SECRET_BODY).json()
    _project(session)
    _project(session)

    assert len(_deliveries(session)) == 1
    _send_pending(session)
    assert len(partner_device.calls) == 1
    wire = json.dumps(partner_device.calls)
    assert SECRET_TITLE not in wire and SECRET_BODY not in wire

    notice = session.scalar(
        select(Notification).where(Notification.recipient_account_id == couple["ben"].id)
    )
    assert notice is not None and notice.kind == NotificationKind.SHARED_NOTE_CREATED.value
    for version in (1, 2):
        encoded = push_preview.for_notification(session, notice, digest=False, version=version)
        assert encoded is not None
        preview = json.loads(encoded)
        assert preview["kind"] == "SHARED_NOTE_CREATED"
        assert preview["name"] == "Anna"
        assert preview["targetType"] == "SHARED_NOTE"
        assert preview["title"] == ""
        assert preview.get("body", "") == ""
        assert SECRET_TITLE not in encoded and SECRET_BODY not in encoded
    # The app opens the note from the canonical notice.
    listed = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications", headers=auth(couple["token_b"])
    )
    item = next(i for i in listed.json()["items"] if i["kind"] == "SHARED_NOTE_CREATED")
    assert item["targetType"] == "SHARED_NOTE" and item["targetId"] == note["id"]


def test_the_author_is_never_notified_by_push(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("note-push-author", provider)
    try:
        push.register_endpoint(
            session,
            account_id=couple["anna"].id,
            provider_key="note-push-author",
            endpoint_value="secret-note-push-author",
        )
        create_note(client, couple)
        _project(session)
        assert _deliveries(session) == []
    finally:
        push.providers.clear()


def test_edits_stay_silent_until_the_partner_has_seen_the_note_then_notify_again(  # type: ignore[no-untyped-def]
    client, session, couple, partner_device
) -> None:
    note = create_note(client, couple, title=SECRET_TITLE, body=SECRET_BODY).json()
    _edit(client, couple, note, 1, "first change")
    _edit(client, couple, note, 2, "second change")
    _project(session)
    # The partner has not yet seen the new note: its edits add no push.
    assert len(_deliveries(session)) == 1
    _send_pending(session)
    assert len(partner_device.calls) == 1

    _partner_reads_everything(session, couple)
    _edit(client, couple, note, 3, "third change")
    _project(session)
    assert len(_deliveries(session)) == 2
    _send_pending(session)
    assert len(partner_device.calls) == 2

    # Another edit while that change is unread stays silent (one current notice).
    _edit(client, couple, note, 4, "fourth change")
    _project(session)
    assert len(_deliveries(session)) == 2
    _send_pending(session)
    assert len(partner_device.calls) == 2

    # Once the partner has read it, the next change notifies again.
    _partner_reads_everything(session, couple)
    _edit(client, couple, note, 5, "fifth change")
    _project(session)
    _project(session)
    assert len(_deliveries(session)) == 2
    _send_pending(session)
    assert len(partner_device.calls) == 3
    wire = json.dumps(partner_device.calls)
    assert "change" not in wire and SECRET_TITLE not in wire and SECRET_BODY not in wire
    changed = session.scalars(
        select(Notification).where(Notification.kind == NotificationKind.SHARED_NOTE_CHANGED.value)
    ).all()
    assert len(changed) == 1


def test_the_recipient_can_switch_note_push_off_through_the_comment_choice(  # type: ignore[no-untyped-def]
    client, session, couple, partner_device
) -> None:
    off = client.patch(
        "/api/v1/notification-preferences/COMMENT_CREATED/PUSH",
        headers=auth(couple["token_b"]),
        json={"enabled": False},
    )
    assert off.status_code == 200, off.text
    create_note(client, couple)
    _project(session)
    _send_pending(session)
    assert partner_device.calls == []
