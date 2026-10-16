"""Account avatar attachment-parent invariants for #368."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import PrivacyClass
from eimir.core.errors import ConflictError, ErrorCode
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def make_image_attachment(session: Session, account, space) -> Attachment:  # type: ignore[no-untyped-def]
    attachment = Attachment(
        space_id=space.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.PENDING.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=1,
        payload=AttachmentPayload(original_name="avatar.jpg"),
    )
    session.add(attachment)
    session.flush()
    return attachment


def test_profile_avatar_is_a_real_attachment_parent(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    attachment = make_image_attachment(session, account, space)
    session.add(
        binding.AccountProfileAttachment(
            account_id=account.id,
            attachment_id=attachment.id,
        )
    )
    session.flush()

    parent = ("ACCOUNT_PROFILE", account.id)
    assert binding.parent_of(session, attachment.id) == parent

    with pytest.raises(ConflictError) as caught:
        binding.ensure_unlinked(session, attachment.id)
    assert caught.value.code == ErrorCode.ATTACHMENT_ALREADY_LINKED

    # Reusing the same attachment for the same parent is the idempotent case
    # required by replacement/update flows.
    binding.ensure_unlinked(session, attachment.id, allow=parent)


def test_profile_binding_allows_only_one_current_avatar_per_account(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    first = make_image_attachment(session, account, space)
    second = make_image_attachment(session, account, space)
    session.add(
        binding.AccountProfileAttachment(
            account_id=account.id,
            attachment_id=first.id,
        )
    )
    session.flush()

    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            binding.AccountProfileAttachment(
                account_id=account.id,
                attachment_id=second.id,
            )
        )
        session.flush()


def test_profile_attachment_cannot_belong_to_two_accounts(session: Session) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    attachment = make_image_attachment(session, anna, space)
    session.add(
        binding.AccountProfileAttachment(
            account_id=anna.id,
            attachment_id=attachment.id,
        )
    )
    session.flush()

    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(
            binding.AccountProfileAttachment(
                account_id=ben.id,
                attachment_id=attachment.id,
            )
        )
        session.flush()


def test_space_deletion_cascades_avatar_binding(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    attachment = make_image_attachment(session, account, space)
    binding_row = binding.AccountProfileAttachment(
        account_id=account.id,
        attachment_id=attachment.id,
    )
    session.add(binding_row)
    session.flush()
    binding_id = binding_row.id

    session.delete(space)
    session.flush()

    assert (
        session.execute(
            select(binding.AccountProfileAttachment).where(
                binding.AccountProfileAttachment.id == binding_id
            )
        ).scalar_one_or_none()
        is None
    )
