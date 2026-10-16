"""Binding-aware media convergence for accepted Account deletion."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding, service
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.deletion_media import apply_account_media_cleanup
from eimir.media.local import LocalMediaStore
from eimir.memories.models import Memory, MemoryPayload
from eimir.relationship.service import add_member
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _attachment(
    session: Session,
    *,
    owner_id,
    space_id,
    has_thumbnail: bool = False,
) -> Attachment:  # type: ignore[no-untyped-def]
    row = Attachment(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/png",
        declared_size=8,
        mime_type="image/png",
        size=8,
        width=1,
        height=1,
        has_thumbnail=has_thumbnail,
        ready_at=now(),
        payload=AttachmentPayload(original_name="account-deletion-fixture.png"),
    )
    session.add(row)
    session.flush()
    return row


def _put(store: LocalMediaStore, attachment: Attachment) -> None:
    store.put(service.storage_key_for(attachment), BytesIO(b"original"), "image/png")
    if attachment.has_thumbnail:
        store.put(
            service.storage_key_for(attachment, service.THUMBNAIL_VARIANT),
            BytesIO(b"thumbnail"),
            "image/jpeg",
        )


def test_account_media_cleanup_retains_only_surviving_shared_bindings(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)

    shared_attachment = _attachment(
        session, owner_id=owner.id, space_id=space.id, has_thumbnail=True
    )
    shared_memory = Memory(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=MemoryPayload(title="Together", body="retained shared history"),
    )
    session.add(shared_memory)
    session.flush()
    session.add(
        binding.MemoryAttachment(
            memory_id=shared_memory.id,
            attachment_id=shared_attachment.id,
            position=0,
        )
    )

    private_attachment = _attachment(session, owner_id=owner.id, space_id=space.id)
    private_heart = HeartMoment(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=now().date(),
        attachment_id=private_attachment.id,
        payload=HeartMomentPayload(text="owner only", emotion=HeartEmotion.GRATEFUL),
    )
    session.add(private_heart)

    unbound_attachment = _attachment(session, owner_id=owner.id, space_id=space.id)

    avatar_attachment = _attachment(
        session, owner_id=owner.id, space_id=space.id, has_thumbnail=True
    )
    session.add(
        binding.AccountProfileAttachment(
            account_id=owner.id,
            attachment_id=avatar_attachment.id,
        )
    )

    partner_attachment = _attachment(session, owner_id=partner.id, space_id=space.id)
    partner_private_heart = HeartMoment(
        space_id=space.id,
        owner_id=partner.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=now().date(),
        attachment_id=partner_attachment.id,
        payload=HeartMomentPayload(text="partner only", emotion=HeartEmotion.HAPPY),
    )
    session.add(partner_private_heart)
    session.flush()

    store = LocalMediaStore(tmp_path / "media")
    monkeypatch.setattr(service, "get_media_store", lambda: store)
    for attachment in (
        shared_attachment,
        private_attachment,
        unbound_attachment,
        avatar_attachment,
        partner_attachment,
    ):
        _put(store, attachment)

    accepted_at = now()
    apply_accepted_tombstone(session, owner.id, accepted_at=accepted_at)
    apply_core_cleanup(session, owner.id)
    result = apply_account_media_cleanup(session, owner.id)

    assert result.retained_shared == 1
    assert result.purged == 3
    assert result.purge_failures == 0
    assert result.inconsistent_bindings == 0
    assert result.converged

    assert session.get(Attachment, shared_attachment.id) is not None
    assert session.get(Attachment, private_attachment.id) is None
    assert session.get(Attachment, unbound_attachment.id) is None
    assert session.get(Attachment, avatar_attachment.id) is None
    assert session.get(Attachment, partner_attachment.id) is not None

    assert store.exists(service.storage_key_for(shared_attachment))
    assert store.exists(service.storage_key_for(shared_attachment, service.THUMBNAIL_VARIANT))
    assert not store.exists(service.storage_key_for(private_attachment))
    assert not store.exists(service.storage_key_for(unbound_attachment))
    assert not store.exists(service.storage_key_for(avatar_attachment))
    assert not store.exists(service.storage_key_for(avatar_attachment, service.THUMBNAIL_VARIANT))
    assert store.exists(service.storage_key_for(partner_attachment))

    private_heart_id = session.execute(
        select(HeartMoment.id).where(HeartMoment.id == private_heart.id)
    ).scalar_one_or_none()
    assert private_heart_id is None
    assert (
        session.execute(
            select(HeartMoment.id).where(HeartMoment.id == partner_private_heart.id)
        ).scalar_one_or_none()
        == partner_private_heart.id
    )
    assert (
        session.query(binding.AccountProfileAttachment)
        .filter(binding.AccountProfileAttachment.account_id == owner.id)
        .count()
        == 0
    )

    deletion = apply_core_cleanup(session, owner.id)
    assert deletion is not None
    assert deletion.status == "PENDING"
    assert deletion.completed_at is None


class _FailThumbnailDeleteOnceStore(LocalMediaStore):
    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.delete_calls = 0

    def delete(self, storage_key: str) -> None:
        self.delete_calls += 1
        if self.delete_calls == 2:
            raise OSError("synthetic provider failure")
        super().delete(storage_key)


def test_account_media_cleanup_retries_partial_provider_delete_idempotently(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_account(session, "Anna")
    space = make_space(session, owner)
    attachment = _attachment(session, owner_id=owner.id, space_id=space.id, has_thumbnail=True)
    session.flush()

    store = _FailThumbnailDeleteOnceStore(tmp_path / "media")
    monkeypatch.setattr(service, "get_media_store", lambda: store)
    _put(store, attachment)

    accepted_at = now()
    apply_accepted_tombstone(session, owner.id, accepted_at=accepted_at)
    apply_core_cleanup(session, owner.id)

    first = apply_account_media_cleanup(session, owner.id)
    assert first.purge_failures == 1
    assert not first.converged
    assert attachment.status == AttachmentStatus.DELETE_FAILED.value
    assert not store.exists(service.storage_key_for(attachment))
    assert store.exists(service.storage_key_for(attachment, service.THUMBNAIL_VARIANT))

    second = apply_account_media_cleanup(session, owner.id)
    assert second.purged == 1
    assert second.purge_failures == 0
    assert second.converged
    assert session.get(Attachment, attachment.id) is None
    assert not store.exists(service.storage_key_for(attachment))
    assert not store.exists(service.storage_key_for(attachment, service.THUMBNAIL_VARIANT))

    deletion = apply_core_cleanup(session, owner.id)
    assert deletion is not None
    assert deletion.status == "PENDING"
    assert deletion.completed_at is None
    assert owner.disabled_at == accepted_at
