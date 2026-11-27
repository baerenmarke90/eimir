"""Opening a game page marks its notices read everywhere (#2345).

Covers the per-game kind/target mapping, that only the reader's own unread
notices of this Space change, that no Premium capability is needed and that
an unknown surface is rejected.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
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
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "a": sign_in(session, anna),
        "b": sign_in(session, ben),
    }


def _notice(
    session: Session,
    couple,  # type: ignore[no-untyped-def]
    kind: NotificationKind,
    target: EngagementTarget | None,
    *,
    recipient: str = "anna",
    space_id: UUID | None = None,
) -> Notification:
    notice = Notification(
        space_id=space_id or couple["space"].id,
        recipient_account_id=couple[recipient].id,
        source_event_id=uuid4(),
        kind=kind.value,
        actor_id=couple["ben" if recipient == "anna" else "anna"].id,
        target_type=target.value if target is not None else None,
        target_id=uuid4() if target is not None else None,
    )
    session.add(notice)
    session.flush()
    return notice


def _open(client, couple, surface: str, who: str = "a"):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/spaces/{couple['space'].id}/games/{surface}/notices/read",
        headers=auth(couple[who]),
    )


def _read(session: Session, notice: Notification) -> bool:
    session.expire_all()
    return (
        session.scalar(select(Notification.read_at).where(Notification.id == notice.id)) is not None
    )


@pytest.mark.parametrize(
    ("surface", "kind", "target"),
    [
        ("WHO_OF_US", NotificationKind.COUPLE_GAME_TURN, EngagementTarget.WHO_OF_US_GAME),
        (
            "WISH_DETECTIVE",
            NotificationKind.COUPLE_GAME_TURN,
            EngagementTarget.WISH_DETECTIVE_GAME,
        ),
        ("OUR_MOMENTS", NotificationKind.COUPLE_GAME_TURN, EngagementTarget.OUR_MOMENTS_GAME),
        (
            "PICTURE_PING_PONG",
            NotificationKind.PICTURE_PING_PONG_TURN,
            EngagementTarget.PICTURE_GAME,
        ),
        (
            "PICTURE_PING_PONG",
            NotificationKind.PICTURE_PING_PONG_FINISHED,
            EngagementTarget.PICTURE_GAME,
        ),
        ("HEART_HUNT", NotificationKind.HEART_HUNT_HIDDEN, None),
        ("HEART_HUNT", NotificationKind.HEART_HUNT_FOUND, None),
        ("GARDEN", NotificationKind.GARDEN_SEED_ARRIVED, EngagementTarget.GARDEN_SEED),
        ("GARDEN", NotificationKind.GARDEN_SEED_ARRIVED, EngagementTarget.GARDEN_BOUQUET),
    ],
)
def test_opening_a_game_page_reads_its_notices(  # type: ignore[no-untyped-def]
    client, session, couple, surface, kind, target
) -> None:
    notice = _notice(session, couple, kind, target)
    response = _open(client, couple, surface)
    assert response.status_code == 204, response.text
    assert _read(session, notice)


def test_only_that_games_notices_change(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    who_of_us = _notice(
        session, couple, NotificationKind.COUPLE_GAME_TURN, EngagementTarget.WHO_OF_US_GAME
    )
    wish_detective = _notice(
        session, couple, NotificationKind.COUPLE_GAME_TURN, EngagementTarget.WISH_DETECTIVE_GAME
    )
    heart = _notice(session, couple, NotificationKind.HEART_HUNT_HIDDEN, None)
    comment = _notice(session, couple, NotificationKind.COMMENT_CREATED, EngagementTarget.MEMORY)

    assert _open(client, couple, "WHO_OF_US").status_code == 204

    assert _read(session, who_of_us)
    assert not _read(session, wish_detective)
    assert not _read(session, heart)
    assert not _read(session, comment)


def test_the_partners_and_other_spaces_notices_stay_unread(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    partners = _notice(session, couple, NotificationKind.HEART_HUNT_FOUND, None, recipient="ben")
    elsewhere_space = make_space(session, couple["anna"])
    elsewhere = _notice(
        session,
        couple,
        NotificationKind.HEART_HUNT_HIDDEN,
        None,
        space_id=elsewhere_space.id,
    )

    assert _open(client, couple, "HEART_HUNT").status_code == 204

    assert not _read(session, partners)
    assert not _read(session, elsewhere)


def test_an_already_read_notice_keeps_its_time(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    notice = _notice(session, couple, NotificationKind.HEART_HUNT_HIDDEN, None)
    earlier = now().replace(microsecond=0)
    notice.read_at = earlier
    session.flush()

    assert _open(client, couple, "HEART_HUNT").status_code == 204

    session.expire_all()
    assert session.get(Notification, notice.id).read_at == earlier  # type: ignore[union-attr]


def test_no_premium_is_needed_to_clear_own_notices(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    # The couple fixture grants no games.couple capability.
    notice = _notice(
        session, couple, NotificationKind.GARDEN_SEED_ARRIVED, EngagementTarget.GARDEN_SEED
    )
    assert _open(client, couple, "GARDEN").status_code == 204
    assert _read(session, notice)


def test_an_unknown_game_is_rejected(client, couple) -> None:  # type: ignore[no-untyped-def]
    assert _open(client, couple, "CHESS").status_code == 422
