"""Shared-only photo projection over existing authorized Attachment bindings (#601)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, func, literal, select, tuple_, union_all
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core import cursor as cursor_codec
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.story.service import effective_date_expression

DEFAULT_LIMIT = 40
MAX_LIMIT = 100


class PhotoParentType(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"


@dataclass(frozen=True)
class PhotoRow:
    effective_date: date
    created_at: datetime
    kind_rank: int
    parent_id: UUID
    position_rank: int
    attachment_id: UUID

    @property
    def parent_type(self) -> PhotoParentType:
        return PhotoParentType.MEMORY if self.kind_rank == 1 else PhotoParentType.HEART_MOMENT


@dataclass(frozen=True)
class PhotoPageResult:
    items: list[PhotoRow]
    total_count: int
    next_cursor: str | None
    has_more: bool


def _binding(context: AuthorizationContext) -> dict[str, Any]:
    return {
        "collection": "shared_photos",
        "spaceId": str(context.space_id),
        "accountId": str(context.account_id),
    }


def _position(row: PhotoRow) -> dict[str, Any]:
    return {
        "effectiveDate": row.effective_date.isoformat(),
        "createdAt": row.created_at.astimezone(UTC).isoformat(),
        "kindRank": row.kind_rank,
        "parentId": str(row.parent_id),
        "positionRank": row.position_rank,
        "attachmentId": str(row.attachment_id),
    }


def _decode(
    token: str, context: AuthorizationContext
) -> tuple[date, datetime, int, UUID, int, UUID]:
    raw = cursor_codec.decode(token, binding=_binding(context))
    try:
        for field in ("effectiveDate", "createdAt", "parentId", "attachmentId"):
            if not isinstance(raw.get(field), str):
                raise ValueError("invalid cursor field")
        kind = raw.get("kindRank")
        position = raw.get("positionRank")
        if type(kind) is not int or kind not in (1, 2):
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
) -> PhotoPageResult:
    # Shared-only is stricter than the viewer-authorized timeline, even for
    # the owner. Bindings, not Attachment.owner_account_id, grant photo reads.
    legs = []
    for model, rank in ((Memory, 1), (HeartMoment, 2)):
        statement = readable(model, context).where(model.privacy_class == PrivacyClass.SPACE_SHARED)
        if model is Memory:
            statement = statement.join(MemoryAttachment, MemoryAttachment.memory_id == model.id)
            statement = statement.join(Attachment, Attachment.id == MemoryAttachment.attachment_id)
            # Negate position so one descending tuple preserves parent order.
            position: ColumnElement[int] = -MemoryAttachment.position
        else:
            statement = statement.join(Attachment, Attachment.id == HeartMoment.attachment_id)
            position = literal(0)
        legs.append(
            statement.where(
                Attachment.space_id == context.space_id,
                Attachment.status == AttachmentStatus.READY,
                Attachment.media_type == MediaType.IMAGE,
            ).with_only_columns(
                effective_date_expression(model).label("effective_date"),
                model.created_at.label("created_at"),
                literal(rank).label("kind_rank"),
                model.id.label("parent_id"),
                position.label("position_rank"),
                Attachment.id.label("attachment_id"),
            )
        )
    photos = union_all(*legs).subquery("shared_photos")
    key = tuple(photos.c)
    statement = select(*key)
    if cursor is not None:
        position_key = _decode(cursor, context)
        statement = statement.where(
            tuple_(*key)
            < tuple_(
                *(
                    literal(value, column.type)
                    for value, column in zip(position_key, key, strict=True)
                )
            )
        )
    rows = session.execute(statement.order_by(*(column.desc() for column in key)).limit(limit + 1))
    items = [PhotoRow(*row) for row in rows]
    has_more = len(items) > limit
    items = items[:limit]
    next_cursor = (
        cursor_codec.encode(binding=_binding(context), position=_position(items[-1]))
        if has_more
        else None
    )
    total_count = session.scalar(select(func.count()).select_from(photos)) or 0
    return PhotoPageResult(items, total_count, next_cursor, has_more)
