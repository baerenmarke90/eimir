"""Domain logic for owner-only M3 GiftIdeas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
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
from eimir.gift_ideas.models import (
    GiftIdea,
    GiftIdeaPayload,
    GiftIdeaStatus,
    owner_only_privacy,
)
from eimir.outbox import service as outbox_service

GIFT_IDEA_TITLE_REQUIRED = "GIFT_IDEA_TITLE_REQUIRED"
GIFT_IDEA_STATUS_TRANSITION_INVALID = "GIFT_IDEA_STATUS_TRANSITION_INVALID"
_GIFT_IDEA_SUBJECT_TYPE = "gift_idea"
_ALLOWED_STATUS_TRANSITIONS: frozenset[tuple[GiftIdeaStatus, GiftIdeaStatus]] = frozenset(
    {
        (GiftIdeaStatus.IDEA, GiftIdeaStatus.BOUGHT),
        (GiftIdeaStatus.IDEA, GiftIdeaStatus.GIVEN),
        (GiftIdeaStatus.BOUGHT, GiftIdeaStatus.IDEA),
        (GiftIdeaStatus.BOUGHT, GiftIdeaStatus.GIVEN),
        (GiftIdeaStatus.GIVEN, GiftIdeaStatus.BOUGHT),
    }
)


@dataclass(frozen=True)
class GiftIdeaPageResult:
    items: list[GiftIdea]
    next_cursor: str | None
    has_more: bool


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Gift Idea title must not be blank.", GIFT_IDEA_TITLE_REQUIRED)
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(idea: GiftIdea, expected_version: int) -> None:
    if idea.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _validate_status_transition(current: str, target: GiftIdeaStatus) -> None:
    current_status = GiftIdeaStatus(current)
    if target is current_status:
        return
    if (current_status, target) not in _ALLOWED_STATUS_TRANSITIONS:
        raise ConflictError(
            f"Gift Idea status cannot change from {current_status.value} to {target.value}.",
            GIFT_IDEA_STATUS_TRANSITION_INVALID,
        )


def _record(
    session: Session,
    idea: GiftIdea,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    """Record only private metadata; content/status/pin never enter the event."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=idea.space_id,
            actor_id=actor_id,
            subject_type=_GIFT_IDEA_SUBJECT_TYPE,
            subject_id=idea.id,
            resource_version=idea.version,
            payload=PublicEventPayload(visibility=ContentVisibility.PRIVATE),
        ),
    )


def create_idea(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    description: str | None,
    recipient: str | None,
    occasion: str | None,
    target_on: date | None,
    price_text: str | None,
    url: str | None,
    pinned: bool,
) -> GiftIdea:
    idea = GiftIdea(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=owner_only_privacy(),
        status=GiftIdeaStatus.IDEA.value,
        pinned=pinned,
        payload=GiftIdeaPayload(
            title=_normalize_title(title),
            description=description,
            recipient=recipient,
            occasion=occasion,
            target_on=target_on,
            price_text=price_text,
            url=url,
        ),
    )
    session.add(idea)
    _flush(session)
    _record(session, idea, context.account_id, EventType.GIFT_IDEA_CREATED)
    _flush(session)
    return idea


def get_idea(
    session: Session,
    context: AuthorizationContext,
    idea_id: UUID | str,
) -> GiftIdea:
    return require_readable(session, GiftIdea, context, idea_id)


def update_idea(
    session: Session,
    context: AuthorizationContext,
    idea_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    description: str | None,
    recipient: str | None,
    occasion: str | None,
    target_on: date | None,
    price_text: str | None,
    url: str | None,
    status: GiftIdeaStatus | None,
    pinned: bool | None,
) -> GiftIdea:
    idea = require_writable_locked(session, GiftIdea, context, idea_id)
    _ensure_expected_version(idea, expected_version)

    payload = idea.payload.model_copy()
    if "title" in changed_fields:
        assert title is not None
        payload.title = _normalize_title(title)
    if "description" in changed_fields:
        payload.description = description
    if "recipient" in changed_fields:
        payload.recipient = recipient
    if "occasion" in changed_fields:
        payload.occasion = occasion
    if "target_on" in changed_fields:
        payload.target_on = target_on
    if "price_text" in changed_fields:
        payload.price_text = price_text
    if "url" in changed_fields:
        payload.url = url
    if "status" in changed_fields:
        assert status is not None
        _validate_status_transition(idea.status, status)
        idea.status = status.value
    if "pinned" in changed_fields:
        assert pinned is not None
        idea.pinned = pinned
    idea.payload = payload

    _flush(session)
    _record(session, idea, context.account_id, EventType.GIFT_IDEA_UPDATED)
    _flush(session)
    return idea


def delete_idea(
    session: Session,
    context: AuthorizationContext,
    idea_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    idea = require_writable_locked(session, GiftIdea, context, idea_id)
    _ensure_expected_version(idea, expected_version)
    actor_id = context.account_id
    session.delete(idea)
    _flush(session)
    _record(session, idea, actor_id, EventType.GIFT_IDEA_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {
        "collection": "gift_ideas",
        "spaceId": str(context.space_id),
        "ownerId": str(context.account_id),
    }


def _encode_cursor(*, context: AuthorizationContext, created_at: datetime, idea_id: UUID) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(idea_id),
        },
    )


def _decode_cursor(token: str, *, context: AuthorizationContext) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context))
    created_raw = position.get("createdAt")
    idea_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(idea_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        idea_id = UUID(idea_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), idea_id


def list_ideas(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> GiftIdeaPageResult:
    statement = readable(GiftIdea, context)
    if cursor is not None:
        created_at, idea_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                GiftIdea.created_at < created_at,
                and_(GiftIdea.created_at == created_at, GiftIdea.id < idea_id),
            )
        )
    statement = statement.order_by(GiftIdea.created_at.desc(), GiftIdea.id.desc()).limit(limit + 1)
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            created_at=last.created_at,
            idea_id=last.id,
        )
    return GiftIdeaPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


__all__ = [
    "GIFT_IDEA_STATUS_TRANSITION_INVALID",
    "GIFT_IDEA_TITLE_REQUIRED",
    "GiftIdeaPageResult",
    "create_idea",
    "delete_idea",
    "get_idea",
    "list_ideas",
    "update_idea",
]
