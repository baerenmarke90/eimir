"""Binding-aware media and Transfer convergence for #518 Space self-offboarding."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import cleanup as attachment_cleanup
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.jobs.models import Job, JobStatus
from eimir.memories.models import Memory, MemoryPayload
from eimir.relationship import offboarding
from eimir.relationship.models import MembershipStatus
from eimir.relationship.service import add_member
from eimir.transfer import service as transfer_service
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
    TransferScope,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _attachment(session: Session, *, owner_id, space_id) -> Attachment:  # type: ignore[no-untyped-def]
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
        has_thumbnail=False,
        ready_at=now(),
        payload=AttachmentPayload(original_name="space-offboarding-fixture.png"),
    )
    session.add(row)
    session.flush()
    return row


def test_space_exit_marks_only_leaver_private_media_and_expires_only_scoped_transfers(
    session: Session,
) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)
    other_space = make_space(session, owner)

    shared_attachment = _attachment(session, owner_id=owner.id, space_id=space.id)
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
    avatar_attachment = _attachment(session, owner_id=owner.id, space_id=space.id)
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
    other_space_attachment = _attachment(session, owner_id=owner.id, space_id=other_space.id)

    original_expiry = now() + timedelta(hours=12)
    owner_export = TransferExport(
        space_id=space.id,
        created_by=owner.id,
        scope=TransferScope.PERSONAL.value,
        status=ExportStatus.QUEUED.value,
        expires_at=original_expiry,
    )
    owner_import = TransferImport(
        space_id=space.id,
        created_by=owner.id,
        status=ImportStatus.QUEUED.value,
        artifact_size=8,
        expires_at=original_expiry,
    )
    partner_export = TransferExport(
        space_id=space.id,
        created_by=partner.id,
        scope=TransferScope.SHARED.value,
        status=ExportStatus.QUEUED.value,
        expires_at=original_expiry,
    )
    other_space_export = TransferExport(
        space_id=other_space.id,
        created_by=owner.id,
        scope=TransferScope.PERSONAL.value,
        status=ExportStatus.QUEUED.value,
        expires_at=original_expiry,
    )
    session.add_all([owner_export, owner_import, partner_export, other_space_export])
    session.flush()

    result = offboarding.leave_space(session, owner, space.id)
    session.flush()
    after_exit = now()

    assert result.changed
    assert result.membership.status == MembershipStatus.LEFT.value
    assert (
        session.execute(
            select(func.count(HeartMoment.id)).where(HeartMoment.id == private_heart.id)
        ).scalar_one()
        == 0
    )
    assert (
        session.execute(
            select(func.count(HeartMoment.id)).where(HeartMoment.id == partner_private_heart.id)
        ).scalar_one()
        == 1
    )

    assert shared_attachment.status == AttachmentStatus.READY.value
    assert private_attachment.status == AttachmentStatus.DELETING.value
    assert unbound_attachment.status == AttachmentStatus.DELETING.value
    assert avatar_attachment.status == AttachmentStatus.READY.value
    assert partner_attachment.status == AttachmentStatus.READY.value
    assert other_space_attachment.status == AttachmentStatus.READY.value

    assert owner_export.expires_at <= after_exit
    assert owner_import.expires_at <= after_exit
    assert partner_export.expires_at == original_expiry
    assert other_space_export.expires_at == original_expiry

    assert (
        session.execute(
            select(func.count(Job.id)).where(
                Job.kind == attachment_cleanup.MEDIA_CLEANUP,
                Job.status == JobStatus.PENDING.value,
            )
        ).scalar_one()
        == 1
    )
    assert (
        session.execute(
            select(func.count(Job.id)).where(
                Job.kind == transfer_service.CLEANUP_JOB_KIND,
                Job.status == JobStatus.PENDING.value,
            )
        ).scalar_one()
        == 1
    )
