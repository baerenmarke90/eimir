"""Account-owned storage home for Account-global profile media (#692).

The avatar is Account-global presentation identity: the same current image
renders in every Space where its Account is an active member, and self-exit
from one Space deliberately keeps it. Its backing ``Attachment`` was still
Space-owned, so the final zero-active-Space purge removed the row and cascaded
the profile binding away. An Account that stayed active elsewhere lost its
avatar because two lifecycles claimed the same object.

This module resolves that by making ownership follow the contract instead of
the upload location. Binding an attachment as Account profile media *adopts*
it: the provider object moves to the Account storage home and the row loses its
Space key, after which the Account is its only lifecycle parent. Space
retention then has nothing of that Account's profile media left to purge, and
no ``Attachment`` row survives pointing at a removed Space.

Adoption is not a visibility change. The avatar remains readable only through
the profile-avatar route, which authorizes the subject's profile in the
caller's own Space before it resolves any binding. Storage location never
grants access here.

Ordering is chosen so an interruption can never destroy the binding:

1. copy the object to the Account home, skipping variants already there;
2. move the row to the Account home and, in the same transaction, enqueue the
   removal of the Space-home object.

Until (2) commits, the Space-home object is still the authoritative one and the
avatar keeps rendering. After it commits, the origin removal is a durable Job
with the origin key in its payload, so a crash in between retries rather than
leaking. A copy made by a transaction that later rolled back is collected by
``service.purge``, which removes both possible homes of a row.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments import service
from eimir.attachments.models import Attachment
from eimir.attachments.retention import OwnerAttachmentBinding, classify_owner_attachment
from eimir.jobs import queue
from eimir.jobs.worker import JobRegistry, registry
from eimir.media import build_account_storage_key, build_storage_key, get_media_store

log = logging.getLogger(__name__)

ORIGIN_CLEANUP_JOB = "account_profile_media_origin_cleanup"
"""Removes the Space-home object after its row moved to the Account home."""


def _variants(attachment: Attachment) -> list[str]:
    variants = [service.ORIGINAL_VARIANT]
    if attachment.has_thumbnail:
        variants.append(service.THUMBNAIL_VARIANT)
    return variants


def _content_type(attachment: Attachment, variant: str) -> str:
    if variant == service.THUMBNAIL_VARIANT:
        # Thumbnails are generated as JPEG by the validation step.
        return "image/jpeg"
    return attachment.mime_type or attachment.declared_mime_type


def adopt(session: Session, attachment: Attachment) -> bool:
    """Move one attachment into its owner's Account storage home.

    Returns whether this call changed the row. Calling it again for an already
    adopted attachment is a no-op, so every caller may run it unconditionally
    and a retried caller converges instead of copying twice.

    A missing origin object is skipped rather than raising: those bytes are
    already gone and cannot be preserved, while the row must still leave the
    Space so retention does not cascade the profile binding away. Any other
    provider failure propagates, because silently continuing would move the row
    away from bytes that still exist.
    """
    origin_space_id = attachment.space_id
    if origin_space_id is None:
        return False

    store = get_media_store()
    for variant in _variants(attachment):
        target = build_account_storage_key(attachment.owner_id, attachment.id, variant)
        if store.exists(target):
            continue
        origin = build_storage_key(origin_space_id, attachment.id, variant)
        if not store.exists(origin):
            log.warning(
                "account profile media origin object missing",
                extra={"attachmentId": str(attachment.id), "variant": variant},
            )
            continue
        store.copy(origin, target, _content_type(attachment, variant))

    attachment.space_id = None
    queue.enqueue(
        session,
        ORIGIN_CLEANUP_JOB,
        {
            "spaceId": str(origin_space_id),
            "attachmentId": str(attachment.id),
            "variants": _variants(attachment),
        },
    )
    session.flush()
    return True


def adopt_if_account_profile(session: Session, attachment: Attachment) -> bool:
    """Adopt this attachment when it is its owner's current profile media.

    The shared binding classifier is the single source of truth about what an
    owner-scoped attachment currently belongs to, so a Space lifecycle never
    has to restate the profile contract to recognize an avatar.
    """
    if attachment.space_id is None:
        return False
    binding_state = classify_owner_attachment(
        session,
        attachment,
        account_id=attachment.owner_id,
    )
    if binding_state is not OwnerAttachmentBinding.ACCOUNT_PROFILE:
        return False
    return adopt(session, attachment)


def run_origin_cleanup(session: Session, payload: dict[str, Any]) -> None:
    """Delete the Space-home object of an already adopted attachment.

    The payload carries the origin key parts because the row no longer does.
    Deleting an object that is already gone is not an error, so replaying this
    job is safe; a provider failure raises and the existing queue retries it.
    """
    del session
    space_value = payload.get("spaceId")
    attachment_value = payload.get("attachmentId")
    if not isinstance(space_value, str) or not isinstance(attachment_value, str):
        return
    variants = payload.get("variants")
    if not isinstance(variants, list):
        variants = [service.ORIGINAL_VARIANT]

    space_id = UUID(space_value)
    attachment_id = UUID(attachment_value)
    store = get_media_store()
    for variant in variants:
        if not isinstance(variant, str):
            continue
        store.delete(build_storage_key(space_id, attachment_id, variant))


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(ORIGIN_CLEANUP_JOB) is None:
        destination.register(ORIGIN_CLEANUP_JOB, run_origin_cleanup)
