"""Domain logic for shared M3 collections."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_writable_locked,
)
from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
    shared_privacy,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.core.ids import parse_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service

_COLLECTION_SUBJECT_TYPE = "collection"
_COLLECTION_ITEM_SUBJECT_TYPE = "collection_item"

COLLECTION_TITLE_REQUIRED = "COLLECTION_TITLE_REQUIRED"
COLLECTION_ITEM_TITLE_REQUIRED = "COLLECTION_ITEM_TITLE_REQUIRED"
COLLECTION_ITEM_NOT_FOUND = "COLLECTION_ITEM_NOT_FOUND"
COLLECTION_ORDER_INVALID = "COLLECTION_ORDER_INVALID"
COLLECTION_ORDER_CONFLICT = "COLLECTION_ORDER_CONFLICT"


@dataclass(frozen=True)
class CollectionPageResult:
    items: list[Collection]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class CollectionItemUpdateResult:
    item: CollectionItem
    collection_became_complete: bool


def _normalize_title(value: str, *, item: bool = False) -> str:
    cleaned = value.strip()
    if not cleaned:
        code = COLLECTION_ITEM_TITLE_REQUIRED if item else COLLECTION_TITLE_REQUIRED
        noun = "Collection Item" if item else "Collection"
        raise ValidationError(f"{noun} title must not be blank.", code)
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(resource: Collection | CollectionItem, expected_version: int) -> None:
    if resource.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _ensure_order_version(collection: Collection, expected_version: int) -> None:
    if collection.version != expected_version:
        raise ConflictError(
            "The Collection order changed since it was loaded.",
            COLLECTION_ORDER_CONFLICT,
        )


def _touch_collection(collection: Collection) -> None:
    """Mark an aggregate structure/order change so its root version advances once."""
    collection.updated_at = datetime.now(UTC)


def _record(
    session: Session,
    *,
    event_type: EventType,
    actor_id: UUID,
    space_id: UUID,
    subject_type: str,
    subject_id: UUID,
    resource_version: int,
) -> None:
    """Record references only; Collection and Item titles stay out of events."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=space_id,
            actor_id=actor_id,
            subject_type=subject_type,
            subject_id=subject_id,
            resource_version=resource_version,
            payload=PublicEventPayload(),
        ),
    )


def _record_collection(
    session: Session,
    collection: Collection,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    _record(
        session,
        event_type=event_type,
        actor_id=actor_id,
        space_id=collection.space_id,
        subject_type=_COLLECTION_SUBJECT_TYPE,
        subject_id=collection.id,
        resource_version=collection.version,
    )


def _record_item(
    session: Session,
    collection: Collection,
    item: CollectionItem,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    _record(
        session,
        event_type=event_type,
        actor_id=actor_id,
        space_id=collection.space_id,
        subject_type=_COLLECTION_ITEM_SUBJECT_TYPE,
        subject_id=item.id,
        resource_version=item.version,
    )


def create_collection(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
) -> Collection:
    collection = Collection(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        payload=CollectionPayload(title=_normalize_title(title)),
    )
    session.add(collection)
    _flush(session)
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_CREATED)
    _flush(session)
    return collection


def get_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
) -> Collection:
    return require_readable(session, Collection, context, collection_id)


def update_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
) -> Collection:
    collection = require_writable_locked(session, Collection, context, collection_id)
    _ensure_expected_version(collection, expected_version)

    next_title = collection.payload.title
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    collection.payload = CollectionPayload(title=next_title)

    _flush(session)
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_UPDATED)
    _flush(session)
    return collection


def delete_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    collection = require_writable_locked(session, Collection, context, collection_id)
    _ensure_expected_version(collection, expected_version)
    actor_id = context.account_id
    session.delete(collection)
    _flush(session)
    _record_collection(session, collection, actor_id, EventType.COLLECTION_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {"collection": "collections", "spaceId": str(context.space_id)}


def _encode_cursor(
    *,
    context: AuthorizationContext,
    created_at: datetime,
    collection_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(collection_id),
        },
    )


def _decode_cursor(token: str, *, context: AuthorizationContext) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context))
    created_raw = position.get("createdAt")
    collection_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(collection_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        collection_id = UUID(collection_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), collection_id


def list_collections(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> CollectionPageResult:
    statement = readable(Collection, context)
    if cursor is not None:
        created_at, collection_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                Collection.created_at < created_at,
                and_(Collection.created_at == created_at, Collection.id < collection_id),
            )
        )

    statement = statement.order_by(Collection.created_at.desc(), Collection.id.desc()).limit(
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
            collection_id=last.id,
        )
    return CollectionPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


def list_items(session: Session, collection: Collection) -> list[CollectionItem]:
    return list(
        session.execute(
            select(CollectionItem)
            .where(CollectionItem.collection_id == collection.id)
            .order_by(CollectionItem.position, CollectionItem.id)
        ).scalars()
    )


def list_items_for_collections(
    session: Session,
    collection_ids: Iterable[UUID],
) -> dict[UUID, list[CollectionItem]]:
    ids = list(collection_ids)
    if not ids:
        return {}
    items = list(
        session.execute(
            select(CollectionItem)
            .where(CollectionItem.collection_id.in_(ids))
            .order_by(CollectionItem.position, CollectionItem.id)
        ).scalars()
    )
    result: dict[UUID, list[CollectionItem]] = {cid: [] for cid in ids}
    for item in items:
        result[item.collection_id].append(item)
    return result


def _item_identifier(value: UUID | str) -> UUID:
    identifier = value if isinstance(value, UUID) else parse_id(value)
    if identifier is None:
        raise NotFoundError("Collection Item not found.", COLLECTION_ITEM_NOT_FOUND)
    return identifier


