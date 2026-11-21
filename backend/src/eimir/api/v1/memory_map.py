"""HTTP contract of the Pro saved-memory map (``memories.map``, Decision 0017).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
route. The tag, path, ``operation_id`` and schema names are those of the former
Core route, so the full OpenAPI contract and the generated clients are unchanged.
"""

from __future__ import annotations

from datetime import UTC, date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments.binding import attachments_of_memories, cover_of
from eimir.entitlements.models import Capability
from eimir.places.memory_map import list_memory_map

router = APIRouter(tags=["places"])


class MemoryMapEntry(ApiModel):
    memory_id: UUID
    title: str
    happened_on: date
    happened_until: date | None = None
    place_id: UUID
    place_name: str
    latitude: float
    longitude: float
    preview_attachment_id: UUID | None = None
    preview_is_sensitive: bool = False
    preview_has_thumbnail: bool = False


class MemoryMapPage(ApiModel):
    items: list[MemoryMapEntry]
    next_cursor: str | None


@router.get(
    "/spaces/{spaceId}/memory-map",
    response_model=MemoryMapPage,
    operation_id="listMemoryMap",
    responses=problem_responses(400, 401, 403, 404, 422),
)
def get_memory_map(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> MemoryMapPage:
    """Pro map over readable saved memories and places; no location tracking."""
    ensure_capability(
        session, authorization.space_id, Capability.MEMORIES_MAP.value, lock_grants=False
    )
    response.headers["Cache-Control"] = "no-store"
    result = list_memory_map(session, authorization, cursor=cursor, limit=limit)
    galleries = attachments_of_memories(session, [memory.id for memory, _ in result.items])
    previews = {
        memory.id: cover_of(
            galleries.get(memory.id, []), memory.payload.selected_cover_attachment_id
        )
        for memory, _ in result.items
    }
    entries = []
    for memory, place in result.items:
        if place.latitude is None or place.longitude is None:
            continue
        preview = previews.get(memory.id)
        entries.append(
            MemoryMapEntry(
                memory_id=memory.id,
                title=memory.payload.title,
                happened_on=memory.happened_on or memory.created_at.astimezone(UTC).date(),
                happened_until=memory.happened_until,
                place_id=place.id,
                place_name=place.payload.name,
                latitude=float(place.latitude),
                longitude=float(place.longitude),
                preview_attachment_id=preview.id if preview is not None else None,
                preview_is_sensitive=preview.payload.is_sensitive if preview is not None else False,
                preview_has_thumbnail=preview.has_thumbnail if preview is not None else False,
            )
        )
    return MemoryMapPage(items=entries, next_cursor=result.next_cursor)
