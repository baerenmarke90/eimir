"""Regression coverage for the completed canonical demo story structure."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding as attachment_binding
from eimir.authorization import AuthorizationContext
from eimir.chapters.models import Chapter
from eimir.config import Environment
from eimir.demo import create_demo_space, reset_demo_space
from eimir.demo.story import CHAPTERS, MEMORIES
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.relations import service as relation_service
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-test-password"


def _seed(session: Session):  # type: ignore[no-untyped-def]
    return create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )


def _place_by_name(session: Session, space_id, name: str) -> Place:  # type: ignore[no-untyped-def]
    places = list(session.execute(select(Place).where(Place.space_id == space_id)).scalars())
    return next(place for place in places if place.payload.name == name)


def _memory_by_title(session: Session, space_id, title: str) -> Memory:  # type: ignore[no-untyped-def]
    memories = list(session.execute(select(Memory).where(Memory.space_id == space_id)).scalars())
    return next(memory for memory in memories if memory.payload.title == title)


def _chapter_story_snapshot(session: Session, result) -> dict[str, tuple[str, ...]]:  # type: ignore[no-untyped-def]
    context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    memories = list(
        session.execute(select(Memory).where(Memory.space_id == result.space_id)).scalars()
    )
    title_by_id = {memory.id: memory.payload.title for memory in memories}
    chapters = list(
        session.execute(select(Chapter).where(Chapter.space_id == result.space_id)).scalars()
    )
    return {
        chapter.payload.title: tuple(
            title_by_id[ref.target_id]
            for ref in relation_service.list_chapter_content(
                session,
                context,
                chapter.id,
            )
            if ref.target_type == "MEMORY"
        )
        for chapter in chapters
    }


def test_completed_demo_preserves_mixed_place_and_memory_media_coverage(session: Session) -> None:
    result = _seed(session)

    cafe = _place_by_name(session, result.space_id, "Café am Markt")
    lake = _place_by_name(session, result.space_id, "Waldsee")
    assert cafe.latitude is not None
    assert cafe.longitude is not None
    assert lake.latitude is None
    assert lake.longitude is None

    movie_night = _memory_by_title(session, result.space_id, "Filmabend auf dem Sofa")
    assert attachment_binding.attachments_of_memory(session, movie_night.id) == []

    weekend = _memory_by_title(session, result.space_id, "Ein Wochenende am Wasser")
    assert {
        bound.attachment.payload.original_name
        for bound in attachment_binding.attachments_of_memory(session, weekend.id)
    } == {"cabin-lake.jpg", "books-cozy-evening.jpg"}


def test_completed_demo_links_every_chapter_to_its_declared_story(session: Session) -> None:
    result = _seed(session)
    snapshot = _chapter_story_snapshot(session, result)
    story_title_by_key = {story.key: story.title for story in MEMORIES}
    expected = {
        chapter.title: tuple(story_title_by_key[key] for key in chapter.memory_keys)
        for chapter in CHAPTERS
    }

    assert set(snapshot) == set(expected)
    assert all(snapshot[title] for title in expected)
    assert snapshot == expected


def test_existing_demo_ensure_does_not_require_unchanged_story_titles(session: Session) -> None:
    result = _seed(session)
    context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    movie_night = _memory_by_title(session, result.space_id, "Filmabend auf dem Sofa")
    memory_service.update_memory(
        session,
        context,
        movie_night.id,
        expected_version=movie_night.version,
        changed_fields=frozenset({"title"}),
        title="Unser Besucher-Filmabend",
        body=None,
        happened_on=None,
    )

    ensured = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )

    assert ensured.space_id == result.space_id
    assert ensured.created is False
    changed = session.get(Memory, movie_night.id)
    assert changed is not None
    assert changed.payload.title == "Unser Besucher-Filmabend"


def test_reset_restores_story_links_and_coordinate_fixture(session: Session) -> None:
    result = _seed(session)
    expected_story = _chapter_story_snapshot(session, result)
    context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)

    cafe = _place_by_name(session, result.space_id, "Café am Markt")
    place_service.update_place(
        session,
        context,
        cafe.id,
        expected_version=cafe.version,
        changed_fields=frozenset({"latitude", "longitude"}),
        name=None,
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )

    chapter = next(
        chapter
        for chapter in session.execute(
            select(Chapter).where(Chapter.space_id == result.space_id)
        ).scalars()
        if chapter.payload.title == "Unser Sommer"
    )
    first_ref = relation_service.list_chapter_content(session, context, chapter.id)[0]
    relation_service.unlink(
        session,
        context,
        chapter.id,
        first_ref.target_id,
        relation_service.CHAPTER_MEMORIES,
    )
    assert _chapter_story_snapshot(session, result) != expected_story

    reset = reset_demo_space(
        session,
        environment=Environment.TEST,
        reference_date=REFERENCE_DATE,
    )

    restored_cafe = _place_by_name(session, reset.space_id, "Café am Markt")
    assert restored_cafe.latitude is not None
    assert restored_cafe.longitude is not None
    assert _chapter_story_snapshot(session, reset) == expected_story
