"""Domain logic for owner-only M3 PrivateCollections."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, update
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
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.core.ids import parse_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service
from eimir.private_collections.models import (
    PrivateCollection,
    PrivateCollectionItem,
    PrivateCollectionItemPayload,
    PrivateCollectionPayload,
    owner_only_privacy,
)

_PRIVATE_COLLECTION_SUBJECT_TYPE = "private_collection"
_PRIVATE_COLLECTION_ITEM_SUBJECT_TYPE = "private_collection_item"

PRIVATE_COLLECTION_TITLE_REQUIRED = "PRIVATE_COLLECTION_TITLE_REQUIRED"
PRIVATE_COLLECTION_ITEM_TITLE_REQUIRED = "PRIVATE_COLLECTION_ITEM_TITLE_REQUIRED"
PRIVATE_COLLECTION_ITEM_NOT_FOUND = "PRIVATE_COLLECTION_ITEM_NOT_FOUND"
PRIVATE_COLLECTION_ORDER_INVALID = "PRIVATE_COLLECTION_ORDER_INVALID"
PRIVATE_COLLECTION_ORDER_CONFLICT = "PRIVATE_COLLECTION_ORDER_CONFLICT"


@dataclass(frozen=True)
class PrivateCollectionPageResult:
    items: list[PrivateCollection]
    next_cursor: str | None
    has_more: bool


def _normalize_title(value: str, *, item: bool = False) -> str:
    cleaned = value.strip()
    if not cleaned:
        code = PRIVATE_COLLECTION_ITEM_TITLE_REQUIRED if item else PRIVATE_COLLECTION_TITLE_REQUIRED
        noun = "Private Collection Item" if item else "Private Collection"
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


def _ensure_expected_version(
    resource: PrivateCollection | PrivateCollectionItem, expected_version: int
) -> None:
    if resource.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _ensure_order_version(collection: PrivateCollection, expected_version: int) -> None:
    if collection.version != expected_version:
        raise ConflictError(
            "The Private Collection order changed since it was loaded.",
            PRIVATE_COLLECTION_ORDER_CONFLICT,
        )


def _touch_collection(collection: PrivateCollection) -> None:
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
    """Persist references only; private content and structural state stay excluded."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=space_id,
            actor_id=actor_id,
            subject_type=subject_type,
            subject_id=subject_id,
            resource_version=resource_version,
            payload=PublicEventPayload(visibility=ContentVisibility.PRIVATE),
        ),
    )


def _record_collection(
    session: Session,
    collection: PrivateCollection,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    _record(
        session,
        event_type=event_type,
        actor_id=actor_id,
        space_id=collection.space_id,
        subject_type=_PRIVATE_COLLECTION_SUBJECT_TYPE,
        subject_id=collection.id,
        resource_version=collection.version,
    )


def _record_item(
    session: Session,
    collection: PrivateCollection,
    item: PrivateCollectionItem,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    _record(
        session,
        event_type=event_type,
        actor_id=actor_id,
        space_id=collection.space_id,
        subject_type=_PRIVATE_COLLECTION_ITEM_SUBJECT_TYPE,
        subject_id=item.id,
        resource_version=item.version,
    )


def create_collection(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
) -> PrivateCollection:
    collection = PrivateCollection(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=owner_only_privacy(),
        payload=PrivateCollectionPayload(title=_normalize_title(title)),
    )
    session.add(collection)
    _flush(session)
    _record_collection(
        session, collection, context.account_id, EventType.PRIVATE_COLLECTION_CREATED
    )
    _flush(session)
    return collection


def get_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
) -> PrivateCollection:
    return require_readable(session, PrivateCollection, context, collection_id)


def update_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
) -> PrivateCollection:
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    _ensure_expected_version(collection, expected_version)

    next_title = collection.payload.title
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    collection.payload = PrivateCollectionPayload(title=next_title)

    _flush(session)
    _record_collection(
        session, collection, context.account_id, EventType.PRIVATE_COLLECTION_UPDATED
    )
    _flush(session)
    return collection


def delete_collection(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    _ensure_expected_version(collection, expected_version)
    actor_id = context.account_id
    session.delete(collection)
    _flush(session)
    _record_collection(session, collection, actor_id, EventType.PRIVATE_COLLECTION_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {
        "collection": "private_collections",
        "spaceId": str(context.space_id),
        "ownerId": str(context.account_id),
    }


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
) -> PrivateCollectionPageResult:
    statement = readable(PrivateCollection, context)
    if cursor is not None:
        created_at, collection_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                PrivateCollection.created_at < created_at,
                and_(
                    PrivateCollection.created_at == created_at,
                    PrivateCollection.id < collection_id,
                ),
            )
        )
    statement = statement.order_by(
        PrivateCollection.created_at.desc(), PrivateCollection.id.desc()
    ).limit(limit + 1)
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
    return PrivateCollectionPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


def list_items(session: Session, collection: PrivateCollection) -> list[PrivateCollectionItem]:
    """List children only after the caller has authorized the parent."""
    return list(
        session.execute(
            select(PrivateCollectionItem)
            .where(PrivateCollectionItem.collection_id == collection.id)
            .order_by(PrivateCollectionItem.position, PrivateCollectionItem.id)
        ).scalars()
    )