def _require_item_locked(
    session: Session,
    collection: Collection,
    item_id: UUID | str,
) -> CollectionItem:
    identifier = _item_identifier(item_id)
    item = session.execute(
        select(CollectionItem)
        .where(
            CollectionItem.collection_id == collection.id,
            CollectionItem.id == identifier,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Collection Item not found.", COLLECTION_ITEM_NOT_FOUND)
    return item


def create_item(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    title: str,
    completed: bool,
) -> CollectionItem:
    collection = require_writable_locked(session, Collection, context, collection_id)
    position = session.execute(
        select(func.count(CollectionItem.id)).where(CollectionItem.collection_id == collection.id)
    ).scalar_one()
    item = CollectionItem(
        collection_id=collection.id,
        created_by=context.account_id,
        completed=completed,
        position=position,
        payload=CollectionItemPayload(title=_normalize_title(title, item=True)),
    )
    session.add(item)
    _touch_collection(collection)
    _flush(session)
    _record_item(session, collection, item, context.account_id, EventType.COLLECTION_ITEM_CREATED)
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_UPDATED)
    _flush(session)
    return item


def update_item_with_completion_transition(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    item_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    completed: bool | None,
) -> CollectionItemUpdateResult:
    collection = require_writable_locked(session, Collection, context, collection_id)
    item = _require_item_locked(session, collection, item_id)
    _ensure_expected_version(item, expected_version)

    was_completed = item.completed
    if "title" in changed_fields:
        assert title is not None
        item.payload = CollectionItemPayload(title=_normalize_title(title, item=True))
    if "completed" in changed_fields:
        assert completed is not None
        item.completed = completed

    _flush(session)

    collection_became_complete = False
    if "completed" in changed_fields and completed is True and not was_completed:
        incomplete_items = session.execute(
            select(func.count(CollectionItem.id)).where(
                CollectionItem.collection_id == collection.id,
                CollectionItem.completed.is_(False),
            )
        ).scalar_one()
        collection_became_complete = incomplete_items == 0

    _record_item(session, collection, item, context.account_id, EventType.COLLECTION_ITEM_UPDATED)
    _flush(session)
    return CollectionItemUpdateResult(
        item=item,
        collection_became_complete=collection_became_complete,
    )


def update_item(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    item_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    completed: bool | None,
) -> CollectionItem:
    return update_item_with_completion_transition(
        session,
        context,
        collection_id,
        item_id,
        expected_version=expected_version,
        changed_fields=changed_fields,
        title=title,
        completed=completed,
    ).item


def _compact_after_delete(session: Session, collection_id: UUID, deleted_position: int) -> None:
    session.execute(
        update(CollectionItem)
        .where(
            CollectionItem.collection_id == collection_id,
            CollectionItem.position > deleted_position,
        )
        .values(
            position=CollectionItem.position - 1,
            updated_at=CollectionItem.updated_at,
        ),
        execution_options={"synchronize_session": False},
    )


def delete_item(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    item_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    collection = require_writable_locked(session, Collection, context, collection_id)
    item = _require_item_locked(session, collection, item_id)
    _ensure_expected_version(item, expected_version)
    deleted_position = item.position
    deleted_id = item.id
    deleted_version = item.version

    session.delete(item)
    _flush(session)
    _compact_after_delete(session, collection.id, deleted_position)
    _touch_collection(collection)
    _flush(session)
    _record(
        session,
        event_type=EventType.COLLECTION_ITEM_DELETED,
        actor_id=context.account_id,
        space_id=collection.space_id,
        subject_type=_COLLECTION_ITEM_SUBJECT_TYPE,
        subject_id=deleted_id,
        resource_version=deleted_version,
    )
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_UPDATED)
    _flush(session)


def reorder_items(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
    item_ids: list[UUID],
) -> Collection:
    collection = require_writable_locked(session, Collection, context, collection_id)
    _ensure_order_version(collection, expected_version)

    current_ids = list(
        session.execute(
            select(CollectionItem.id)
            .where(CollectionItem.collection_id == collection.id)
            .order_by(CollectionItem.position)
            .with_for_update()
        ).scalars()
    )
    if len(item_ids) != len(current_ids) or len(set(item_ids)) != len(item_ids):
        raise ValidationError(
            "Collection order must contain every current Item exactly once.",
            COLLECTION_ORDER_INVALID,
        )
    if set(item_ids) != set(current_ids):
        raise ValidationError(
            "Collection order must contain every current Item exactly once.",
            COLLECTION_ORDER_INVALID,
        )

    if item_ids:
        position_by_id = {item_id: position for position, item_id in enumerate(item_ids)}
        session.execute(
            update(CollectionItem)
            .where(CollectionItem.collection_id == collection.id)
            .values(
                position=case(position_by_id, value=CollectionItem.id),
                updated_at=CollectionItem.updated_at,
            ),
            execution_options={"synchronize_session": False},
        )

    _touch_collection(collection)
    _flush(session)
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_REORDERED)
    _flush(session)
    return collection


__all__ = [
    "COLLECTION_ITEM_NOT_FOUND",
    "COLLECTION_ITEM_TITLE_REQUIRED",
    "COLLECTION_ORDER_CONFLICT",
    "COLLECTION_ORDER_INVALID",
    "COLLECTION_TITLE_REQUIRED",
    "CollectionItemUpdateResult",
    "CollectionPageResult",
    "create_collection",
    "create_item",
    "delete_collection",
    "delete_item",
    "get_collection",
    "list_collections",
    "list_items",
    "reorder_items",
    "update_collection",
    "update_item",
    "update_item_with_completion_transition",
]
