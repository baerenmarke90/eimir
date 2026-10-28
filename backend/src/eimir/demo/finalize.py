"""Finalize the complete canonical demo after low-level seed creation."""

from __future__ import annotations

from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.chapters.models import Chapter
from eimir.demo.service import DemoSeedResult
from eimir.demo.story import CHAPTERS, MEMORIES
from eimir.memories.models import Memory
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.relations import service as relation_service

_CAFE_NAME = "Café am Markt"
# Approximate public-square coordinates are intentional: the demo exercises the
# coordinate-capable Place path without pretending that the fictional café is a
# real venue at an exact storefront.
_CAFE_LATITUDE = 49.233000
_CAFE_LONGITUDE = 6.996000

# Manually curated Place-to-Memory examples. They exercise ordinary content
# relations without fabricating GPS EXIF metadata for licensed stock photos.
_MEMORY_PLACE_LINKS = (
    ("Café am Markt", "breakfast-saarbruecken"),
    ("Waldsee", "lake-walk"),
)


def _only_by_title[T](
    items: list[T],
    *,
    title_of: Callable[[T], str],
    title: str,
) -> T:
    matches = [item for item in items if title_of(item) == title]
    if len(matches) != 1:
        raise RuntimeError(f"Canonical demo expected exactly one {title!r}; found {len(matches)}.")
    return matches[0]


def _ensure_coordinate_fixture(
    session: Session,
    context: AuthorizationContext,
    places: list[Place],
) -> None:
    cafe = _only_by_title(places, title_of=lambda place: place.payload.name, title=_CAFE_NAME)
    if cafe.latitude is not None and cafe.longitude is not None:
        return
    if cafe.latitude is not None or cafe.longitude is not None:
        raise RuntimeError("Canonical demo café has an invalid half-coordinate state.")
    place_service.update_place(
        session,
        context,
        cafe.id,
        expected_version=cafe.version,
        changed_fields=frozenset({"latitude", "longitude"}),
        name=None,
        description=None,
        address=None,
        latitude=_CAFE_LATITUDE,
        longitude=_CAFE_LONGITUDE,
    )


def _memory_index(memories: list[Memory]) -> dict[str, Memory]:
    return {
        story.key: _only_by_title(
            memories,
            title_of=lambda memory: memory.payload.title,
            title=story.title,
        )
        for story in MEMORIES
    }


def _ensure_chapter_story_links(
    session: Session,
    context: AuthorizationContext,
    memory_by_key: dict[str, Memory],
    chapters: list[Chapter],
) -> None:
    for chapter_story in CHAPTERS:
        chapter = _only_by_title(
            chapters,
            title_of=lambda item: item.payload.title,
            title=chapter_story.title,
        )
        for memory_key in chapter_story.memory_keys:
            memory = memory_by_key.get(memory_key)
            if memory is None:
                raise RuntimeError(
                    f"Canonical Chapter {chapter_story.title!r} references unknown "
                    f"Memory key {memory_key!r}."
                )
            relation_service.link(
                session,
                context,
                chapter.id,
                memory.id,
                relation_service.CHAPTER_MEMORIES,
            )


def _ensure_memory_place_links(
    session: Session,
    context: AuthorizationContext,
    memory_by_key: dict[str, Memory],
    places: list[Place],
) -> None:
    for place_title, memory_key in _MEMORY_PLACE_LINKS:
        place = _only_by_title(
            places,
            title_of=lambda item: item.payload.name,
            title=place_title,
        )
        memory = memory_by_key[memory_key]
        relation_service.link(
            session,
            context,
            place.id,
            memory.id,
            relation_service.PLACE_MEMORIES,
        )


def ensure_story_structure(session: Session, result: DemoSeedResult) -> None:
    """Restore deterministic Place and Chapter-to-Memory relations.

    The low-level seed owns creation and media import. This completion step uses
    the normal product services and is intentionally idempotent so both create
    and reset converge on the same visitor-facing canonical structure.
    """
    context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    places = list(session.execute(select(Place).where(Place.space_id == result.space_id)).scalars())
    memories = list(
        session.execute(select(Memory).where(Memory.space_id == result.space_id)).scalars()
    )
    chapters = list(
        session.execute(select(Chapter).where(Chapter.space_id == result.space_id)).scalars()
    )
    memory_by_key = _memory_index(memories)
    _ensure_coordinate_fixture(session, context, places)
    _ensure_chapter_story_links(session, context, memory_by_key, chapters)
    _ensure_memory_place_links(session, context, memory_by_key, places)
