"""What is new for the reader as Wir tiles (#2345 B).

Unread, current notices of the Wir kinds only, newest first; reading changes
nothing; previews come from authorized reads and honour a note's
title-only wish.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
)
from eimir.core.clock import now
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.relationship import service as relationship_service
from eimir.shared_notes.models import SharedNote, SharedNotePayload
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {"anna": anna, "ben": ben, "space": space, "a": sign_in(session, anna)}


def _notice(session: Session, couple, kind: NotificationKind, **values: Any) -> Notification:  # type: ignore[no-untyped-def]
    fields: dict[str, Any] = {
        "space_id": couple["space"].id,
        "recipient_account_id": couple["anna"].id,
        "source_event_id": uuid4(),
        "kind": kind.value,
        "actor_id": couple["ben"].id,
    }
    fields.update(values)
    notice = Notification(**fields)
    session.add(notice)
    session.flush()
    return notice


def _wir(client, couple) -> list[dict[str, Any]]:  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications/wir", headers=auth(couple["a"])
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return response.json()["items"]


def test_only_unread_wir_kinds_newest_first(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    older = _notice(
        session, couple, NotificationKind.HEART_HUNT_FOUND, created_at=now() - timedelta(hours=2)
    )
    newer = _notice(session, couple, NotificationKind.HEART_HUNT_FOUND)
    _notice(session, couple, NotificationKind.HEART_HUNT_FOUND, read_at=now())
    _notice(session, couple, NotificationKind.THINKING_OF_YOU)
    _notice(session, couple, NotificationKind.REMINDER_DUE)
    _notice(
        session,
        couple,
        NotificationKind.HEART_HUNT_FOUND,
        recipient_account_id=couple["ben"].id,
        actor_id=couple["anna"].id,
    )

    items = _wir(client, couple)

    assert [item["id"] for item in items] == [str(newer.id), str(older.id)]
    # Reading Wir changes nothing.
    session.refresh(older)
    assert older.read_at is None


def test_an_expired_notice_is_not_shown(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    _notice(
        session,
        couple,
        NotificationKind.HEART_HUNT_FOUND,
        expires_at=now() - timedelta(minutes=1),
    )
    assert _wir(client, couple) == []


def test_a_sent_list_shows_its_first_open_items(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    collection = Collection(
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        privacy_class="SPACE_SHARED",
        payload=CollectionPayload(title="Einkauf"),
    )
    session.add(collection)
    session.flush()
    for position, (title, done) in enumerate(
        [
            ("Erdbeeren", False),
            ("Brot", True),
            ("Baguette", False),
            ("Käse", False),
            ("Sekt", False),
        ]
    ):
        session.add(
            CollectionItem(
                collection_id=collection.id,
                created_by=couple["ben"].id,
                completed=done,
                completed_by=couple["ben"].id if done else None,
                completed_at=now() if done else None,
                position=position,
                payload=CollectionItemPayload(title=title),
            )
        )
    session.flush()
    _notice(
        session,
        couple,
        NotificationKind.COLLECTION_SENT,
        target_type=EngagementTarget.COLLECTION.value,
        target_id=collection.id,
    )

    [item] = _wir(client, couple)

    assert item["target"]["title"] == "Einkauf"
    assert item["preview"]["items"] == ["Erdbeeren", "Baguette", "Käse"]
    assert item["preview"]["moreItems"] == 1


@pytest.mark.parametrize("title_only", [False, True])
def test_a_shared_note_shows_its_opening_unless_title_only(  # type: ignore[no-untyped-def]
    client, session, couple, title_only: bool
) -> None:
    note = SharedNote(
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        privacy_class="SPACE_SHARED",
        payload=SharedNotePayload(title="Haustür", body="Der Code ist 4711"),
        wir_title_only=title_only,
    )
    session.add(note)
    session.flush()
    _notice(
        session,
        couple,
        NotificationKind.SHARED_NOTE_CREATED,
        target_type=EngagementTarget.SHARED_NOTE.value,
        target_id=note.id,
    )

    [item] = _wir(client, couple)

    if title_only:
        assert item["preview"] is None
    else:
        assert item["preview"]["text"] == "Der Code ist 4711"
