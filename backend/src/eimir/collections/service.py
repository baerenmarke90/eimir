"""Domain logic for shared M3 collections."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
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
    CollectionKind,
    CollectionPayload,
    CollectionSuggestion,
    CollectionSuggestionPayload,
    shared_privacy,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.core.ids import parse_id
from eimir.create_receipts import service as create_receipts
from eimir.create_receipts.models import CreateReceiptResourceType
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service

_COLLECTION_SUBJECT_TYPE = "collection"
_COLLECTION_ITEM_SUBJECT_TYPE = "collection_item"
_ITEM_RECEIPT_RESOURCE_TYPE = CreateReceiptResourceType.COLLECTION_ITEM.value

COLLECTION_TITLE_REQUIRED = "COLLECTION_TITLE_REQUIRED"
COLLECTION_ITEM_TITLE_REQUIRED = "COLLECTION_ITEM_TITLE_REQUIRED"
COLLECTION_ITEM_NOT_FOUND = "COLLECTION_ITEM_NOT_FOUND"
COLLECTION_ORDER_INVALID = "COLLECTION_ORDER_INVALID"
COLLECTION_ORDER_CONFLICT = "COLLECTION_ORDER_CONFLICT"
COLLECTION_ITEM_QUANTITY_TOO_LONG = "COLLECTION_ITEM_QUANTITY_TOO_LONG"
COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED = "COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED"
COLLECTION_SUGGESTION_NOT_FOUND = "COLLECTION_SUGGESTION_NOT_FOUND"
COLLECTION_SHOPPING_NOT_SUPPORTED = "COLLECTION_SHOPPING_NOT_SUPPORTED"
COLLECTION_FINISH_TOO_MANY_ITEMS = "COLLECTION_FINISH_TOO_MANY_ITEMS"

# Display text such as "2 l" or "500 g"; a technical bound, not a product limit.
ITEM_QUANTITY_MAX_LENGTH = 40

# Technical bounds against abusive payloads, not product limits (decision 0016):
# the most entries one finish request may name, and how many suggestions a
# shopping list keeps before the least recently bought ones are dropped.
FINISH_MAX_ITEMS = 200
SUGGESTIONS_MAX_PER_COLLECTION = 200


class CollectionScope(StrEnum):
    OPEN = "OPEN"
    COMPLETED = "COMPLETED"
    ALL = "ALL"


@dataclass(frozen=True)
class CollectionPageResult:
    items: list[Collection]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class CollectionItemCreateResult:
    item: CollectionItem
    created: bool


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


def normalize_quantity(value: str | None) -> str | None:
    """Trim free-text quantity; blank means none. Never parsed or converted."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > ITEM_QUANTITY_MAX_LENGTH:
        raise ValidationError(
            f"Collection Item quantity must be at most {ITEM_QUANTITY_MAX_LENGTH} characters.",
            COLLECTION_ITEM_QUANTITY_TOO_LONG,
        )
    return cleaned