def _item_identifier(value: UUID | str) -> UUID:
    identifier = value if isinstance(value, UUID) else parse_id(value)
    if identifier is None:
        raise NotFoundError("Private Collection Item not found.", PRIVATE_COLLECTION_ITEM_NOT_FOUND)
    return identifier


def _require_item(
    session: Session,
    collection: PrivateCollection,
    item_id: UUID | str,
    *,
    for_update: bool,
) -> PrivateCollectionItem:
    identifier = _item_identifier(item_id)
    statement = select(PrivateCollectionItem).where(
        PrivateCollectionItem.collection_id == collection.id,
        PrivateCollectionItem.id == identifier,
    )
    if for_update:
        statement = statement.with_for_update()
    item = session.execute(statement).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Private Collection Item not found.", PRIVATE_COLLECTION_ITEM_NOT_FOUND)
    return item


def get_item(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    item_id: UUID | str,
) -> PrivateCollectionItem:
    collection = get_collection(session, context, collection_id)
    return _require_item(session, collection, item_id, for_update=False)


def create_item(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    title: str,
    completed: bool,
) -> PrivateCollectionItem:
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    position = session.execute(
        select(func.count(PrivateCollectionItem.id)).where(
            PrivateCollectionItem.collection_id == collection.id
        )
    ).scalar_one()
    item = PrivateCollectionItem(
        collection_id=collection.id,
        completed=completed,
        position=position,
        payload=PrivateCollectionItemPayload(title=_normalize_title(title, item=True)),
    )
    session.add(item)
    _touch_collection(collection)
    _flush(session)
    _record_item(
        session, collection, item, context.account_id, EventType.PRIVATE_COLLECTION_ITEM_CREATED
    )
    _record_collection(
        session, collection, context.account_id, EventType.PRIVATE_COLLECTION_UPDATED
    )
    _flush(session)
    return item


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
) -> PrivateCollectionItem:
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    item = _require_item(session, collection, item_id, for_update=True)
    _ensure_expected_version(item, expected_version)

    if "title" in changed_fields:
        assert title is not None
        item.payload = PrivateCollectionItemPayload(title=_normalize_title(title, item=True))
    if "completed" in changed_fields:
        assert completed is not None
        item.completed = completed

    _flush(session)
    _record_item(
        session, collection, item, context.account_id, EventType.PRIVATE_COLLECTION_ITEM_UPDATED
    )
    _flush(session)
    return item


def _compact_after_delete(session: Session, collection_id: UUID, deleted_position: int) -> None:
    session.execute(
        update(PrivateCollectionItem)
        .where(
            PrivateCollectionItem.collection_id == collection_id,
            PrivateCollectionItem.position > deleted_position,
        )
        .values(
            position=PrivateCollectionItem.position - 1,
            updated_at=PrivateCollectionItem.updated_at,
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
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    item = _require_item(session, collection, item_id, for_update=True)
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
        event_type=EventType.PRIVATE_COLLECTION_ITEM_DELETED,
        actor_id=context.account_id,
        space_id=collection.space_id,
        subject_type=_PRIVATE_COLLECTION_ITEM_SUBJECT_TYPE,
        subject_id=deleted_id,
        resource_version=deleted_version,
    )
    _record_collection(
        session, collection, context.account_id, EventType.PRIVATE_COLLECTION_UPDATED
    )
    _flush(session)


def reorder_items(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    expected_version: int,
    item_ids: list[UUID],
) -> PrivateCollection:
    collection = require_writable_locked(session, PrivateCollection, context, collection_id)
    _ensure_order_version(collection, expected_version)

    current_ids = list(
        session.execute(
            select(PrivateCollectionItem.id)
            .where(PrivateCollectionItem.collection_id == collection.id)
            .order_by(PrivateCollectionItem.position)
            .with_for_update()
        ).scalars()
    )
    if len(item_ids) != len(current_ids) or len(set(item_ids)) != len(item_ids):
        raise ValidationError(
            "Private Collection order must contain every current Item exactly once.",
            PRIVATE_COLLECTION_ORDER_INVALID,
        )
    if set(item_ids) != set(current_ids):
        raise ValidationError(
            "Private Collection order must contain every current Item exactly once.",
            PRIVATE_COLLECTION_ORDER_INVALID,
        )

    if item_ids:
        position_by_id = {item_id: position for position, item_id in enumerate(item_ids)}
        session.execute(
            update(PrivateCollectionItem)
            .where(PrivateCollectionItem.collection_id == collection.id)
            .values(
                position=case(position_by_id, value=PrivateCollectionItem.id),
                updated_at=PrivateCollectionItem.updated_at,
            ),
            execution_options={"synchronize_session": False},
        )

    _touch_collection(collection)
    _flush(session)
    _record_collection(
        session, collection, context.account_id, EventType.PRIVATE_COLLECTION_REORDERED
    )
    _flush(session)
    return collection


__all__ = [
    "PRIVATE_COLLECTION_ITEM_NOT_FOUND",
    "PRIVATE_COLLECTION_ITEM_TITLE_REQUIRED",
    "PRIVATE_COLLECTION_ORDER_CONFLICT",
    "PRIVATE_COLLECTION_ORDER_INVALID",
    "PRIVATE_COLLECTION_TITLE_REQUIRED",
    "PrivateCollectionPageResult",
    "create_collection",
    "create_item",
    "delete_collection",
    "delete_item",
    "get_collection",
    "get_item",
    "list_collections",
    "list_items",
    "reorder_items",
    "update_collection",
    "update_item",
]
