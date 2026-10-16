"""Avatar replacement/removal lifecycle for the Account profile."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.attachments import binding as attachment_binding
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.core.errors import NotFoundError, ValidationError
from eimir.profiles import service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def ready_attachment(
    session: Session,
    *,
    account_id,
    space_id,
    media_type: MediaType = MediaType.IMAGE,
) -> Attachment:  # type: ignore[no-untyped-def]
    attachment = Attachment(
        space_id=space_id,
        owner_id=account_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=media_type.value,
        declared_mime_type="image/jpeg" if media_type is MediaType.IMAGE else "video/mp4",
        declared_size=1,
        mime_type="image/jpeg" if media_type is MediaType.IMAGE else "video/mp4",
        size=1,
        ready_at=now(),
        payload=AttachmentPayload(original_name="avatar.jpg"),
    )
    session.add(attachment)
    session.flush()
    return attachment


def context_for(account_id, space_id) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def test_replacing_avatar_binds_new_image_and_retires_old_media(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    old = ready_attachment(session, account_id=account.id, space_id=space.id)
    new = ready_attachment(session, account_id=account.id, space_id=space.id)
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=account.id,
            attachment_id=old.id,
        )
    )
    session.flush()

    result = service.set_profile_attachment(session, context_for(account.id, space.id), new.id)

    assert result is not None
    assert result.id == new.id
    current = service.profile_attachment(session, account.id)
    assert current is not None
    assert current.id == new.id
    assert old.status == AttachmentStatus.DELETING.value
    assert new.status == AttachmentStatus.READY.value


def test_removing_avatar_detaches_and_retires_old_media(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    old = ready_attachment(session, account_id=account.id, space_id=space.id)
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=account.id,
            attachment_id=old.id,
        )
    )
    session.flush()

    assert service.set_profile_attachment(session, context_for(account.id, space.id), None) is None
    assert service.profile_attachment(session, account.id) is None
    assert old.status == AttachmentStatus.DELETING.value


def test_setting_same_avatar_is_idempotent(session: Session) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    image = ready_attachment(session, account_id=account.id, space_id=space.id)
    session.add(
        attachment_binding.AccountProfileAttachment(
            account_id=account.id,
            attachment_id=image.id,
        )
    )
    session.flush()

    result = service.set_profile_attachment(session, context_for(account.id, space.id), image.id)

    assert result is not None
    assert result.id == image.id
    assert image.status == AttachmentStatus.READY.value


def test_avatar_candidate_must_be_owned_ready_image_in_current_space(session: Session) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    current_space = make_space(session, owner)
    foreign_space = make_space(session, owner)

    partner_image = ready_attachment(
        session,
        account_id=partner.id,
        space_id=current_space.id,
    )
    foreign_space_image = ready_attachment(
        session,
        account_id=owner.id,
        space_id=foreign_space.id,
    )
    video = ready_attachment(
        session,
        account_id=owner.id,
        space_id=current_space.id,
        media_type=MediaType.VIDEO,
    )

    context = context_for(owner.id, current_space.id)
    for candidate_id in (partner_image.id, foreign_space_image.id, uuid4()):
        with pytest.raises(NotFoundError):
            service.set_profile_attachment(session, context, candidate_id)

    with pytest.raises(ValidationError) as caught:
        service.set_profile_attachment(session, context, video.id)
    assert caught.value.code == service.ProfileErrorCode.AVATAR_IMAGE_REQUIRED
