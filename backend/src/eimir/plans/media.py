"""Ordered Plan photos using the canonical attachment ownership lifecycle."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ValidationError
from eimir.plans.models import Plan

PhotoSelection = list[tuple[UUID, bool | None]]


def photos_of_plans(
    session: Session, plans: list[Plan]
) -> dict[UUID, list[binding.BoundAttachment]]:
    """Batch both the designated cover and ordered supplemental bindings."""
    result: dict[UUID, list[binding.BoundAttachment]] = {plan.id: [] for plan in plans}
    if not plans:
        return result
    extra = list(
        session.scalars(
            select(binding.PlanAttachment)
            .where(binding.PlanAttachment.plan_id.in_(list(result)))
            .order_by(binding.PlanAttachment.position)
        )
    )
    ids = {plan.cover_attachment_id for plan in plans if plan.cover_attachment_id}
    ids.update(row.attachment_id for row in extra)
    media = (
        {row.id: row for row in session.scalars(select(Attachment).where(Attachment.id.in_(ids)))}
        if ids
        else {}
    )
    for plan in plans:
        if plan.cover_attachment_id is not None and plan.cover_attachment_id in media:
            result[plan.id].append(binding.BoundAttachment(media[plan.cover_attachment_id], 0))
    for row in extra:
        if row.attachment_id in media:
            result[row.plan_id].append(
                binding.BoundAttachment(media[row.attachment_id], row.position)
            )
    return result


def replace_photos(
    session: Session, context: AuthorizationContext, plan: Plan, selection: PhotoSelection
) -> None:
    """Replace one versioned gallery atomically; the caller owns the Plan lock.

    Existing shared photos may have been uploaded by either partner. New media
    must belong to the acting uploader; authorization never widens on reuse.
    """
    ids = [photo_id for photo_id, _ in selection]
    if len(set(ids)) != len(ids):
        raise ValidationError("A photo cannot appear twice.", "ATTACHMENT_DUPLICATE")
    extra = list(
        session.scalars(
            select(binding.PlanAttachment).where(binding.PlanAttachment.plan_id == plan.id)
        )
    )
    previous = {row.attachment_id for row in extra}
    if plan.cover_attachment_id:
        previous.add(plan.cover_attachment_id)
    if not previous and not ids:
        # Do not dirty an initially unset cover FK with an explicit None after
        # insertion. An empty newly created Plan must keep its initial version.
        return
    locked = binding.lock_for_binding(session, sorted(previous | set(ids)))
    selected: list[Attachment] = []
    for photo_id in ids:
        candidate = locked.get(photo_id)
        existing = photo_id in previous
        candidate = binding.ensure_bindable(
            candidate,
            space_id=context.space_id,
            account_id=candidate.owner_id
            if existing and candidate is not None
            else context.account_id,
            already_bound=existing,
        )
        if candidate.media_type != MediaType.IMAGE.value:
            raise ValidationError("A Plan photo must be an image.", "PLAN_COVER_IMAGE_REQUIRED")
        binding.ensure_unlinked(session, photo_id, allow=("PLAN", plan.id))
        selected.append(candidate)
    binding.ensure_within_limits(selected)
    for candidate, (_, sensitive) in zip(selected, selection, strict=True):
        binding.set_sensitive(candidate, sensitive)
    for row in extra:
        session.delete(row)
    # Release old unique positions before assigning the new order. Moving a
    # photo between cover and supplemental roles never schedules its deletion.
    session.flush()
    plan.cover_attachment_id = ids[0] if ids else None
    for position, photo_id in enumerate(ids[1:], start=1):
        session.add(
            binding.PlanAttachment(plan_id=plan.id, attachment_id=photo_id, position=position)
        )
    for photo_id in previous - set(ids):
        candidate = locked.get(photo_id)
        if candidate is not None:
            attachments.mark_for_deletion(session, candidate)


def replace_cover(
    session: Session,
    context: AuthorizationContext,
    plan: Plan,
    attachment_id: UUID | None,
    *,
    is_sensitive: bool | None = None,
) -> None:
    """Compatibility for cover-only clients, retaining every supplemental photo."""
    current = photos_of_plans(session, [plan])[plan.id]
    extra: PhotoSelection = [
        (item.attachment.id, None)
        for item in current
        if item.position > 0 and item.attachment.id != attachment_id
    ]
    replace_photos(
        session, context, plan, ([(attachment_id, is_sensitive)] if attachment_id else []) + extra
    )
