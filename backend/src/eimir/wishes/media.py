"""The single optional Wish photo, using the canonical attachment lifecycle.

A Wish photo is an exclusive attachment binding stored in
``wishes.photo_attachment_id``. Binding follows the same rules as every other
parent (``eimir.attachments.binding``): the acting account must be the
uploader, the upload must be READY and inside its binding window, and the
attachment must not belong to another resource. Replacing or clearing the
photo schedules the previous attachment for deletion; a Plan created from the
Wish reaches the photo through ``Plan.source_wish_id`` and never copies it.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ValidationError
from eimir.wishes.models import Wish

WISH_PHOTO_IMAGE_REQUIRED = "WISH_PHOTO_IMAGE_REQUIRED"


def claim_photo(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID,
    *,
    wish: Wish | None = None,
) -> Attachment:
    """Validate and lock an attachment the acting account wants to bind to a Wish.

    The caller assigns ``photo_attachment_id`` afterwards in the same
    transaction. ``wish`` is the Wish being updated, or ``None`` for a Wish that
    does not exist yet; it only widens exclusivity for a photo the Wish already
    holds.
    """
    locked = binding.lock_for_binding(session, [attachment_id])
    candidate = binding.ensure_bindable(
        locked.get(attachment_id),
        space_id=context.space_id,
        account_id=context.account_id,
    )
    if candidate.media_type != MediaType.IMAGE.value:
        raise ValidationError("A Wish photo must be an image.", WISH_PHOTO_IMAGE_REQUIRED)
    allow = ("WISH", wish.id) if wish is not None else None
    binding.ensure_unlinked(session, attachment_id, allow=allow)
    return candidate


def replace_photo(
    session: Session,
    context: AuthorizationContext,
    wish: Wish,
    attachment_id: UUID | None,
) -> None:
    """Set or clear the Wish photo; the caller owns the Wish lock and version check.

    Re-sending the photo the Wish already holds changes nothing. A different
    photo replaces it, and the previous attachment is marked for deletion in the
    same transaction.
    """
    previous_id = wish.photo_attachment_id
    if attachment_id == previous_id:
        return
    # Lock old and new together, in one deterministic order, before reading state.
    locked = binding.lock_for_binding(
        session, [identifier for identifier in (previous_id, attachment_id) if identifier]
    )
    previous = locked.get(previous_id) if previous_id is not None else None
    if attachment_id is not None:
        claim_photo(session, context, attachment_id, wish=wish)
    wish.photo_attachment_id = attachment_id
    if previous is not None:
        attachments.mark_for_deletion(session, previous)


def release_photo(session: Session, wish: Wish) -> None:
    """Schedule the photo of a Wish that is about to be deleted for cleanup."""
    if wish.photo_attachment_id is None:
        return
    photo = binding.lock_for_binding(session, [wish.photo_attachment_id]).get(
        wish.photo_attachment_id
    )
    if photo is not None:
        attachments.mark_for_deletion(session, photo)