def _require_quantity_support(collection: Collection, quantity: str | None) -> None:
    """Only the shopping variant carries quantities; clearing one is always allowed."""
    if quantity is not None and collection.kind != CollectionKind.SHOPPING.value:
        raise ValidationError(
            "Only shopping lists support item quantities.",
            COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED,
        )


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
    kind: CollectionKind = CollectionKind.GENERIC,
) -> Collection:
    collection = Collection(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        kind=kind.value,
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


def _cursor_binding(
    context: AuthorizationContext,
    scope: CollectionScope,
    ids: Iterable[UUID] | None = None,
) -> dict[str, Any]:
    binding = {"collection": "collections", "spaceId": str(context.space_id)}
    if scope != CollectionScope.ALL:
        binding["scope"] = scope.value
    if ids is not None:
        binding["ids"] = ",".join(sorted(str(identifier) for identifier in ids))
    return binding


def _encode_cursor(
    *,
    context: AuthorizationContext,
    created_at: datetime,
    collection_id: UUID,
    scope: CollectionScope,
    ids: Iterable[UUID] | None = None,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, scope, ids),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(collection_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    scope: CollectionScope,
    ids: Iterable[UUID] | None = None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, scope, ids))
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
    scope: CollectionScope = CollectionScope.ALL,
    ids: Sequence[UUID] | None = None,
) -> CollectionPageResult:
    """Page readable Collections, optionally limited to the given identifiers.

    ``ids`` lets a client read several known lists (for example the ones shown
    on Wir) in one request instead of one request per list.
    """
    statement = readable(Collection, context)
    if ids is not None:
        statement = statement.where(Collection.id.in_(ids))
    if scope != CollectionScope.ALL:
        has_items = (
            select(CollectionItem.id).where(CollectionItem.collection_id == Collection.id).exists()
        )
        has_unchecked = (
            select(CollectionItem.id)
            .where(
                CollectionItem.collection_id == Collection.id,
                CollectionItem.completed.is_(False),
            )
            .exists()
        )
        completed = and_(has_items, ~has_unchecked)
        statement = statement.where(completed if scope == CollectionScope.COMPLETED else ~completed)
    if cursor is not None:
        created_at, collection_id = _decode_cursor(cursor, context=context, scope=scope, ids=ids)
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
            scope=scope,
            ids=ids,
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
    quantity: str | None = None,
) -> CollectionItem:
    collection = require_writable_locked(session, Collection, context, collection_id)
    normalized_quantity = normalize_quantity(quantity)
    _require_quantity_support(collection, normalized_quantity)
    position = session.execute(
        select(func.count(CollectionItem.id)).where(CollectionItem.collection_id == collection.id)
    ).scalar_one()
    item = CollectionItem(
        collection_id=collection.id,
        created_by=context.account_id,
        completed=completed,
        completed_by=context.account_id if completed else None,
        completed_at=datetime.now(UTC) if completed else None,
        position=position,
        payload=CollectionItemPayload(
            title=_normalize_title(title, item=True), quantity=normalized_quantity
        ),
    )
    session.add(item)
    _touch_collection(collection)
    _flush(session)
    _record_item(session, collection, item, context.account_id, EventType.COLLECTION_ITEM_CREATED)
    _record_collection(session, collection, context.account_id, EventType.COLLECTION_UPDATED)
    _flush(session)
    return item


def create_item_once(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    idempotency_key: UUID | None,
    title: str,
    completed: bool,
    quantity: str | None = None,
) -> CollectionItemCreateResult:
    """Create an Item, or return the one an earlier request with this identity created.

    Without a key this is a plain create. With a key, claiming the receipt and
    creating the Item share this transaction (decision 0015, building on
    decision 0012). A lost response or a queued request that is sent twice
    therefore cannot add the same Item to a shared list twice.
    """
    if idempotency_key is None:
        item = create_item(
            session,
            context,
            collection_id,
            title=title,
            completed=completed,
            quantity=quantity,
        )
        return CollectionItemCreateResult(item, created=True)

    collection = require_writable_locked(session, Collection, context, collection_id)
    normalized_title = _normalize_title(title, item=True)
    normalized_quantity = normalize_quantity(quantity)
    _require_quantity_support(collection, normalized_quantity)
    request_fingerprint = create_receipts.fingerprint(
        _ITEM_RECEIPT_RESOURCE_TYPE,
        {
            "collectionId": str(collection.id),
            "title": normalized_title,
            "completed": completed,
            **({"quantity": normalized_quantity} if normalized_quantity else {}),
        },
    )
    receipt_id = create_receipts.claim(
        session,
        context,
        resource_type=_ITEM_RECEIPT_RESOURCE_TYPE,
        key=idempotency_key,
        request_fingerprint=request_fingerprint,
    )
    if receipt_id is None:
        resource_id = create_receipts.resolve(
            session,
            context,
            resource_type=_ITEM_RECEIPT_RESOURCE_TYPE,
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        existing = (
            session.execute(
                select(CollectionItem).where(
                    CollectionItem.id == resource_id,
                    CollectionItem.collection_id == collection.id,
                )
            ).scalar_one_or_none()
            if resource_id is not None
            else None
        )
        if existing is None:
            # Never recreate: the original was committed and has since been removed.
            raise NotFoundError(
                "The Collection Item created by this request no longer exists.",
                ErrorCode.COLLECTION_ITEM_CREATE_RESULT_DELETED,
            )
        return CollectionItemCreateResult(existing, created=False)

    item = create_item(
        session,
        context,
        collection.id,
        title=normalized_title,
        completed=completed,
        quantity=normalized_quantity,
    )
    create_receipts.attach(session, receipt_id, item.id)
    return CollectionItemCreateResult(item, created=True)


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
    quantity: str | None = None,
) -> CollectionItemUpdateResult:
    collection = require_writable_locked(session, Collection, context, collection_id)
    item = _require_item_locked(session, collection, item_id)
    _ensure_expected_version(item, expected_version)

    was_completed = item.completed
    if "title" in changed_fields or "quantity" in changed_fields:
        next_title = item.payload.title
        next_quantity = item.payload.quantity
        if "title" in changed_fields:
            assert title is not None
            next_title = _normalize_title(title, item=True)
        if "quantity" in changed_fields:
            next_quantity = normalize_quantity(quantity)
            _require_quantity_support(collection, next_quantity)
        # Rebuild the whole protected payload so changing one field keeps the other.
        item.payload = CollectionItemPayload(title=next_title, quantity=next_quantity)
    if "completed" in changed_fields:
        assert completed is not None
        if completed and not was_completed:
            item.completed_by = context.account_id
            item.completed_at = datetime.now(UTC)
        elif not completed:
            item.completed_by = None
            item.completed_at = None
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
    quantity: str | None = None,
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
        quantity=quantity,
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


