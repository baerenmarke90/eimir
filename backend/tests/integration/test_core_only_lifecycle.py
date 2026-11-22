"""Lifecycle of plugin data in a Core-only process (Decision 0017, acceptance criterion 4 of #2082).

These tests are not Pro feature tests: the Core-only CI job collects and runs
them with ``EIMIR_PLUGINS=""``, so the Core manifest executor does the work for
real. The rows are written directly, as a Core-only instance finds them after
it once ran with the plugin; no plugin service or Pro grant is needed. In the
plugin-loaded configuration the same assertions run against a simulated absent
plugin.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from eimir_pro.once_messages.models import OnceDevice, OnceEnvelope, OnceMessage, OnceReception
from sqlalchemy import MetaData, func, select, text
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.couple_games.models import CoupleGame, CoupleGamePayload, WhoOfUsData
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.garden.models import GardenPlant
from eimir.jobs import maintenance
from eimir.photo_sources.models import (
    GoogleAccountHint,
    GoogleAccountHintPayload,
    PhotoSelection,
    PhotoSelectionPayload,
)
from eimir.picture_ping_pong.models import PicturePayload, PicturePingPong
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership
from eimir.security import lifecycle
from eimir.security.runtime import get_key_ring
from tests.conftest import make_account, make_space, requires_database
from tests.support.plugins import plugins_loaded, without_plugins

pytestmark = [pytest.mark.integration, requires_database]


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


def _count(session: Session, model: type, *conditions) -> int:  # type: ignore[no-untyped-def, type-arg]
    statement = select(func.count()).select_from(model)
    if conditions:
        statement = statement.where(*conditions)
    return int(session.scalar(statement) or 0)


def _membership(session: Session, space_id, account_id) -> Membership:  # type: ignore[no-untyped-def]
    return session.scalars(
        select(Membership).where(
            Membership.space_id == space_id, Membership.account_id == account_id
        )
    ).one()


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return SimpleNamespace(anna=anna, ben=ben, space=space)


def _game_rows(session: Session, space_id, first, second) -> None:  # type: ignore[no-untyped-def]
    session.add_all(
        [
            CoupleGame(
                space_id=space_id,
                game="WHO_OF_US",
                status="OPEN",
                started_by=first,
                waiting_on_id=second,
                payload=CoupleGamePayload(who_of_us=WhoOfUsData(question_ids=["q1"])),
            ),
            PicturePingPong(
                space_id=space_id,
                started_by=first,
                status="DRAWING",
                drawer_id=second,
                payload=PicturePayload(strokes=[]),
            ),
            GardenPlant(
                space_id=space_id,
                sender_id=first,
                receiver_id=second,
                species="POPPY",
                sent_on=clock.now().date(),
            ),
        ]
    )
    session.flush()


def _once_message(session: Session, couple, **times):  # type: ignore[no-untyped-def]
    now = clock.now()
    message = OnceMessage(
        space_id=couple.space.id,
        sender_id=couple.anna.id,
        recipient_id=couple.ben.id,
        sender_membership_id=_membership(session, couple.space.id, couple.anna.id).id,
        recipient_membership_id=_membership(session, couple.space.id, couple.ben.id).id,
        request_id=uuid4(),
        fingerprint=uuid4().hex * 2,
        payload=OnceEnvelope(jwe={"ciphertext": "opaque-sealed-content"}),
        byte_size=21,
        created_at=now,
        expires_at=times.get("expires_at", now + timedelta(hours=24)),
        claim_until=times.get("claim_until"),
    )
    session.add(message)
    session.flush()
    return message


def _notice(session: Session, couple, target: EngagementTarget, target_id, kind) -> None:  # type: ignore[no-untyped-def]
    session.add(
        Notification(
            space_id=couple.space.id,
            recipient_account_id=couple.ben.id,
            source_event_id=uuid4(),
            kind=kind.value,
            actor_id=couple.anna.id,
            target_type=target.value,
            target_id=target_id,
        )
    )
    session.flush()


def test_a_joining_partner_removes_the_couple_bound_plugin_rows(session: Session) -> None:
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    _game_rows(session, space.id, anna.id, uuid4())
    with core_only():
        relationship_service.add_member(session, space.id, ben)
    session.flush()
    for model in (CoupleGame, PicturePingPong, GardenPlant):
        assert _count(session, model, model.space_id == space.id) == 0, model.__tablename__


def test_an_ended_membership_removes_plugin_rows_and_their_notices(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _game_rows(session, couple.space.id, couple.anna.id, couple.ben.id)
    message = _once_message(session, couple)
    message_id = message.id
    plant_id = session.scalar(select(GardenPlant.id).where(GardenPlant.space_id == couple.space.id))
    membership = _membership(session, couple.space.id, couple.ben.id)
    session.add_all(
        [
            OnceReception(
                space_id=couple.space.id, account_id=couple.ben.id, membership_id=membership.id
            ),
            OnceDevice(
                id=uuid4(),
                space_id=couple.space.id,
                account_id=couple.ben.id,
                membership_id=membership.id,
                public_jwk={"kty": "RSA"},
                created_at=clock.now(),
            ),
        ]
    )
    _notice(
        session,
        couple,
        EngagementTarget.ONCE_MESSAGE,
        message_id,
        NotificationKind.ONCE_MESSAGE_RECEIVED,
    )
    _notice(
        session,
        couple,
        EngagementTarget.GARDEN_SEED,
        plant_id,
        NotificationKind.GARDEN_SEED_ARRIVED,
    )
    with core_only():
        relationship_service.end_membership(session, membership)
    session.flush()
    session.expire_all()
    space = couple.space.id
    for model in (OnceMessage, OnceDevice, OnceReception, CoupleGame, PicturePingPong, GardenPlant):
        assert _count(session, model, model.space_id == space) == 0, model.__tablename__
    for target_id in (message_id, plant_id):
        assert _count(session, Notification, Notification.target_id == target_id) == 0


def test_once_messages_lose_their_content_when_claim_window_or_lifetime_ends(  # type: ignore[no-untyped-def]
    session: Session, couple
) -> None:
    now = clock.now()
    claimed = _once_message(session, couple, claim_until=now - timedelta(minutes=1)).id
    expired = _once_message(session, couple, expires_at=now - timedelta(minutes=1)).id
    waiting = _once_message(session, couple).id
    _notice(
        session,
        couple,
        EngagementTarget.ONCE_MESSAGE,
        expired,
        NotificationKind.ONCE_MESSAGE_RECEIVED,
    )
    with core_only():
        maintenance.run_security_retention(session, {})
    session.flush()
    session.expire_all()
    # Without the plugin the claimed message goes entirely; nothing of its content stays.
    assert session.get(OnceMessage, claimed) is None
    assert session.get(OnceMessage, expired) is None
    assert _count(session, Notification, Notification.target_id == expired) == 0
    kept = session.get(OnceMessage, waiting)
    assert kept is not None and kept.payload.jwe == {"ciphertext": "opaque-sealed-content"}


def test_plugin_notices_are_hidden_without_the_plugin(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _game_rows(session, couple.space.id, couple.anna.id, couple.ben.id)
    message_id = _once_message(session, couple).id
    plant_id = session.scalar(select(GardenPlant.id).where(GardenPlant.space_id == couple.space.id))
    game_id = session.scalar(select(CoupleGame.id).where(CoupleGame.space_id == couple.space.id))
    picture_id = session.scalar(
        select(PicturePingPong.id).where(PicturePingPong.space_id == couple.space.id)
    )
    for target, target_id, kind in (
        (EngagementTarget.ONCE_MESSAGE, message_id, NotificationKind.ONCE_MESSAGE_RECEIVED),
        (EngagementTarget.GARDEN_SEED, plant_id, NotificationKind.GARDEN_SEED_ARRIVED),
        (EngagementTarget.WHO_OF_US_GAME, game_id, NotificationKind.COUPLE_GAME_TURN),
        (EngagementTarget.PICTURE_GAME, picture_id, NotificationKind.PICTURE_PING_PONG_TURN),
    ):
        _notice(session, couple, target, target_id, kind)
    reader = AuthorizationContext(account_id=couple.ben.id, space_id=couple.space.id)
    with core_only():
        assert engagement.unread_count(session, reader) == 0


def test_received_partner_gestures_stay_readable_and_thinking_of_you_stays_free(
    session: Session, couple: SimpleNamespace
) -> None:
    """Sending a kiss or check-in is plugin code; what it produced is Core data."""
    from eimir.engagement import thinking

    for kind in (NotificationKind.PARTNER_KISS, NotificationKind.PARTNER_CHECK_IN):
        session.add(
            Notification(
                space_id=couple.space.id,
                recipient_account_id=couple.ben.id,
                source_event_id=uuid4(),
                kind=kind.value,
                actor_id=couple.anna.id,
            )
        )
    session.flush()
    reader = AuthorizationContext(account_id=couple.ben.id, space_id=couple.space.id)
    sender = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
    with core_only():
        assert engagement.unread_count(session, reader) == 2
        # The Free gesture keeps working without the plugin.
        assert thinking.send(session, sender, client_request_id=uuid4()) is not None


def _photo_selection(session: Session, couple, *, expires_in: timedelta) -> PhotoSelection:  # type: ignore[no-untyped-def]
    device_session, _ = sessions.start_session(session, couple.anna)
    session.flush()
    selection_id = uuid4()
    selection = PhotoSelection(
        id=selection_id,
        account_id=couple.anna.id,
        space_id=couple.space.id,
        device_session_id=device_session.id,
        provider="google",
        status="PENDING",
        expires_at=clock.now() + expires_in,
        next_poll_at=clock.now(),
        payload=PhotoSelectionPayload(
            selection_id=selection_id,
            account_id=couple.anna.id,
            space_id=couple.space.id,
            device_session_id=device_session.id,
        ),
    )
    session.add(selection)
    session.flush()
    return selection


def test_photo_selections_do_not_outlive_the_plugin(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    """Short-lived picker state is deleted at the next security retention without the plugin."""
    expired = _photo_selection(session, couple, expires_in=-timedelta(minutes=1)).id
    running = _photo_selection(session, couple, expires_in=timedelta(minutes=10)).id
    with core_only():
        maintenance.run_security_retention(session, {})
    session.flush()
    session.expire_all()
    assert session.get(PhotoSelection, expired) is None
    # Without the plugin nobody can finish a picker session, so it goes as well.
    assert session.get(PhotoSelection, running) is None


def test_encryption_verify_authenticates_plugin_payloads_without_their_models(  # type: ignore[no-untyped-def]
    session: Session, couple, encryption, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``verify`` covers plugin tables from the manifest alone, as a process without the models."""
    encryption.apply("required")
    hint = GoogleAccountHint(
        account_id=couple.anna.id,
        payload=GoogleAccountHintPayload(account_id=couple.anna.id, email="anna@example.test"),
    )
    session.add(hint)
    session.flush()
    monkeypatch.setattr(lifecycle, "load_all_models", lambda: None)
    monkeypatch.setattr(lifecycle, "Base", SimpleNamespace(metadata=MetaData()))
    with core_only():
        assert {entry.payload_type for entry in lifecycle.payload_tables()} == {None}
        report = lifecycle.verify_payloads(session, get_key_ring())
        assert report.ok
        assert report.checked["google_account_hints"] == 1
        assert "anna@example.test" not in repr(report)

        session.execute(
            text("UPDATE google_account_hints SET crypto_version = 0 WHERE id = :id"),
            {"id": hint.id},
        )
        assert not lifecycle.verify_payloads(session, get_key_ring()).ok
