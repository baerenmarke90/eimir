"""One image per Plan using the canonical upload, binding and deletion lifecycle."""

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ValidationError
from eimir.plans.models import Plan


def replace_cover(
    session: Session,
    context: AuthorizationContext,
    plan: Plan,
    attachment_id: UUID | None,
    *,
    is_sensitive: bool | None = None,
) -> None:
    """The caller holds the Plan lock; attachment exclusivity is locked centrally."""
    previous_id = plan.cover_attachment_id
    if previous_id == attachment_id:
        if attachment_id is not None and is_sensitive is not None:
            candidate = binding.lock_for_binding(session, [attachment_id]).get(attachment_id)
            if candidate is not None:
                binding.set_sensitive(candidate, is_sensitive)
        return
    if attachment_id is not None:
        candidate = binding.ensure_bindable(
            binding.lock_for_binding(session, [attachment_id]).get(attachment_id),
            space_id=context.space_id,
            account_id=context.account_id,
        )
        if candidate.media_type != MediaType.IMAGE.value:
            raise ValidationError("A Plan cover must be an image.", "PLAN_COVER_IMAGE_REQUIRED")
        binding.ensure_unlinked(session, attachment_id, allow=("PLAN", plan.id))
        binding.set_sensitive(candidate, is_sensitive)
    plan.cover_attachment_id = attachment_id
    if previous_id is not None:
        detached = session.get(Attachment, previous_id)
        if detached is not None:
            attachments.mark_for_deletion(session, detached)