@dataclass(frozen=True)
class FinishShoppingResult:
    collection: Collection
    finished_count: int


def _require_shopping(collection: Collection) -> None:
    if collection.kind != CollectionKind.SHOPPING.value:
        raise ValidationError(
            "Only a shopping list has a trip to finish and suggestions.",
            COLLECTION_SHOPPING_NOT_SUPPORTED,
        )


def _suggestion_key(title: str) -> str:
    """Two spellings of one thing (case, spacing) are one suggestion."""
    return " ".join(title.split()).casefold()


def finish_shopping(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    *,
    item_ids: Sequence[UUID],
) -> FinishShoppingResult:
    """End a shopping trip: clear the named entries from the cart and remember them.

    Only the entries the client names and that are still completed are taken, so
    repeating the request, or a partner finishing the same cart at the same time,
    finds nothing left to do and loses nothing; an entry checked after the client
    read the list is not named and stays. The list row is locked for the whole
    call, which orders two finishes. Titles move to the suggestions of the list.
    """
    collection = require_writable_locked(session, Collection, context, collection_id)
    _require_shopping(collection)
    wanted = list(dict.fromkeys(item_ids))
    if len(wanted) > FINISH_MAX_ITEMS:
        raise ValidationError(
            f"A trip finishes at most {FINISH_MAX_ITEMS} entries at once.",
            COLLECTION_FINISH_TOO_MANY_ITEMS,
        )
    finished = (
        list(
            session.execute(
                select(CollectionItem)
                .where(
                    CollectionItem.collection_id == collection.id,
                    CollectionItem.id.in_(wanted),
                    CollectionItem.completed.is_(True),
                )
                .order_by(CollectionItem.position)
                .with_for_update()
            ).scalars()
        )
        if wanted
        else []
    )
    if not finished:
        return FinishShoppingResult(collection=collection, finished_count=0)

    now = datetime.now(UTC)
    known = {
        _suggestion_key(suggestion.payload.title): suggestion
        for suggestion in session.execute(
            select(CollectionSuggestion)
            .where(CollectionSuggestion.collection_id == collection.id)
            .with_for_update()
        ).scalars()
    }
    for item in finished:
        key = _suggestion_key(item.payload.title)
        suggestion = known.get(key)
        payload = CollectionSuggestionPayload(
            title=item.payload.title, quantity=item.payload.quantity
        )
        if suggestion is None:
            suggestion = CollectionSuggestion(
                collection_id=collection.id,
                payload=payload,
                last_bought_at=now,
                times_bought=1,
            )
            session.add(suggestion)
            known[key] = suggestion
        else:
            suggestion.payload = payload
            suggestion.last_bought_at = now
            suggestion.times_bought += 1

    deleted = [(item.id, item.version) for item in finished]
    for item in finished:
        session.delete(item)
    _flush(session)

    remaining = list(
        session.execute(
            select(CollectionItem.id)
            .where(CollectionItem.collection_id == collection.id)
            .order_by(CollectionItem.position)
        ).scalars()
    )
    if remaining:
        position_by_id = {item_id: position for position, item_id in enumerate(remaining)}
        session.execute(
            update(CollectionItem)
            .where(CollectionItem.collection_id == collection.id)
            .values(
                position=case(position_by_id, value=CollectionItem.id),
                updated_at=CollectionItem.updated_at,
            ),
            execution_options={"synchronize_session": False},
        )

    overflow = len(known) - SUGGESTIONS_MAX_PER_COLLECTION
    if overflow > 0:
        # Keep the ones bought most recently; a suggestion is a convenience.
        oldest = sorted(known.values(), key=lambda value: value.last_bought_at)[:overflow]
        for suggestion in oldest:
            if suggestion.last_bought_at != now:
                session.delete(suggestion)

    _touch_collection(collection)
    _flush(session)
    for deleted_id, deleted_version in deleted:
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
    return FinishShoppingResult(collection=collection, finished_count=len(finished))


