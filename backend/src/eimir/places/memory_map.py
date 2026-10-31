"""Bounded, authorized projection of saved Memory-Place relations."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core import cursor as cursor_codec
from eimir.memories.models import Memory
from eimir.places.models import Place
from eimir.relations.models import PlaceMemory


@dataclass(frozen=True)
class MemoryMapResult:
    items: list[tuple[Memory, Place]]
    next_cursor: str | None


def list_memory_map(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
) -> MemoryMapResult:
    binding = {"collection": "memory-map", "spaceId": str(context.space_id)}
    statement = (
        readable(Memory, context)
        .add_columns(Place)
        .join(
            PlaceMemory,
            and_(PlaceMemory.memory_id == Memory.id, PlaceMemory.space_id == context.space_id),
        )
        .join(Place, Place.id == PlaceMemory.place_id)
        .where(
            Place.id.in_(readable(Place, context).with_only_columns(Place.id)),
            Place.latitude.is_not(None),
            Place.longitude.is_not(None),
        )
    )
    if cursor:
        position = cursor_codec.decode(cursor, binding=binding)
        try:
            memory_id = UUID(position["memoryId"])
            place_id = UUID(position["placeId"])
        except (KeyError, ValueError, TypeError, AttributeError) as error:
            raise cursor_codec.invalid_cursor() from error
        statement = statement.where(
            or_(Memory.id < memory_id, and_(Memory.id == memory_id, Place.id < place_id))
        )
    rows = list(
        session.execute(statement.order_by(Memory.id.desc(), Place.id.desc()).limit(limit + 1))
        .tuples()
        .all()
    )
    items = [(memory, place) for memory, place in rows[:limit]]
    next_cursor = None
    if len(rows) > limit and items:
        memory, place = items[-1]
        next_cursor = cursor_codec.encode(
            binding=binding, position={"memoryId": str(memory.id), "placeId": str(place.id)}
        )
    return MemoryMapResult(items, next_cursor)
