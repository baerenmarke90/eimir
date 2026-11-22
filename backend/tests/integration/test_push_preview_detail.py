"""Detailed encrypted device previews v3 (#2158) against real PostgreSQL.

Product Owner decision 2026-11-21: Android's lock-screen setting decides what a
locked screen shows, and every notice carries its real content. v1 and v2 keep
their exact fields and semantics for installed apps.
"""

from __future__ import annotations

import json
from datetime import UTC, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.engagement import push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind
from eimir.outbox.models import OutboxEvent
from tests.conftest import auth, requires_database
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import path

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Dinner at the lake"
PREVIEW_TITLE = "Evening for two"
PLACE = "Seeblick terrace"


def project_all(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def notice(session: Session, kind: NotificationKind, recipient) -> Notification:  # type: ignore[no-untyped-def]
    [row] = session.scalars(
        select(Notification).where(
            Notification.kind == kind.value, Notification.recipient_account_id == recipient.id
        )
    )
    return row


def preview(session: Session, row: Notification, version: int = 3) -> dict[str, object]:
    encoded = push_preview.for_notification(session, row, digest=False, version=version)
    assert encoded is not None
    assert len(encoded.encode()) <= push_preview.PLAINTEXT_BYTES
    return json.loads(encoded)


def create_plan(client, actors, *, place: bool = True, **extra):  # type: ignore[no-untyped-def]
    place_id = None
    if place:
        created = client.post(
            path(actors, "places"),
            headers={**auth(actors["token_a"]), "Idempotency-Key": str(uuid4())},
            json={"name": PLACE},
        )
        assert created.status_code == 201, created.text
        place_id = created.json()["id"]
    start = (clock.now() + timedelta(hours=20)).replace(microsecond=0)
    response = client.post(
        path(actors, "plans"),
        headers={**auth(actors["token_a"]), "Idempotency-Key": str(uuid4())},
        json={
            "title": TITLE,
            "description": "Table by the window",
            "schedule": {"plannedStart": start.isoformat()},
            **({"placeId": place_id} if place_id else {}),
            **extra,
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), start


def test_plan_notice_names_title_time_and_place_and_v2_stays_unchanged(client, session, actors):  # type: ignore[no-untyped-def]
    _plan, start = create_plan(client, actors)
    project_all(session)
    row = notice(session, NotificationKind.PLAN_CREATED, actors["b"])

    detailed = preview(session, row)
    assert detailed["v"] == 3
    assert detailed["title"] == TITLE
    assert detailed["place"] == PLACE
    assert detailed["when"] == start.astimezone(UTC).isoformat()
    assert detailed["body"] == ""
    # The description is never part of a plan notice.
    assert "Table by the window" not in json.dumps(detailed)

    legacy = preview(session, row, version=2)
    assert set(legacy) == {
        "v",
        "notificationId",
        "kind",
        "name",
        "title",
        "targetType",
        "digest",
        "issuedAt",
        "expiresAt",
        "body",
    }
    assert legacy["title"] == TITLE and legacy["body"] == ""


def test_discreet_plan_shows_only_its_preview_title_and_date(client, session, actors):  # type: ignore[no-untyped-def]
    plan, start = create_plan(client, actors)
    changed = client.patch(
        path(actors, f"plans/{plan['id']}"),
        headers={**auth(actors["token_a"]), "If-Match": str(plan["version"])},
        json={"discreet": True, "discreetTitleMode": "PREVIEW", "previewTitle": PREVIEW_TITLE},
    )
    assert changed.status_code == 200, changed.text
    comment = client.post(
        path(actors, f"plans/{plan['id']}/comments"),
        headers=auth(actors["token_a"]),
        json={"body": "Bring the ring"},
    )
    assert comment.status_code == 201, comment.text
    project_all(session)

    for kind in (NotificationKind.PLAN_CREATED, NotificationKind.COMMENT_CREATED):
        detailed = preview(session, notice(session, kind, actors["b"]))
        encoded = json.dumps(detailed, ensure_ascii=False)
        assert detailed["title"] == PREVIEW_TITLE
        assert TITLE not in encoded and PLACE not in encoded
        assert "Bring the ring" not in encoded and detailed["body"] == ""
        assert detailed["place"] == ""
    created = preview(session, notice(session, NotificationKind.PLAN_CREATED, actors["b"]))
    assert created["when"] == start.astimezone(UTC).isoformat()

    # Without a preview title the device falls back to its neutral wording.
    plan = client.get(path(actors, f"plans/{plan['id']}"), headers=auth(actors["token_a"])).json()
    cleared = client.patch(
        path(actors, f"plans/{plan['id']}"),
        headers={**auth(actors["token_a"]), "If-Match": str(plan["version"])},
        json={"previewTitle": None},
    )
    assert cleared.status_code == 200, cleared.text
    assert (
        preview(session, notice(session, NotificationKind.PLAN_CREATED, actors["b"]))["title"] == ""
    )


def test_start_reminder_and_cancellation_name_the_current_plan(client, session, actors):  # type: ignore[no-untyped-def]
    plan, start = create_plan(client, actors)
    project_all(session)
    context = AuthorizationContext(account_id=actors["b"].id, space_id=actors["space"].id)
    reminder = Notification(
        kind=NotificationKind.REMINDER_DUE.value,
        target_type="PLAN",
        target_id=UUID(plan["id"]),
        space_id=actors["space"].id,
    )
    assert push_preview._schedule(session, reminder, context) == (
        start.astimezone(UTC).isoformat(),
        PLACE,
    )
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.subject_id == UUID(plan["id"])).limit(1)
    )
    cancelled = Notification(
        kind=NotificationKind.PLAN_CANCELLED.value,
        source_event_id=event.id,
        space_id=actors["space"].id,
    )
    assert push_preview._cancelled_plan_title(session, cancelled, context) == TITLE
    # Nothing is copied: a deleted Plan leaves the cancellation without a title.
    deleted = client.delete(
        path(actors, f"plans/{plan['id']}"),
        headers={**auth(actors["token_a"]), "If-Match": str(plan["version"])},
    )
    assert deleted.status_code == 204, deleted.text
    assert push_preview._cancelled_plan_title(session, cancelled, context) == ""
    assert push_preview._schedule(session, reminder, context) == ("", "")
    # An outsider's context never reads the plan either.
    outsider = AuthorizationContext(account_id=actors["outsider"].id, space_id=actors["space"].id)
    assert push_preview._cancelled_plan_title(session, cancelled, outsider) == ""


