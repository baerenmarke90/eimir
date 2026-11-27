"""A device asks which tray notices it can withdraw (#2345).

Settled are the reader's read, expired, deleted or no-longer-current notices of
the active Space. Pending notices and notices of the reader's other Spaces stay;
a foreign id is answered like a deleted one; the lookup changes nothing.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.engagement.models import Notification, NotificationKind
from eimir.relationship import service as relationship_service
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


def _notice(session: Session, couple, **values) -> Notification:  # type: ignore[no-untyped-def]
    fields = {
        "space_id": couple["space"].id,
        "recipient_account_id": couple["anna"].id,
        "source_event_id": uuid4(),
        "kind": NotificationKind.HEART_HUNT_HIDDEN.value,
        "actor_id": couple["ben"].id,
    }
    fields.update(values)
    notice = Notification(**fields)
    session.add(notice)
    session.flush()
    return notice


def _settled(client, couple, ids: list[UUID]) -> list[str]:  # type: ignore[no-untyped-def]
    response = client.post(
        f"/api/v1/spaces/{couple['space'].id}/notifications/settled",
        headers=auth(couple["a"]),
        json={"notificationIds": [str(identifier) for identifier in ids]},
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return response.json()["settledIds"]


def test_read_expired_and_deleted_notices_are_settled(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    pending = _notice(session, couple)
    read = _notice(session, couple, read_at=now())
    expired = _notice(session, couple, expires_at=now() - timedelta(minutes=1))
    deleted = uuid4()

    settled = _settled(client, couple, [pending.id, read.id, expired.id, deleted])

    assert settled == [str(read.id), str(expired.id), str(deleted)]
    session.refresh(pending)
    assert pending.read_at is None


def test_other_spaces_stay_and_foreign_ids_look_deleted(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    other_space = make_space(session, couple["anna"])
    elsewhere = _notice(session, couple, space_id=other_space.id, read_at=now())
    partners = _notice(
        session, couple, recipient_account_id=couple["ben"].id, actor_id=couple["anna"].id
    )

    settled = _settled(client, couple, [elsewhere.id, partners.id])

    # The reader's other Space is judged when it is active; the partner's
    # unread notice is answered exactly like a deleted id.
    assert settled == [str(partners.id)]
    session.refresh(partners)
    assert partners.read_at is None


def test_a_server_admin_notice_is_settled_once_read(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    unread = _notice(
        session,
        couple,
        space_id=None,
        actor_id=None,
        kind=NotificationKind.OPERATOR_ALERT.value,
        operator_topic="failed_jobs",
    )
    read = _notice(
        session,
        couple,
        space_id=None,
        actor_id=None,
        kind=NotificationKind.OPERATOR_ALERT.value,
        operator_topic="failed_jobs",
        read_at=now(),
    )

    assert _settled(client, couple, [unread.id, read.id]) == [str(read.id)]


def test_the_lookup_is_bounded(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        f"/api/v1/spaces/{couple['space'].id}/notifications/settled",
        headers=auth(couple["a"]),
        json={"notificationIds": [str(uuid4()) for _ in range(51)]},
    )
    assert response.status_code == 422