def list_suggestions(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
) -> list[CollectionSuggestion]:
    """The titles bought before, the most recently bought first."""
    collection = require_readable(session, Collection, context, collection_id)
    _require_shopping(collection)
    return list(
        session.execute(
            select(CollectionSuggestion)
            .where(CollectionSuggestion.collection_id == collection.id)
            .order_by(CollectionSuggestion.last_bought_at.desc(), CollectionSuggestion.id)
        ).scalars()
    )


def delete_suggestion(
    session: Session,
    context: AuthorizationContext,
    collection_id: UUID | str,
    suggestion_id: UUID | str,
) -> None:
    # A plain list never has suggestions, so asking for one there is simply "not found".
    collection = require_writable_locked(session, Collection, context, collection_id)
    identifier = suggestion_id if isinstance(suggestion_id, UUID) else parse_id(suggestion_id)
    suggestion = (
        session.execute(
            select(CollectionSuggestion)
            .where(
                CollectionSuggestion.collection_id == collection.id,
                CollectionSuggestion.id == identifier,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if identifier is not None
        else None
    )
    if suggestion is None:
        raise NotFoundError("Suggestion not found.", COLLECTION_SUGGESTION_NOT_FOUND)
    session.delete(suggestion)
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
    "COLLECTION_FINISH_TOO_MANY_ITEMS",
    "COLLECTION_ITEM_NOT_FOUND",
    "COLLECTION_ITEM_QUANTITY_NOT_SUPPORTED",
    "COLLECTION_ITEM_QUANTITY_TOO_LONG",
    "COLLECTION_ITEM_TITLE_REQUIRED",
    "COLLECTION_ORDER_CONFLICT",
    "COLLECTION_ORDER_INVALID",
    "COLLECTION_SHOPPING_NOT_SUPPORTED",
    "COLLECTION_SUGGESTION_NOT_FOUND",
    "COLLECTION_TITLE_REQUIRED",
    "FINISH_MAX_ITEMS",
    "ITEM_QUANTITY_MAX_LENGTH",
    "SUGGESTIONS_MAX_PER_COLLECTION",
    "CollectionItemCreateResult",
    "CollectionItemUpdateResult",
    "CollectionPageResult",
    "FinishShoppingResult",
    "create_collection",
    "create_item",
    "create_item_once",
    "delete_collection",
    "delete_item",
    "delete_suggestion",
    "finish_shopping",
    "get_collection",
    "list_collections",
    "list_items",
    "list_suggestions",
    "normalize_quantity",
    "reorder_items",
    "update_collection",
    "update_item",
    "update_item_with_completion_transition",
]
