"""Tests for centralized batch resolution of AuthorSummary projections."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.attachments.binding import AccountProfileAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_resolve_author_summaries_empty(session: Session) -> None:
    assert resolve_author_summaries(session, set()) == {}


def test_resolve_author_summaries_without_and_with_avatars(session: Session) -> None:
    user_without_avatar = make_account(session, "No Avatar User")
    user_with_avatar = make_account(session, "Avatar User")
    space = make_space(session, user_with_avatar)

    avatar_attachment = Attachment(
        id=uuid4(),
        space_id=space.id,
        owner_id=user_with_avatar.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/png",
        declared_size=2048,
        ready_at=now(),
        payload=AttachmentPayload(original_name="profile.png"),
    )
    session.add(avatar_attachment)
    session.flush()

    binding = AccountProfileAttachment(
        account_id=user_with_avatar.id,
        attachment_id=avatar_attachment.id,
    )
    session.add(binding)
    session.flush()

    summaries = resolve_author_summaries(
        session,
        [user_without_avatar.id, user_with_avatar.id],
    )

    assert len(summaries) == 2
    no_avatar = summaries[user_without_avatar.id]
    assert no_avatar.id == user_without_avatar.id
    assert no_avatar.display_name == "No Avatar User"
    assert no_avatar.is_former_member is False
    assert no_avatar.profile_attachment_id is None

    with_avatar = summaries[user_with_avatar.id]
    assert with_avatar.id == user_with_avatar.id
    assert with_avatar.display_name == "Avatar User"
    assert with_avatar.is_former_member is False
    assert with_avatar.profile_attachment_id == avatar_attachment.id


def test_accepted_deletion_suppresses_author_identity_before_cleanup(session: Session) -> None:
    user = make_account(session, "Private Name")
    space = make_space(session, user)
    avatar = Attachment(
        id=uuid4(),
        space_id=space.id,
        owner_id=user.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=1024,
        ready_at=now(),
        payload=AttachmentPayload(original_name="private-avatar.jpg"),
    )
    session.add(avatar)
    session.flush()
    session.add(AccountProfileAttachment(account_id=user.id, attachment_id=avatar.id))
    session.flush()

    session.add(
        AccountDeletion(
            account_id=user.id,
            status=AccountDeletionStatus.PENDING.value,
            accepted_at=now(),
        )
    )
    session.flush()

    summary = resolve_author_summary(session, user.id)
    assert summary.is_former_member is True
    assert summary.display_name == ""
    assert summary.profile_attachment_id is None
    assert "Private Name" not in summary.model_dump_json(by_alias=True)
    assert str(avatar.id) not in summary.model_dump_json(by_alias=True)


def test_disabled_account_is_not_a_former_member(session: Session) -> None:
    user = make_account(session, "Suspended User")
    user.disabled_at = now()
    session.flush()

    summary = resolve_author_summary(session, user.id)
    assert summary.is_former_member is False
    assert summary.display_name == "Suspended User"


def test_resolve_author_summary_single(session: Session) -> None:
    user = make_account(session, "Single User")
    space = make_space(session, user)

    summary = resolve_author_summary(session, user.id, resource="Test User")
    assert summary.id == user.id
    assert summary.display_name == "Single User"
    assert summary.is_former_member is False
    assert summary.profile_attachment_id is None

    avatar = Attachment(
        id=uuid4(),
        space_id=space.id,
        owner_id=user.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=1024,
        ready_at=now(),
        payload=AttachmentPayload(original_name="avatar.jpg"),
    )
    session.add(avatar)
    session.flush()

    session.add(AccountProfileAttachment(account_id=user.id, attachment_id=avatar.id))
    session.flush()

    updated_summary = resolve_author_summary(session, user.id, resource="Test User")
    assert updated_summary.profile_attachment_id == avatar.id


def test_resolve_author_summary_missing_raises(session: Session) -> None:
    with pytest.raises(RuntimeError, match="Ghost author disappeared"):
        resolve_author_summary(session, uuid4(), resource="Ghost author")
