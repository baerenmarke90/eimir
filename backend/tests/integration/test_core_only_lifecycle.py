"""Lifecycle of plugin data in a Core-only process (Decision 0017, acceptance criterion 4 of #2082).

These tests are not Pro feature tests: the Core-only CI job collects and runs
them with ``EIMIR_PLUGINS=""`` and without the Pro distribution, so Core's
manifest executor does the work for real. They need no Pro table: the plugin is
a fake one (``tests.support.fake_plugin``) whose tables carry their own manifest
rows, written directly as a Core-only instance finds the rows of a plugin that
once ran. In the plugin-loaded configuration the same assertions run against a
simulated absent plugin.

The lifecycle of the real Pro tables, as the Pro plugin defines it, is covered in
``backend/pro/pro_tests``.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import MetaData, func, select, text
from sqlalchemy.orm import Session

from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core import clock
from eimir.domain.payload import CRYPTO_VERSION_SERVER_AEAD
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.jobs import maintenance
from eimir.plugins import lifecycle as plugin_lifecycle
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership
from eimir.security import lifecycle
from eimir.security.runtime import get_key_ring, get_payload_protector
from tests.conftest import make_account, make_space, requires_database
from tests.support.fake_plugin import (
    ACCOUNT_PREFERENCES,
    ALL_TABLES,
    CONSENTS,
    COUPLE_ITEMS,
    CREDENTIALS,
    MEMBER_STATE,
    PICKER_SESSIONS,
    ROUNDS,
    SEALED_NOTES,
    count_rows,
    insert_row,
    install_fake_plugin_tables,
)
from tests.support.plugins import plugins_loaded, without_plugins

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture(autouse=True)
def fake_plugin_tables(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_plugin_tables(session, monkeypatch, *ALL_TABLES)


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


def _membership(session: Session, space_id, account_id) -> Membership:  # type: ignore[no-untyped-def]
    return session.scalars(
        select(Membership).where(
            Membership.space_id == space_id, Membership.account_id == account_id
        )
    ).one()


def _notice_count(session: Session, target_id) -> int:  # type: ignore[no-untyped-def]
    return int(
        session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.target_id == target_id)
        )
        or 0
    )


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return SimpleNamespace(anna=anna, ben=ben, space=space)


def _couple_item(session: Session, couple) -> object:  # type: ignore[no-untyped-def]
    return insert_row(
        session,
        COUPLE_ITEMS,
        space_id=couple.space.id,
        sender_id=couple.anna.id,
        receiver_id=couple.ben.id,
    )


def _note(session: Session, couple, **times):  # type: ignore[no-untyped-def]
    return insert_row(
        session,
        SEALED_NOTES,
        space_id=couple.space.id,
        sender_id=couple.anna.id,
        recipient_id=couple.ben.id,
        expires_at=times.get("expires_at", clock.now() + timedelta(hours=24)),
        claim_until=times.get("claim_until"),
        payload={"ciphertext": "opaque-sealed-content"},
    )


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
    other_space = uuid4()
    for space_id in (space.id, other_space):
        insert_row(session, COUPLE_ITEMS, space_id=space_id, sender_id=anna.id, receiver_id=uuid4())
    with core_only():
        relationship_service.add_member(session, space.id, ben)
    session.flush()
    assert count_rows(session, COUPLE_ITEMS, "space_id = :space", space=space.id) == 0
    # Only the joining Space's rows go.
    assert count_rows(session, COUPLE_ITEMS, "space_id = :space", space=other_space) == 1


def test_an_ended_membership_removes_plugin_rows_their_notices_and_attachments(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    item_id = _couple_item(session, couple)
    note_id = _note(session, couple)
    attachment = Attachment(
        space_id=couple.space.id,
        owner_id=couple.anna.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=1,
        mime_type="image/jpeg",
        size=1,
        width=1,
        height=1,
        has_thumbnail=False,
        ready_at=clock.now(),
        payload=AttachmentPayload(original_name="photo.jpg"),
    )
    session.add(attachment)
    session.flush()
    insert_row(
        session,
        ROUNDS,
        space_id=couple.space.id,
        hider_id=couple.anna.id,
        seeker_id=couple.ben.id,
        attachment_id=attachment.id,
    )
    for account in (couple.anna, couple.ben):
        insert_row(session, MEMBER_STATE, space_id=couple.space.id, account_id=account.id)
    _notice(
        session,
        couple,
        EngagementTarget.ONCE_MESSAGE,
        note_id,
        NotificationKind.ONCE_MESSAGE_RECEIVED,
    )
    _notice(
        session, couple, EngagementTarget.GARDEN_SEED, item_id, NotificationKind.GARDEN_SEED_ARRIVED
    )
    membership = _membership(session, couple.space.id, couple.ben.id)
    with core_only():
        relationship_service.end_membership(session, membership)
    session.flush()
    session.expire_all()
    for table in (COUPLE_ITEMS, SEALED_NOTES, MEMBER_STATE, ROUNDS):
        assert count_rows(session, table, "space_id = :space", space=couple.space.id) == 0, (
            table.name
        )
    for target_id in (note_id, item_id):
        assert _notice_count(session, target_id) == 0
    # The row is gone at once; its photo goes through the media cleanup.
    assert attachment.status == AttachmentStatus.DELETING.value


def test_a_member_who_leaves_takes_only_their_own_plugin_rows(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    for account in (couple.anna, couple.ben):
        insert_row(session, MEMBER_STATE, space_id=couple.space.id, account_id=account.id)
    with core_only():
        plugin_lifecycle.member_left(session, couple.space.id, couple.ben.id)
    assert count_rows(session, MEMBER_STATE, "account_id = :a", a=couple.ben.id) == 0
    assert count_rows(session, MEMBER_STATE, "account_id = :a", a=couple.anna.id) == 1


def test_a_deleted_account_takes_its_plugin_rows_and_what_depends_on_them(  # type: ignore[no-untyped-def]
    session: Session, couple
) -> None:
    space = couple.space.id
    for account in (couple.anna, couple.ben):
        insert_row(session, MEMBER_STATE, space_id=space, account_id=account.id)
        insert_row(session, ACCOUNT_PREFERENCES, account_id=account.id)
        insert_row(
            session,
            CREDENTIALS,
            space_id=space,
            account_id=account.id,
            expires_at=clock.now() + timedelta(hours=1),
        )
    # Anna shares with Ben; Ben's deletion ends what Anna published to him.
    insert_row(
        session,
        CONSENTS,
        space_id=space,
        account_id=couple.anna.id,
        recipient_account_id=couple.ben.id,
    )
    with core_only():
        plugin_lifecycle.account_deleted(session, couple.ben.id)
    assert count_rows(session, MEMBER_STATE, "account_id = :a", a=couple.ben.id) == 0
    assert count_rows(session, ACCOUNT_PREFERENCES, "account_id = :a", a=couple.ben.id) == 0
    assert count_rows(session, CONSENTS) == 0
    # Anna's credentials were bound to the consent and go; the rest of Anna's state stays.
    assert count_rows(session, CREDENTIALS) == 0
    assert count_rows(session, MEMBER_STATE, "account_id = :a", a=couple.anna.id) == 1
    assert count_rows(session, ACCOUNT_PREFERENCES, "account_id = :a", a=couple.anna.id) == 1


def test_plugin_content_is_lost_when_claim_window_or_lifetime_ends(  # type: ignore[no-untyped-def]
    session: Session, couple
) -> None:
    now = clock.now()
    claimed = _note(session, couple, claim_until=now - timedelta(minutes=1))
    expired = _note(session, couple, expires_at=now - timedelta(minutes=1))
    waiting = _note(session, couple)
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
    # Without the plugin the claimed note goes entirely; nothing of its content stays.
    remaining = set(session.execute(text("SELECT id FROM fake_sealed_notes")).scalars())
    assert remaining == {waiting}
    assert claimed not in remaining and expired not in remaining
    assert _notice_count(session, expired) == 0
    stored = session.execute(
        text("SELECT payload FROM fake_sealed_notes WHERE id = :id"), {"id": waiting}
    ).scalar_one()
    assert stored == {"ciphertext": "opaque-sealed-content"}


def test_plugin_rows_with_an_expiry_stay_until_it_has_passed(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    keys = {"space_id": couple.space.id, "account_id": couple.anna.id}
    expired = insert_row(
        session, CREDENTIALS, **keys, expires_at=clock.now() - timedelta(minutes=1)
    )
    valid = insert_row(session, CREDENTIALS, **keys, expires_at=clock.now() + timedelta(hours=1))
    with core_only():
        maintenance.run_security_retention(session, {})
    session.flush()
    assert count_rows(session, CREDENTIALS, "id = :id", id=expired) == 0
    assert count_rows(session, CREDENTIALS, "id = :id", id=valid) == 1


def test_transient_plugin_state_does_not_outlive_the_plugin(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    """Short-lived state is deleted at the next security retention without the plugin."""
    keys = {"space_id": couple.space.id, "account_id": couple.anna.id}
    insert_row(session, PICKER_SESSIONS, **keys, expires_at=clock.now() - timedelta(minutes=1))
    insert_row(session, PICKER_SESSIONS, **keys, expires_at=clock.now() + timedelta(minutes=10))
    with core_only():
        maintenance.run_security_retention(session, {})
    session.flush()
    # Without the plugin nobody can finish the session, so the running one goes as well.
    assert count_rows(session, PICKER_SESSIONS) == 0


def test_plugin_notices_are_hidden_without_the_plugin(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    for target, kind in (
        (EngagementTarget.ONCE_MESSAGE, NotificationKind.ONCE_MESSAGE_RECEIVED),
        (EngagementTarget.GARDEN_SEED, NotificationKind.GARDEN_SEED_ARRIVED),
        (EngagementTarget.WHO_OF_US_GAME, NotificationKind.COUPLE_GAME_TURN),
        (EngagementTarget.PICTURE_GAME, NotificationKind.PICTURE_PING_PONG_TURN),
    ):
        _notice(session, couple, target, uuid4(), kind)
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


def _isolated_from_the_models(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run ``verify`` as a process without any plugin or model module."""
    monkeypatch.setattr(lifecycle, "load_all_models", lambda: None)
    monkeypatch.setattr(lifecycle, "Base", SimpleNamespace(metadata=MetaData()))


