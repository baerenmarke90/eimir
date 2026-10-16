"""Domain logic for M3 chapters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_readable_shared,
    require_writable_locked,
)
from eimir.chapters.models import Chapter, ChapterPayload, shared_privacy
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service
from eimir.places.models import Place

_CHAPTER_SUBJECT_TYPE = "chapter"

CHAPTER_TITLE_REQUIRED = "CHAPTER_TITLE_REQUIRED"
CHAPTER_DATE_RANGE_INVALID = "CHAPTER_DATE_RANGE_INVALID"


@dataclass(frozen=True)
class ChapterPageResult:
    items: list[Chapter]
    next_cursor: str | None
    has_more: bool


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Chapter title must not be blank.", CHAPTER_TITLE_REQUIRED)
    return cleaned


def _validate_dates(start_on: date | None, end_on: date | None) -> None:
    if start_on is not None and end_on is not None and end_on < start_on:
        raise ValidationError(
            "A chapter cannot end before it starts.",
            CHAPTER_DATE_RANGE_INVALID,
        )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(chapter: Chapter, expected_version: int) -> None:
    if chapter.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(session: Session, chapter: Chapter, actor_id: UUID, event_type: EventType) -> None:
    """Record references only; title, description and dates stay out of events."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=chapter.space_id,
            actor_id=actor_id,
            subject_type=_CHAPTER_SUBJECT_TYPE,
            subject_id=chapter.id,
            resource_version=chapter.version,
            payload=PublicEventPayload(),
        ),
    )


def _resolve_place(
    session: Session,
    context: AuthorizationContext,
    place_id: UUID | str | None,
) -> UUID | None:
    if place_id is None:
        return None
    return require_readable_shared(session, Place, context, place_id).id


def create_chapter(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    description: str | None,
    start_on: date | None,
    end_on: date | None,
    place_id: UUID | str | None,
) -> Chapter:
    _validate_dates(start_on, end_on)
    chapter = Chapter(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        start_on=start_on,
        end_on=end_on,
        place_id=_resolve_place(session, context, place_id),
        payload=ChapterPayload(title=_normalize_title(title), description=description),
    )
    session.add(chapter)
    _flush(session)
    _record(session, chapter, context.account_id, EventType.CHAPTER_CREATED)
    _flush(session)
    return chapter


def get_chapter(
    session: Session,
    context: AuthorizationContext,
    chapter_id: UUID | str,
) -> Chapter:
    return require_readable(session, Chapter, context, chapter_id)


def update_chapter(
    session: Session,
    context: AuthorizationContext,
    chapter_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    description: str | None,
    start_on: date | None,
    end_on: date | None,
    place_id: UUID | str | None,
) -> Chapter:
    # Place must be locked before Chapter to remain compatible with Place delete.
    resolved_place = (
        _resolve_place(session, context, place_id) if "place_id" in changed_fields else None
    )
    chapter = require_writable_locked(session, Chapter, context, chapter_id)
    _ensure_expected_version(chapter, expected_version)

    next_start = start_on if "start_on" in changed_fields else chapter.start_on
    next_end = end_on if "end_on" in changed_fields else chapter.end_on
    _validate_dates(next_start, next_end)

    if "start_on" in changed_fields:
        chapter.start_on = start_on
    if "end_on" in changed_fields:
        chapter.end_on = end_on
    if "place_id" in changed_fields:
        chapter.place_id = resolved_place

    next_title = chapter.payload.title
    next_description = chapter.payload.description
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    if "description" in changed_fields:
        next_description = description
    if "title" in changed_fields or "description" in changed_fields:
        chapter.payload = ChapterPayload(title=next_title, description=next_description)

    _flush(session)
    _record(session, chapter, context.account_id, EventType.CHAPTER_UPDATED)
    _flush(session)
    return chapter


def delete_chapter(
    session: Session,
    context: AuthorizationContext,
    chapter_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    chapter = require_writable_locked(session, Chapter, context, chapter_id)
    _ensure_expected_version(chapter, expected_version)
    actor_id = context.account_id
    session.delete(chapter)
    _flush(session)
    _record(session, chapter, actor_id, EventType.CHAPTER_DELETED)
    _flush(session)


def detach_place(session: Session, place: Place, actor_id: UUID) -> int:
    """Detach a deleted Place from Chapters while preserving version semantics."""
    chapters = list(
        session.execute(
            select(Chapter)
            .where(Chapter.space_id == place.space_id, Chapter.place_id == place.id)
            .order_by(Chapter.id)
            .with_for_update()
        ).scalars()
    )
    for chapter in chapters:
        chapter.place_id = None
        _flush(session)
        _record(session, chapter, actor_id, EventType.CHAPTER_UPDATED)
        _flush(session)
    return len(chapters)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {"collection": "chapters", "spaceId": str(context.space_id)}


def _encode_cursor(*, context: AuthorizationContext, created_at: datetime, chapter_id: UUID) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(chapter_id),
        },
    )


def _decode_cursor(token: str, *, context: AuthorizationContext) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context))
    created_raw = position.get("createdAt")
    chapter_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(chapter_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        chapter_id = UUID(chapter_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), chapter_id


def list_chapters(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> ChapterPageResult:
    statement = readable(Chapter, context)
    if cursor is not None:
        created_at, chapter_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                Chapter.created_at < created_at,
                and_(Chapter.created_at == created_at, Chapter.id < chapter_id),
            )
        )

    statement = statement.order_by(Chapter.created_at.desc(), Chapter.id.desc()).limit(limit + 1)
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            created_at=last.created_at,
            chapter_id=last.id,
        )
    return ChapterPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


__all__ = [
    "CHAPTER_DATE_RANGE_INVALID",
    "CHAPTER_TITLE_REQUIRED",
    "ChapterPageResult",
    "create_chapter",
    "delete_chapter",
    "detach_place",
    "get_chapter",
    "list_chapters",
    "update_chapter",
]
