"""Paginated media projections over the current authorized attachment bindings."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import Date, cast, func, literal, select, tuple_, union_all
from sqlalchemy.orm import Session

from eimir.attachments.binding import HeartMomentAttachment, MemoryAttachment, PlanAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, ContentVisibility, PrivacyClass, readable
from eimir.authorization.privacy import privacy_for
from eimir.core import cursor as cursor_codec
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.plans.models import Plan
from eimir.story.service import effective_date_expression

DEFAULT_LIMIT = 40
MAX_LIMIT = 100


class PhotoParentType(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"


class MediaGalleryParentType(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    PLAN = "PLAN"


# Ranks are part of the signed keyset position. Keep the original photo ranks.
PARENT_TYPES = {
    1: MediaGalleryParentType.MEMORY,
    2: MediaGalleryParentType.HEART_MOMENT,
    3: MediaGalleryParentType.PLAN,
}


@dataclass(frozen=True)
class GalleryRow:
    effective_date: date
    created_at: datetime
    kind_rank: int
    parent_id: UUID
    position_rank: int
    attachment_id: UUID
    attachment: Attachment

    @property
    def parent_type(self) -> MediaGalleryParentType:
        return PARENT_TYPES[self.kind_rank]


@dataclass(frozen=True)
class GalleryPageResult:
    items: list[GalleryRow]
    total_count: int
    next_cursor: str | None
    has_more: bool


def _binding(context: AuthorizationContext, visibility: ContentVisibility | None) -> dict[str, Any]:
    binding = {
        "collection": "shared_photos" if visibility is None else "media_gallery",
        "spaceId": str(context.space_id),
        "accountId": str(context.account_id),
    }
    if visibility is not None:
        binding["visibility"] = visibility.value
    return binding


def _position(row: GalleryRow) -> dict[str, Any]:
    return {
        "effectiveDate": row.effective_date.isoformat(),
        "createdAt": row.created_at.astimezone(UTC).isoformat(),
        "kindRank": row.kind_rank,
        "parentId": str(row.parent_id),
        "positionRank": row.position_rank,
        "attachmentId": str(row.attachment_id),
    }


def _decode(token: str, binding: dict[str, Any]) -> tuple[date, datetime, int, UUID, int, UUID]:
    raw = cursor_codec.decode(token, binding=binding)
    try:
        for field in ("effectiveDate", "createdAt", "parentId", "attachmentId"):
            if not isinstance(raw.get(field), str):
                raise ValueError("invalid cursor field")
        kind = raw.get("kindRank")
        position = raw.get("positionRank")
        if type(kind) is not int or kind not in PARENT_TYPES:
            raise ValueError("invalid kind")
        if type(position) is not int or position > 0:
            raise ValueError("invalid position")
        created_at = datetime.fromisoformat(raw["createdAt"])
        if created_at.tzinfo is None:
            raise ValueError("naive date")
        return (
            date.fromisoformat(raw["effectiveDate"]),
            created_at.astimezone(UTC),
            kind,
            UUID(raw["parentId"]),
            position,
            UUID(raw["attachmentId"]),
        )
    except (ValueError, TypeError) as error:
        raise cursor_codec.invalid_cursor() from error


def read_shared_photos(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> GalleryPageResult:
    """Keep the original shared-image collection for existing clients."""
    return _read_gallery(session, context, visibility=None, cursor=cursor, limit=limit)


def read_media_gallery(
    session: Session,
    context: AuthorizationContext,
    *,
    visibility: ContentVisibility = ContentVisibility.SHARED,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> GalleryPageResult:
    return _read_gallery(session, context, visibility=visibility, cursor=cursor, limit=limit)


def _read_gallery(
    session: Session,
    context: AuthorizationContext,
    *,
    visibility: ContentVisibility | None,
    cursor: str | None,
    limit: int,
) -> GalleryPageResult:
    cursor_binding = _binding(context, visibility)
    position_key = _decode(cursor, cursor_binding) if cursor is not None else None
    privacy = PrivacyClass.SPACE_SHARED if visibility is None else privacy_for(visibility)
    memory_date = effective_date_expression(Memory)
    heart_date = effective_date_expression(HeartMoment)
    plan_date = func.coalesce(
        Plan.experienced_on, cast(func.timezone("UTC", Plan.created_at), Date)
    )
    legs = []
    # The parent grants reads. Attachment ownership can differ on shared entries.
    for model, rank, relation, parent_id, attachment_id, position, effective_date in (
        (
            Memory,
            1,
            MemoryAttachment,
            MemoryAttachment.memory_id,
            MemoryAttachment.attachment_id,
            -MemoryAttachment.position,
            memory_date,
        ),
        (HeartMoment, 2, None, None, HeartMoment.attachment_id, literal(0), heart_date),
        (
            HeartMoment,
            2,
            HeartMomentAttachment,
            HeartMomentAttachment.heart_moment_id,
            HeartMomentAttachment.attachment_id,
            -HeartMomentAttachment.position,
            heart_date,
        ),
        (Plan, 3, None, None, Plan.cover_attachment_id, literal(0), plan_date),
        (
            Plan,
            3,
            PlanAttachment,
            PlanAttachment.plan_id,
            PlanAttachment.attachment_id,
            -PlanAttachment.position,
            plan_date,
        ),
    ):
        if model is Plan and visibility is None:
            continue
        statement = readable(model, context).where(model.privacy_class == privacy)
        if relation is not None and parent_id is not None:
            statement = statement.join(relation, parent_id == model.id)
        statement = statement.join(Attachment, Attachment.id == attachment_id)
        if visibility is None or model is Plan:
            statement = statement.where(Attachment.media_type == MediaType.IMAGE)
        legs.append(
            statement.where(
                Attachment.space_id == context.space_id,
                Attachment.status == AttachmentStatus.READY,
            ).with_only_columns(
                effective_date.label("effective_date"),
                model.created_at.label("created_at"),
                literal(rank).label("kind_rank"),
                model.id.label("parent_id"),
                position.label("position_rank"),
                Attachment.id.label("attachment_id"),
            )
        )
    gallery = union_all(*legs).subquery("media_gallery")
    key = tuple(gallery.c)
    # Fetch attachment metadata in the same statement as parent authorization.
    page_query = select(*key, Attachment).join_from(
        gallery, Attachment, Attachment.id == gallery.c.attachment_id
    )
    if position_key is not None:
        page_query = page_query.where(
            tuple_(*key)
            < tuple_(
                *(
                    literal(value, column.type)
                    for value, column in zip(position_key, key, strict=True)
                )
            )
        )
    rows = session.execute(page_query.order_by(*(column.desc() for column in key)).limit(limit + 1))
    items = [GalleryRow(*row) for row in rows]
    has_more = len(items) > limit
    items = items[:limit]
    next_cursor = (
        cursor_codec.encode(binding=cursor_binding, position=_position(items[-1]))
        if has_more
        else None
    )
    total_count = session.scalar(select(func.count()).select_from(gallery)) or 0
    return GalleryPageResult(items, total_count, next_cursor, has_more)
