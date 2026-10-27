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
from eimir.heart_moments.models import HeartMoment
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.relations import service as relation_service
from eimir.relations.models import PlaceMemory
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


def test_completed_demo_has_authored_tags_and_manual_memory_place_links(session: Session) -> None:
    result = _seed(session)
    assert _memory_by_title(session, result.space_id, "Frühstück in Saarbrücken").payload.tags == [
        "Frühstück", "Unterwegs"
    ]
    assert _memory_by_title(session, result.space_id, "Spaziergang am See").payload.tags == [
        "Am See", "Spaziergang"
    ]
    assert _memory_by_title(session, result.space_id, "Filmabend auf dem Sofa").payload.tags == []

    moments = list(session.execute(select(HeartMoment).where(HeartMoment.space_id == result.space_id)).scalars())
    shared = next(moment for moment in moments if moment.payload.text == "Danke, dass du heute einfach zugehört hast.")
    private = next(moment for moment in moments if moment.payload.text == "Vorfreude auf eine kleine Überraschung für Alex.")
    assert shared.payload.tags == ["Dankbarkeit", "Miteinander"]
    assert private.payload.tags == ["Überraschung"]

    place_names = {
        place.id: place.payload.name
        for place in session.execute(select(Place).where(Place.space_id == result.space_id)).scalars()
    }
    memory_titles = {
        memory.id: memory.payload.title
        for memory in session.execute(select(Memory).where(Memory.space_id == result.space_id)).scalars()
    }
    links = list(
        session.execute(select(PlaceMemory).where(PlaceMemory.space_id == result.space_id)).scalars()
    )
    assert {(place_names[link.place_id], memory_titles[link.memory_id]) for link in links} == {
        ("Café am Markt", "Frühstück in Saarbrücken"),
        ("Waldsee", "Spaziergang am See"),
    }
    assert all(not link.photo_generated for link in links)


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
        changed_fields=frozenset({"title", "tags"}),
        title="Unser Besucher-Filmabend",
        body=None,
        happened_on=None,
        tags=["Besucher-Moment"],
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
    assert changed.payload.tags == ["Besucher-Moment"]


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

    breakfast = _memory_by_title(session, result.space_id, "Frühstück in Saarbrücken")
    relation_service.unlink(
        session,
        context,
        cafe.id,
        breakfast.id,
        relation_service.PLACE_MEMORIES,
    )

    reset = reset_demo_space(
        session,
        environment=Environment.TEST,
        reference_date=REFERENCE_DATE,
    )

    restored_cafe = _place_by_name(session, reset.space_id, "Café am Markt")
    assert restored_cafe.latitude is not None
    assert restored_cafe.longitude is not None
    assert _chapter_story_snapshot(session, reset) == expected_story
    restored_breakfast = _memory_by_title(session, reset.space_id, "Frühstück in Saarbrücken")
    assert restored_breakfast.payload.tags == ["Frühstück", "Unterwegs"]
    assert session.execute(
        select(PlaceMemory).where(
            PlaceMemory.place_id == restored_cafe.id,
            PlaceMemory.memory_id == restored_breakfast.id,
        )
    ).scalar_one().photo_generated is False

    # Reset recreates the annual and oldest-memory fixtures from the same
    # reference date; idempotent ensure never rewrites existing visitor content.
    assert _memory_by_title(session, reset.space_id, "Dieser Tag am See").happened_on == date(
        2025, 8, 24
    )
    assert _memory_by_title(
        session, reset.space_id, "Unser erster Abend am Wasser"
    ).happened_on == date(2023, 8, 24)