def test_shared_reminder_carries_its_time_and_description(client, session, actors):  # type: ignore[no-untyped-def]
    at = (clock.now() + timedelta(hours=3)).replace(microsecond=0)
    created = client.post(
        path(actors, "reminders"),
        headers=auth(actors["token_a"]),
        json={
            "title": "Call the florist",
            "description": "Ask for peonies",
            "schedule": {"type": "ONCE", "at": at.isoformat()},
            "offsets": [0],
        },
    )
    assert created.status_code == 201, created.text
    project_all(session)
    row = notice(session, NotificationKind.REMINDER_CREATED, actors["b"])
    detailed = preview(session, row)
    assert detailed["title"] == "Call the florist"
    assert detailed["body"] == "Ask for peonies"
    assert detailed["when"] == at.astimezone(UTC).isoformat()
    # v2 keeps its exact semantics: the description was never part of it.
    assert "Ask for peonies" not in json.dumps(preview(session, row, version=2))


def test_shared_note_and_sent_list_carry_their_own_words(client, session, actors):  # type: ignore[no-untyped-def]
    note = client.post(
        path(actors, "shared-notes"),
        headers=auth(actors["token_a"]),
        json={"title": "Door code", "body": "4172, then the left door " + "x" * 300},
    )
    assert note.status_code == 201, note.text
    collection = client.post(
        path(actors, "collections"), headers=auth(actors["token_a"]), json={"title": "Gifts"}
    )
    assert collection.status_code == 201, collection.text
    sent = client.post(
        path(actors, f"collections/{collection.json()['id']}/send"),
        headers=auth(actors["token_a"]),
    )
    assert sent.status_code in {200, 204}, sent.text
    project_all(session)

    shared = preview(session, notice(session, NotificationKind.SHARED_NOTE_CREATED, actors["b"]))
    assert shared["title"] == "Door code"
    assert str(shared["body"]).startswith("4172, then the left door")
    assert len(str(shared["body"])) == 180 and str(shared["body"]).endswith("…")
    listed = preview(session, notice(session, NotificationKind.COLLECTION_SENT, actors["b"]))
    assert listed["title"] == "Gifts"
    for version in (1, 2):
        legacy = json.dumps(
            preview(
                session,
                notice(session, NotificationKind.SHARED_NOTE_CREATED, actors["b"]),
                version=version,
            )
        )
        assert "Door code" not in legacy and "4172" not in legacy


def test_once_message_and_unavailable_targets_stay_out_of_v3(client, session, actors):  # type: ignore[no-untyped-def]
    note = client.post(
        path(actors, "shared-notes"), headers=auth(actors["token_a"]), json={"title": "Gone"}
    )
    assert note.status_code == 201, note.text
    project_all(session)
    row = notice(session, NotificationKind.SHARED_NOTE_CREATED, actors["b"])
    session.execute(update(Notification).where(Notification.id == row.id).values(target_id=uuid4()))
    session.flush()
    session.refresh(row)
    assert push_preview.for_notification(session, row, digest=False, version=3) is None
    sealed = Notification(kind=NotificationKind.ONCE_MESSAGE_RECEIVED.value)
    assert push_preview.for_notification(session, sealed, digest=False, version=3) is None
