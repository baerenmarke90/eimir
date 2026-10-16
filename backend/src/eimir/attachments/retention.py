"""Binding-aware attachment retention shared by destructive privacy lifecycles."""

from __future__ import annotations

from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments.models import Attachment
from eimir.authorization import PrivacyClass
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.people.models import RelatedPerson


class OwnerAttachmentBinding(StrEnum):
    """Privacy-relevant current binding state for an owner-scoped attachment."""

    UNBOUND = "UNBOUND"
    ACCOUNT_PROFILE = "ACCOUNT_PROFILE"
    RETAIN_SHARED = "RETAIN_SHARED"
    OWNER_PRIVATE = "OWNER_PRIVATE"
    INCONSISTENT = "INCONSISTENT"


def _resource_binding(
    session: Session,
    *,
    model: type[Memory] | type[HeartMoment] | type[RelatedPerson],
    parent_id: UUID,
    account_id: UUID,
    attachment_space_id: UUID | None,
) -> OwnerAttachmentBinding:
    row = session.execute(
        select(model.space_id, model.owner_id, model.privacy_class).where(model.id == parent_id)
    ).one_or_none()
    if row is None:
        # The relation should normally disappear with its parent. Treat a
        # missing parent as unbound so the existing media lifecycle can collect
        # the now-orphaned object rather than retaining ghost data.
        return OwnerAttachmentBinding.UNBOUND

    parent_space_id, parent_owner_id, privacy_class = row
    if parent_space_id != attachment_space_id:
        # Account-owned profile media has no Space key, so it can never match a
        # Space-scoped parent. Reaching this branch means a Space resource claims
        # media that no longer belongs to any Space, which stays fail-closed.
        return OwnerAttachmentBinding.INCONSISTENT
    if privacy_class == PrivacyClass.SPACE_SHARED.value:
        return OwnerAttachmentBinding.RETAIN_SHARED
    if parent_owner_id == account_id and privacy_class == PrivacyClass.OWNER_ONLY.value:
        return OwnerAttachmentBinding.OWNER_PRIVATE
    return OwnerAttachmentBinding.INCONSISTENT


def classify_owner_attachment(
    session: Session,
    attachment: Attachment,
    *,
    account_id: UUID,
) -> OwnerAttachmentBinding:
    """Classify one attachment without deciding the caller's retention policy.

    Account deletion and Space self-offboarding share the same binding truth but
    differ for the Account-profile avatar: Account deletion removes it, while
    leaving one Space must preserve the still-live Account profile. Consumers
    therefore decide what to do with ``ACCOUNT_PROFILE`` after using this
    common classifier.
    """
    if attachment.owner_id != account_id:
        return OwnerAttachmentBinding.INCONSISTENT

    parent = binding.parent_of(session, attachment.id)
    if parent is None:
        return OwnerAttachmentBinding.UNBOUND

    parent_type, parent_id = parent
    if parent_type == "ACCOUNT_PROFILE":
        return (
            OwnerAttachmentBinding.ACCOUNT_PROFILE
            if parent_id == account_id
            else OwnerAttachmentBinding.INCONSISTENT
        )
    if parent_type == "MEMORY":
        return _resource_binding(
            session,
            model=Memory,
            parent_id=parent_id,
            account_id=account_id,
            attachment_space_id=attachment.space_id,
        )
    if parent_type == "HEART_MOMENT":
        return _resource_binding(
            session,
            model=HeartMoment,
            parent_id=parent_id,
            account_id=account_id,
            attachment_space_id=attachment.space_id,
        )
    if parent_type == "RELATED_PERSON":
        return _resource_binding(
            session,
            model=RelatedPerson,
            parent_id=parent_id,
            account_id=account_id,
            attachment_space_id=attachment.space_id,
        )
    return OwnerAttachmentBinding.INCONSISTENT
