"""Domain logic for shared notes (#1969)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_writable_locked,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity.models import Account
from eimir.outbox import service as outbox_service
from eimir.relationship.models import Membership, MembershipStatus
from eimir.shared_notes.models import (
    BODY_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    SharedNote,
    SharedNotePayload,
    shared_privacy,
)

SHARED_NOTE_SUBJECT_TYPE = "shared_note"

SHARED_NOTE_EMPTY = "SHARED_NOTE_EMPTY"
SHARED_NOTE_TITLE_TOO_LONG = "SHARED_NOTE_TITLE_TOO_LONG"
SHARED_NOTE_BODY_TOO_LONG = "SHARED_NOTE_BODY_TOO_LONG"

_CURSOR_COLLECTION = "shared-notes"


@dataclass(frozen=True)
class SharedNotePageResult:
    items: list[SharedNote]
    next_cursor: str | None
    has_more: bool


def normalize_content(title: str | None, body: str | None) -> tuple[str, str]:
    """Trim and validate note text; a note needs a title or a body.

    The title is optional on purpose: capturing words must not require inventing
    a heading. Line endings are normalized so Windows and mobile keyboards store
    the same text.
    """
    cleaned_title = (title or "").strip()
    cleaned_body = (body or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(cleaned_title) > TITLE_MAX_LENGTH:
        raise ValidationError(
            f"Shared note title must be at most {TITLE_MAX_LENGTH} characters.",
            SHARED_NOTE_TITLE_TOO_LONG,
        )
    if len(cleaned_body) > BODY_MAX_LENGTH:
        raise ValidationError(
            f"Shared note text must be at most {BODY_MAX_LENGTH} characters.",
            SHARED_NOTE_BODY_TOO_LONG,
        )
    if not cleaned_title and not cleaned_body:
        raise ValidationError(
            "A shared note needs a title or some text.",
            SHARED_NOTE_EMPTY,
        )
    return cleaned_title, cleaned_body


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(note: SharedNote, expected_version: int) -> None:
    if note.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _partner_ids(session: Session, space_id: UUID, actor_id: UUID) -> list[UUID]:
    """The other active members of the Space, who learn about a new or changed note."""
    return list(
        session.scalars(
            select(Membership.account_id)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Membership.account_id != actor_id,
                Account.disabled_at.is_(None),
            )
            .order_by(Membership.account_id)
        )
    )


def _record(
    session: Session,
    note: SharedNote,
    actor_id: UUID,
    event_type: EventType,
    *,
    notify_partner: bool = False,
) -> None:
    """Record references only; note titles and text stay out of events.

    A change the partner should hear about is recorded once per recipient so the
    notification projection finds the recipient in the event, as it does for
    comments.
    """
    recipients: list[UUID | None] = [None]
    if notify_partner:
        recipients = [*_partner_ids(session, note.space_id, actor_id)] or [None]
    for recipient_id in recipients:
        outbox_service.record(
            session,
            DomainEvent(
                type=event_type,
                space_id=note.space_id,
                actor_id=actor_id,
                subject_type=SHARED_NOTE_SUBJECT_TYPE,
                subject_id=note.id,
                resource_version=note.version,
                payload=PublicEventPayload(recipient_id=recipient_id),
            ),
        )


def create_note(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str | None,
    body: str | None,
    pinned: bool = False,
) -> SharedNote:
    cleaned_title, cleaned_body = normalize_content(title, body)
    note = SharedNote(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        pinned=pinned,
        wir_title_only=False,
        edited_at=datetime.now(UTC),
        edited_by=context.account_id,
        payload=SharedNotePayload(title=cleaned_title, body=cleaned_body),
    )
    session.add(note)
    _flush(session)
    _record(session, note, context.account_id, EventType.SHARED_NOTE_CREATED, notify_partner=True)
    _flush(session)
    return note


def get_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
) -> SharedNote:
    return require_readable(session, SharedNote, context, note_id)


def update_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    body: str | None,
) -> SharedNote:
    """Change the text of a note; a write that changes nothing is not an edit."""
    note = require_writable_locked(session, SharedNote, context, note_id)
    _ensure_expected_version(note, expected_version)

    next_title = note.payload.title
    next_body = note.payload.body
    if "title" in changed_fields:
        next_title = title or ""
    if "body" in changed_fields:
        next_body = body or ""
    cleaned_title, cleaned_body = normalize_content(next_title, next_body)
    if cleaned_title == note.payload.title and cleaned_body == note.payload.body:
        return note

    note.payload = SharedNotePayload(title=cleaned_title, body=cleaned_body)
    note.edited_at = datetime.now(UTC)
    note.edited_by = context.account_id
    _flush(session)
    _record(session, note, context.account_id, EventType.SHARED_NOTE_UPDATED, notify_partner=True)
    _flush(session)
    return note


def set_presentation(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
    *,
    pinned: bool | None,
    wir_title_only: bool | None,
) -> SharedNote:
    """Pin a note to Wir or hide its excerpt there.

    This sets a state rather than applying a delta, so repeating it is harmless
    and it needs no version check. It is not an edit of the text.
    """
    note = require_writable_locked(session, SharedNote, context, note_id)
    changed = False
    if pinned is not None and note.pinned != pinned:
        note.pinned = pinned
        changed = True
    if wir_title_only is not None and note.wir_title_only != wir_title_only:
        note.wir_title_only = wir_title_only
        changed = True
    if not changed:
        return note
    _flush(session)
    _record(session, note, context.account_id, EventType.SHARED_NOTE_PRESENTATION_CHANGED)
    _flush(session)
    return note


def delete_note(
    session: Session,
    context: AuthorizationContext,
    note_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    note = require_writable_locked(session, SharedNote, context, note_id)
    _ensure_expected_version(note, expected_version)
    actor_id = context.account_id
    session.delete(note)
    _flush(session)
    _record(session, note, actor_id, EventType.SHARED_NOTE_DELETED)
    _flush(session)


def _cursor_binding(
    context: AuthorizationContext,
    pinned: bool | None,
    ids: Iterable[UUID] | None,
) -> dict[str, Any]:
    binding: dict[str, Any] = {"collection": _CURSOR_COLLECTION, "spaceId": str(context.space_id)}
    if pinned is not None:
        binding["pinned"] = "true" if pinned else "false"
    if ids is not None:
        binding["ids"] = ",".join(sorted(str(identifier) for identifier in ids))
    return binding


def _encode_cursor(
    *,
    context: AuthorizationContext,
    edited_at: datetime,
    note_id: UUID,
    pinned: bool | None,
    ids: Iterable[UUID] | None,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, pinned, ids),
        position={
            "editedAt": edited_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(note_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    pinned: bool | None,
    ids: Iterable[UUID] | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, pinned, ids))
    edited_raw = position.get("editedAt")
    note_raw = position.get("id")
    if not isinstance(edited_raw, str) or not isinstance(note_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        edited_at = datetime.fromisoformat(edited_raw.replace("Z", "+00:00"))
        note_id = UUID(note_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if edited_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return edited_at.astimezone(UTC), note_id


def list_notes(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    pinned: bool | None = None,
    ids: Sequence[UUID] | None = None,
) -> SharedNotePageResult:
    """Page readable shared notes, most recently edited first.

    ``pinned`` answers "which notes belong on Wir" without paging through the
    others; ``ids`` lets a client read several known notes in one request.
    """
    statement = readable(SharedNote, context)
    if pinned is not None:
        statement = statement.where(SharedNote.pinned.is_(pinned))
    if ids is not None:
        statement = statement.where(SharedNote.id.in_(ids))
    if cursor is not None:
        edited_at, note_id = _decode_cursor(cursor, context=context, pinned=pinned, ids=ids)
        statement = statement.where(
            or_(
                SharedNote.edited_at < edited_at,
                and_(SharedNote.edited_at == edited_at, SharedNote.id < note_id),
            )
        )
    statement = statement.order_by(SharedNote.edited_at.desc(), SharedNote.id.desc()).limit(
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
            edited_at=last.edited_at,
            note_id=last.id,
            pinned=pinned,
            ids=ids,
        )
    return SharedNotePageResult(items=items, next_cursor=next_cursor, has_more=has_more)
