"""Domain logic for M2 memories.

The service enforces tenant/owner boundaries before every resource mutation,
keeps ``ProtectedPayload`` out of cursors and events, and couples domain state
with the transactional outbox in the same request transaction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment
from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_writable,
    require_writable_locked,
)
from eimir.core import cursor as cursor_codec
from eimir.core.clock import now
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.memories.models import Memory, MemoryPayload, shared_privacy
from eimir.outbox import service as outbox_service

_MEMORY_SUBJECT_TYPE = "memory"


@dataclass(frozen=True)
class MemoryPageResult:
    items: list[Memory]
    next_cursor: str | None
    has_more: bool


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Memory title must not be blank.", "MEMORY_TITLE_REQUIRED")
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(memory: Memory, expected_version: int) -> None:
    if memory.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(session: Session, memory: Memory, actor_id: UUID, event_type: EventType) -> None:
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=memory.space_id,
            actor_id=actor_id,
            subject_type=_MEMORY_SUBJECT_TYPE,
            subject_id=memory.id,
            resource_version=memory.version,
            payload=PublicEventPayload(),
        ),
    )


def create_memory(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    body: str,
    happened_on: date | None,
) -> Memory:
    memory = Memory(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        happened_on=happened_on,
        payload=MemoryPayload(title=_normalize_title(title), body=body),
    )
    session.add(memory)
    _flush(session)
    _record(session, memory, context.account_id, EventType.MEMORY_CREATED)
    _flush(session)
    return memory


def get_memory(
    session: Session,
    context: AuthorizationContext,
    memory_id: UUID | str,
) -> Memory:
    return require_readable(session, Memory, context, memory_id)


def update_memory(
    session: Session,
    context: AuthorizationContext,
    memory_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    body: str | None,
    happened_on: date | None,
) -> Memory:
    memory = require_writable(session, Memory, context, memory_id)
    _ensure_expected_version(memory, expected_version)

    next_title = memory.payload.title
    next_body = memory.payload.body
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    if "body" in changed_fields:
        assert body is not None
        next_body = body
    if "happened_on" in changed_fields:
        memory.happened_on = happened_on

    if "title" in changed_fields or "body" in changed_fields:
        memory.payload = MemoryPayload(title=next_title, body=next_body)

    _flush(session)
    _record(session, memory, context.account_id, EventType.MEMORY_UPDATED)
    _flush(session)
    return memory


def delete_memory(
    session: Session,
    context: AuthorizationContext,
    memory_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    memory = require_writable_locked(session, Memory, context, memory_id)
    _ensure_expected_version(memory, expected_version)
    actor_id = context.account_id
    from eimir.story import view_service
    from eimir.story.service import StoryKind

    view_service.purge_target(
        session,
        space_id=memory.space_id,
        kind=StoryKind.MEMORY,
        item_id=memory.id,
    )
    session.delete(memory)
    _flush(session)
    _record(session, memory, actor_id, EventType.MEMORY_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext, year: int | None) -> dict[str, Any]:
    """Bind a memory cursor to its space and year filter."""
    return {"collection": "memories", "spaceId": str(context.space_id), "year": year}


def _encode_cursor(
    *,
    context: AuthorizationContext,
    year: int | None,
    created_at: datetime,
    memory_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, year),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(memory_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    year: int | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, year))
    created_raw = position.get("createdAt")
    memory_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(memory_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        memory_id = UUID(memory_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), memory_id


def _apply_year_filter(statement: Any, year: int | None) -> Any:
    if year is None:
        return statement
    day_start = date(year, 1, 1)
    day_end = date(year + 1, 1, 1)
    time_start = datetime(year, 1, 1, tzinfo=UTC)
    time_end = datetime(year + 1, 1, 1, tzinfo=UTC)
    return statement.where(
        or_(
            and_(Memory.happened_on >= day_start, Memory.happened_on < day_end),
            and_(
                Memory.happened_on.is_(None),
                Memory.created_at >= time_start,
                Memory.created_at < time_end,
            ),
        )
    )


def list_memories(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    year: int | None,
) -> MemoryPageResult:
    statement = _apply_year_filter(readable(Memory, context), year)
    if cursor is not None:
        created_at, memory_id = _decode_cursor(cursor, context=context, year=year)
        statement = statement.where(
            or_(
                Memory.created_at < created_at,
                and_(Memory.created_at == created_at, Memory.id < memory_id),
            )
        )

    statement = statement.order_by(Memory.created_at.desc(), Memory.id.desc()).limit(limit + 1)
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            year=year,
            created_at=last.created_at,
            memory_id=last.id,
        )
    return MemoryPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


def replace_attachments(
    session: Session,
    context: AuthorizationContext,
    memory_id: UUID | str,
    *,
    expected_version: int,
    entries: list[tuple[UUID, int]],
) -> Memory:
    """Replace the complete attachment gallery of a memory.

    This is PUT semantics rather than incremental add/remove. The set and order
    are the state the client observed, and ``If-Match`` ensures it still owns
    that version. Any partial failure leaves the existing gallery unchanged
    because the entire operation runs in one transaction.
    """
    from eimir.attachments import binding

    memory = require_writable(session, Memory, context, memory_id)
    _ensure_expected_version(memory, expected_version)

    positions = [position for _, position in entries]
    if sorted(positions) != list(range(len(entries))):
        raise ValidationError(
            "Positions must be a gapless zero-based sequence.",
            "ATTACHMENT_POSITION_INVALID",
        )
    identifiers = [attachment_id for attachment_id, _ in entries]
    if len(set(identifiers)) != len(identifiers):
        raise ValidationError(
            "An attachment may appear at most once.",
            "ATTACHMENT_POSITION_INVALID",
        )

    locked = binding.lock_for_binding(session, identifiers)
    attachments = []
    for attachment_id in identifiers:
        attachment = binding.ensure_bindable(
            locked.get(attachment_id),
            space_id=context.space_id,
            account_id=context.account_id,
        )
        binding.ensure_unlinked(session, attachment_id, allow=("MEMORY", memory.id))
        attachments.append(attachment)
    binding.ensure_within_limits(attachments)

    previous = {bound.attachment.id for bound in binding.attachments_of_memory(session, memory.id)}
    session.execute(
        delete(binding.MemoryAttachment).where(binding.MemoryAttachment.memory_id == memory.id)
    )
    # Flush the empty set before re-inserting it in the same operation;
    # otherwise the unique ``position`` constraint could collide with itself
    # when two attachments swap positions.
    session.flush()
    for attachment_id, position in entries:
        session.add(
            binding.MemoryAttachment(
                memory_id=memory.id,
                attachment_id=attachment_id,
                position=position,
            )
        )

    for removed in previous - set(identifiers):
        detached = session.get(Attachment, removed)
        if detached is not None:
            # The last reference was removed. It becomes domain-unreferenced
            # immediately and provider cleanup remains asynchronous (M2-D11).
            attachment_service.mark_for_deletion(session, detached)

    memory.updated_at = now()
    _flush(session)
    _record(session, memory, context.account_id, EventType.MEMORY_UPDATED)
    _flush(session)
    return memory
