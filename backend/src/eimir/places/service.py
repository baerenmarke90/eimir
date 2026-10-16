"""Domain logic for M3 places.

Two aspects distinguish this service from Wish and Plan.

**Coordinates.** They are sensitive content but, under M3-D06, are stored as
typed columns. This service therefore performs validation and quantization,
not enrichment. There is no geocoding, provider call, or derivation from
address to coordinates or vice versa. A place knows exactly what someone
entered.

**No deduplication.** Every create request produces a new place, even with
the same name and coordinates (M3-D07). Merging two places would be an
unsolicited data mutation and one that cannot be reversed reliably.

The canonical lock order in the M3 core begins with `Place`. A place is
therefore always locked before any Plan or Chapter that references it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_
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
from eimir.outbox import service as outbox_service
from eimir.places.models import (
    COORDINATE_PLACES,
    LATITUDE_LIMIT,
    LONGITUDE_LIMIT,
    Place,
    PlacePayload,
    shared_privacy,
)

_PLACE_SUBJECT_TYPE = "place"

PLACE_NAME_REQUIRED = "PLACE_NAME_REQUIRED"
PLACE_COORDINATE_PAIR_REQUIRED = "PLACE_COORDINATE_PAIR_REQUIRED"
PLACE_LATITUDE_INVALID = "PLACE_LATITUDE_INVALID"
PLACE_LONGITUDE_INVALID = "PLACE_LONGITUDE_INVALID"

_QUANTUM = Decimal(1).scaleb(-COORDINATE_PLACES)


@dataclass(frozen=True)
class PlacePageResult:
    items: list[Place]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class Coordinates:
    latitude: Decimal | None
    longitude: Decimal | None


def _normalize_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Place name must not be blank.", PLACE_NAME_REQUIRED)
    return cleaned


def _quantize(value: float | Decimal, *, limit: Decimal, code: str) -> Decimal:
    """Quantize a coordinate to the persisted precision.

    Construct through `str` rather than directly from a float:
    `Decimal(52.520008)` carries the binary rounding error while
    `Decimal("52.520008")` does not.

    Values are deliberately quantized rather than rejected for excess decimal
    places. A client receiving sixteen decimal places from a sensor has done
    nothing wrong; six of them are persisted (M3-D06).
    """
    try:
        exact = Decimal(str(value))
    except InvalidOperation as error:
        raise ValidationError("Coordinate is not a number.", code) from error
    if not exact.is_finite() or abs(exact) > limit:
        raise ValidationError("Coordinate is out of range.", code)
    quantized = exact.quantize(_QUANTUM)
    if abs(quantized) > limit:
        # Quantization itself must not cross the boundary.
        raise ValidationError("Coordinate is out of range.", code)
    return quantized


def normalize_coordinates(
    latitude: float | Decimal | None,
    longitude: float | Decimal | None,
) -> Coordinates:
    """Require both coordinates or neither, with each in range (M3-D06)."""
    if (latitude is None) != (longitude is None):
        raise ValidationError(
            "Latitude and longitude must be given together.",
            PLACE_COORDINATE_PAIR_REQUIRED,
        )
    if latitude is None or longitude is None:
        return Coordinates(latitude=None, longitude=None)
    return Coordinates(
        latitude=_quantize(latitude, limit=LATITUDE_LIMIT, code=PLACE_LATITUDE_INVALID),
        longitude=_quantize(longitude, limit=LONGITUDE_LIMIT, code=PLACE_LONGITUDE_INVALID),
    )


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(place: Place, expected_version: int) -> None:
    if place.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(session: Session, place: Place, actor_id: UUID, event_type: EventType) -> None:
    """Record an event without name, address, or coordinates (M3-D28).

    The event contract already limits payloads to the `PublicEventPayload`
    allowlist. The note remains explicit here because a place is exactly the
    kind of information that can otherwise persist in logs for years.
    """
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=place.space_id,
            actor_id=actor_id,
            subject_type=_PLACE_SUBJECT_TYPE,
            subject_id=place.id,
            resource_version=place.version,
            payload=PublicEventPayload(),
        ),
    )


def create_place(
    session: Session,
    context: AuthorizationContext,
    *,
    name: str,
    description: str | None,
    address: str | None,
    latitude: float | Decimal | None,
    longitude: float | Decimal | None,
) -> Place:
    coordinates = normalize_coordinates(latitude, longitude)
    place = Place(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        latitude=coordinates.latitude,
        longitude=coordinates.longitude,
        payload=PlacePayload(
            name=_normalize_name(name),
            description=description,
            address=address,
        ),
    )
    session.add(place)
    _flush(session)
    _record(session, place, context.account_id, EventType.PLACE_CREATED)
    _flush(session)
    return place


def get_place(
    session: Session,
    context: AuthorizationContext,
    place_id: UUID | str,
) -> Place:
    return require_readable(session, Place, context, place_id)


def update_place(
    session: Session,
    context: AuthorizationContext,
    place_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    name: str | None,
    description: str | None,
    address: str | None,
    latitude: float | Decimal | None,
    longitude: float | Decimal | None,
) -> Place:
    """Apply a correction to a place.

    Coordinates are treated as a pair even for PATCH: touching one means
    changing both. Sending only `latitude` must not create the half-coordinate
    state that the invariant explicitly prevents.
    """
    place = require_writable_locked(session, Place, context, place_id)
    _ensure_expected_version(place, expected_version)

    coordinates_touched = bool({"latitude", "longitude"} & changed_fields)
    if coordinates_touched:
        coordinates = normalize_coordinates(
            latitude if "latitude" in changed_fields else place.latitude,
            longitude if "longitude" in changed_fields else place.longitude,
        )
        place.latitude = coordinates.latitude
        place.longitude = coordinates.longitude

    next_name = place.payload.name
    next_description = place.payload.description
    next_address = place.payload.address
    if "name" in changed_fields:
        assert name is not None
        next_name = _normalize_name(name)
    if "description" in changed_fields:
        next_description = description
    if "address" in changed_fields:
        next_address = address

    if {"name", "description", "address"} & changed_fields:
        place.payload = PlacePayload(
            name=next_name,
            description=next_description,
            address=next_address,
        )

    _flush(session)
    _record(session, place, context.account_id, EventType.PLACE_UPDATED)
    _flush(session)
    return place


def delete_place(
    session: Session,
    context: AuthorizationContext,
    place_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    """Remove the place and detach direct Plan/Chapter references versionedly.

    Referencing domain objects remain. The service clears their canonical
    `place_id` fields before the Place is deleted so each object's version
    reflects the change. Foreign-key `SET NULL` remains defense in depth for
    code paths outside the normal service boundary.
    """
    from eimir.chapters import service as chapter_service
    from eimir.plans import service as plan_service

    place = require_writable_locked(session, Place, context, place_id)
    _ensure_expected_version(place, expected_version)

    actor_id = context.account_id
    plan_service.detach_place(session, place, actor_id)
    chapter_service.detach_place(session, place, actor_id)

    session.delete(place)
    _flush(session)
    _record(session, place, actor_id, EventType.PLACE_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext) -> dict[str, Any]:
    return {"collection": "places", "spaceId": str(context.space_id)}


def _encode_cursor(
    *,
    context: AuthorizationContext,
    created_at: datetime,
    place_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(place_id),
        },
    )


def _decode_cursor(token: str, *, context: AuthorizationContext) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context))
    created_raw = position.get("createdAt")
    place_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(place_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        place_id = UUID(place_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), place_id


def list_places(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> PlacePageResult:
    """Return newest places first.

    There is no proximity filter, radius, or distance ordering: that would be
    a geospatial query and needs a deliberate later scope with an appropriate
    index. There is also no name filter because the name is behind the
    ProtectedPayload boundary.
    """
    statement = readable(Place, context)
    if cursor is not None:
        created_at, place_id = _decode_cursor(cursor, context=context)
        statement = statement.where(
            or_(
                Place.created_at < created_at,
                and_(Place.created_at == created_at, Place.id < place_id),
            )
        )

    statement = statement.order_by(Place.created_at.desc(), Place.id.desc()).limit(limit + 1)
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            created_at=last.created_at,
            place_id=last.id,
        )
    return PlacePageResult(items=items, next_cursor=next_cursor, has_more=has_more)


__all__ = [
    "Coordinates",
    "PlacePageResult",
    "create_place",
    "delete_place",
    "get_place",
    "list_places",
    "normalize_coordinates",
    "update_place",
]
