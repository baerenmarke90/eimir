"""Apply staged PDF additions and removals under the Plan's write lock."""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import service as attachments
from eimir.attachments.binding import PlanFileAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ErrorCode, ValidationError
from eimir.plans.models import Plan


def files_of_plan(session: Session, plan_id: UUID) -> list[Attachment]:
    return list(
        session.scalars(
            select(Attachment)
            .join(PlanFileAttachment, PlanFileAttachment.attachment_id == Attachment.id)
            .where(
                PlanFileAttachment.plan_id == plan_id,
                Attachment.status == AttachmentStatus.READY.value,
            )
            .order_by(PlanFileAttachment.id)
        )
    )


def _links(session: Session, plan_id: UUID) -> dict[UUID, PlanFileAttachment]:
    return {
        row.attachment_id: row
        for row in session.scalars(
            select(PlanFileAttachment).where(PlanFileAttachment.plan_id == plan_id)
        )
    }


def _remove(session: Session, link: PlanFileAttachment, attachment: Attachment) -> None:
    session.delete(link)
    attachments.mark_for_deletion(session, attachment)


def change_files(
    session: Session,
    context: AuthorizationContext,
    plan: Plan,
    *,
    add: Sequence[UUID] = (),
    remove: Sequence[UUID] = (),
) -> bool:
    added, removed = set(add), set(remove)
    if len(added) != len(add) or len(removed) != len(remove) or added & removed:
        raise ValidationError("A file can only be changed once.", "ATTACHMENT_DUPLICATE")
    current = _links(session, plan.id)
    new_ids = added - current.keys()
    removed_ids = removed & current.keys()
    if len((current.keys() - removed_ids) | new_ids) > binding.MAX_GALLERY_ATTACHMENTS:
        raise ValidationError("The Plan file list is full.", ErrorCode.ATTACHMENT_LIMIT_EXCEEDED)

    locked = binding.lock_for_binding(session, list(new_ids | removed_ids))
    for identifier in add:
        if identifier not in new_ids:
            continue
        candidate = binding.ensure_bindable(
            locked.get(identifier),
            space_id=context.space_id,
            account_id=context.account_id,
            allow_documents=True,
        )
        if candidate.media_type != MediaType.DOCUMENT:
            raise ValidationError(
                "A Plan file must be a PDF.", ErrorCode.ATTACHMENT_TYPE_NOT_ALLOWED
            )
        binding.ensure_unlinked(session, identifier)
        session.add(PlanFileAttachment(plan_id=plan.id, attachment_id=identifier))
    for identifier in removed_ids:
        _remove(session, current[identifier], locked[identifier])
    return bool(new_ids or removed_ids)


def clear_files(session: Session, plan: Plan) -> None:
    current = _links(session, plan.id)
    for identifier, attachment in binding.lock_for_binding(session, list(current)).items():
        _remove(session, current[identifier], attachment)
