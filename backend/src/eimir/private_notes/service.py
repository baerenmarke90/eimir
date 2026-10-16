"""Domain logic for owner-only M3 PrivateNotes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    ContentVisibility,
    readable,
    require_readable,
    require_writable_locked,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service
from eimir.private_notes.models import PrivateNote, PrivateNotePayload, owner_only_privacy

PRIVATE_NOTE_TITLE_REQUIRED = "PRIVATE_NOTE_TITLE_REQUIRED"
_PRIVATE_NOTE_SUBJECT_TYPE = "private_note"


@dataclass(frozen=True)
class PrivateNotePageResult:
    items: list[PrivateNote]
    next_cursor: str | None
    has_more: bool


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Private Note title must not be blank.", PRIVATE_NOTE_TITLE_REQUIRED)
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(note: PrivateNote, expected_version: int) -> None:
    if note.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(
    session: Session,
    note: PrivateNote,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    """Record only private metadata; content and pin state never enter the event."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=note.space_id,
            actor_id=actor_id,
            subject_type=_PRIVATE_NOTE_SUBJECT_TYPE,
            subject_id=note.id,
            resource_version=note.version,
            payload=PublicEventPayload(visibility=ContentVisibility.PRIVATE),
        ),
    )


def create_note(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    body: str,
    pinned: bool,
) -> PrivateNote:
    note = PrivateNote(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=owner_only_privacy(),
        pinned=pinned,
        payload=PrivateNotePayload(title=_normalize_title(title), body=body),
    )
    session.add(note)
    _flush(session)
    _record(session, note, context.account_id, EventType.PRIVATE_NOTE_CREATED)
    _flush(session)
    return note


def get_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
) -> PrivateNote:
    return require_readable(session, PrivateNote, context, note_id)


def update_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    body: str | None,
    pinned: bool | None,
) -> PrivateNote:
    note = require_writable_locked(session, PrivateNote, context, note_id)
    _ensure_expected_version(note, expected_version)

    next_title = note.payload.title
    next_body = note.payload.body
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    if "body" in changed_fields:
        assert body is not None
        next_body = body
    if "pinned" in changed_fields:
        assert pinned is not None
        note.pinned = pinned
    note.payload = PrivateNotePayload(title=next_title, body=next_body)

    _flush(session)
    _record(session, note, context.account_id, EventType.PRIVATE_NOTE_UPDATED)
    _flush(session)
    return note


def delete_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    note = require_writable_locked(session, PrivateNote, context, note_id)
    _ensure_expected_version(note, expected_version)
    actor_id = context.account_id
    session.delete(note)
    _flush(session)
    _record(session, note, actor_id, EventType.PRIVATE_NOTE_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {
        "collection": "private_notes",
        "spaceId": str(context.space_id),
        "ownerId": str(context.account_id),
    }


def _encode_cursor(*, context: AuthorizationContext, created_at: datetime, note_id: UUID) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(note_id),
        },
    )


def _decode_cursor(token: str, *, context: AuthorizationContext) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context))
    created_raw = position.get("createdAt")
    note_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(note_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        note_id = UUID(note_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), note_id


def list_notes(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> PrivateNotePageResult:
    statement = readable(PrivateNote, context)
    if cursor is not None:
        created_at, note_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                PrivateNote.created_at < created_at,
                and_(PrivateNote.created_at == created_at, PrivateNote.id < note_id),
            )
        )
    statement = statement.order_by(PrivateNote.created_at.desc(), PrivateNote.id.desc()).limit(
        limit + 1
    )
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            created_at=last.created_at,
            note_id=last.id,
        )
    return PrivateNotePageResult(items=items, next_cursor=next_cursor, has_more=has_more)


__all__ = [
    "PRIVATE_NOTE_TITLE_REQUIRED",
    "PrivateNotePageResult",
    "create_note",
    "delete_note",
    "get_note",
    "list_notes",
    "update_note",
]