def _sealed_note(session: Session, couple, *, context: str) -> object:  # type: ignore[no-untyped-def]
    sealed = get_payload_protector().protect({"text": "opaque secret"}, context=context)
    return insert_row(
        session,
        SEALED_NOTES,
        space_id=couple.space.id,
        sender_id=couple.anna.id,
        recipient_id=couple.ben.id,
        expires_at=clock.now() + timedelta(hours=1),
        payload=sealed,
        crypto_version=CRYPTO_VERSION_SERVER_AEAD,
    )


def test_encryption_verify_authenticates_plugin_payloads_without_their_models(  # type: ignore[no-untyped-def]
    session: Session, couple, encryption, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``verify`` covers plugin tables from the manifest alone, as a process without the models."""
    encryption.apply("required")
    note_id = _sealed_note(session, couple, context="FakeNotePayload")
    _isolated_from_the_models(monkeypatch)
    with core_only():
        assert {entry.payload_type for entry in lifecycle.payload_tables()} == {None}
        report = lifecycle.verify_payloads(session, get_key_ring())
        assert report.ok
        assert report.checked["fake_sealed_notes"] == 1
        assert "opaque secret" not in repr(report)

        session.execute(
            text("UPDATE fake_sealed_notes SET crypto_version = 0 WHERE id = :id"),
            {"id": note_id},
        )
        assert not lifecycle.verify_payloads(session, get_key_ring()).ok


def test_encryption_verify_rejects_a_payload_sealed_for_another_context(  # type: ignore[no-untyped-def]
    session: Session, couple, encryption, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A ciphertext moved into a plugin column of another payload type does not authenticate."""
    encryption.apply("required")
    _sealed_note(session, couple, context="SomeOtherPayload")
    _isolated_from_the_models(monkeypatch)
    with core_only():
        report = lifecycle.verify_payloads(session, get_key_ring())
    assert not report.ok
    assert report.unreadable["fake_sealed_notes"] == 1
