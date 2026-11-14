"""HeartMoment galleries using the shared binding and privacy lifecycle."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding, photo_locations
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ForbiddenError, ValidationError
from eimir.heart_moments.models import HeartMoment

MediaSelection = list[tuple[UUID, bool | None]]


def galleries(
    session: Session, moments: list[HeartMoment]
) -> dict[UUID, list[binding.BoundAttachment]]:
    """Load ordered media in batch, including unchanged pre-gallery records."""
    result: dict[UUID, list[binding.BoundAttachment]] = {moment.id: [] for moment in moments}
    if not moments:
        return result
    extra = list(
        session.scalars(
            select(binding.HeartMomentAttachment)
            .where(binding.HeartMomentAttachment.heart_moment_id.in_(result))
            .order_by(binding.HeartMomentAttachment.position)
        )
    )
    ids = {moment.attachment_id for moment in moments if moment.attachment_id}
    ids.update(row.attachment_id for row in extra)
    media = {
        row.id: row for row in session.scalars(select(Attachment).where(Attachment.id.in_(ids)))
    }
    for moment in moments:
        if moment.attachment_id in media:
            result[moment.id].append(binding.BoundAttachment(media[moment.attachment_id], 0))
    for row in extra:
        if row.attachment_id in media:
            result[row.heart_moment_id].append(
                binding.BoundAttachment(media[row.attachment_id], row.position)
            )
    return result


def replace(
    session: Session,
    context: AuthorizationContext,
    moment: HeartMoment,
    selection: MediaSelection,
    *,
    selected_cover: UUID | None = None,
    cover_supplied: bool = False,
) -> None:
    """Caller holds the authorized parent lock; all writes share its version."""
    ids = [identifier for identifier, _ in selection]
    if len(set(ids)) != len(ids):
        raise ValidationError("A medium cannot appear twice.", "ATTACHMENT_DUPLICATE")
    if cover_supplied and selected_cover is not None and selected_cover not in ids:
        raise ValidationError("The cover must belong to this gallery.", "GALLERY_COVER_INVALID")
    current = galleries(session, [moment])[moment.id]
    previous = {entry.attachment.id for entry in current}
    locked = binding.lock_for_binding(session, sorted(previous | set(ids)))
    selected: list[Attachment] = []
    for identifier in ids:
        candidate = locked.get(identifier)
        existing = identifier in previous
        candidate = binding.ensure_bindable(
            candidate,
            space_id=context.space_id,
            account_id=candidate.owner_id if existing and candidate else context.account_id,
            already_bound=existing,
            allow_submitted_video=True,
            allow_audio=True,
        )
        binding.ensure_unlinked(session, identifier, allow=("HEART_MOMENT", moment.id))
        selected.append(candidate)
    if sum(item.media_type == MediaType.AUDIO for item in selected) > 1:
        raise ValidationError("Only one voice note is allowed.", "AUDIO_LIMIT_EXCEEDED")
    if selected_cover is not None and any(
        item.id == selected_cover and item.media_type == MediaType.AUDIO for item in selected
    ):
        raise ValidationError("Audio cannot be a gallery cover.", "GALLERY_COVER_INVALID")
    binding.ensure_within_limits(selected)
    for identifier in previous - set(ids):
        if context.account_id not in (moment.owner_id, locked[identifier].owner_id):
            raise ForbiddenError(
                "Only the author may remove another author's media.", "NOT_RESOURCE_OWNER"
            )
    for candidate, (_, sensitive) in zip(selected, selection, strict=True):
        binding.set_sensitive(
            candidate,
            sensitive,
            allow_change=binding.can_edit_sensitivity(
                candidate, account_id=context.account_id, parent_owner_id=moment.owner_id
            ),
        )
    for row in session.scalars(
        select(binding.HeartMomentAttachment).where(
            binding.HeartMomentAttachment.heart_moment_id == moment.id
        )
    ):
        session.delete(row)
    session.flush()
    moment.attachment_id = ids[0] if ids else None
    for position, identifier in enumerate(ids[1:], start=1):
        session.add(
            binding.HeartMomentAttachment(
                heart_moment_id=moment.id, attachment_id=identifier, position=position
            )
        )
    cover = selected_cover if cover_supplied else moment.payload.selected_cover_attachment_id
    moment.payload = moment.payload.model_copy(
        update={"selected_cover_attachment_id": cover if cover in ids else None}
    )
    for identifier in previous - set(ids):
        attachments.mark_for_deletion(session, locked[identifier])
    photo_locations.bind(session, context, moment, selected, heart=True)
    session.flush()
    for candidate in selected:
        if candidate.id not in previous:
            binding.notify_video_failure(session, candidate)


def replace_primary(
    session: Session,
    context: AuthorizationContext,
    moment: HeartMoment,
    identifier: UUID | None,
    sensitive: bool | None = None,
) -> None:
    """Older clients only replace position zero, retaining the rest of a gallery."""
    current = galleries(session, [moment])[moment.id]
    tail: MediaSelection = [
        (item.attachment.id, None)
        for item in current
        if item.position > 0 and item.attachment.id != identifier
    ]
    replace(session, context, moment, ([(identifier, sensitive)] if identifier else []) + tail)
