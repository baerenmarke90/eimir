"""Regression coverage for the completed canonical demo story structure."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding as attachment_binding
from eimir.authorization import AuthorizationContext
from eimir.chapters.models import Chapter
from eimir.comments import service as comment_service
from eimir.comments.models import CommentTarget
from eimir.config import Environment
from eimir.context_tags import service as context_tag_service
from eimir.demo import create_demo_space, reset_demo_space
from eimir.demo.service import DemoSeedResult
from eimir.demo.story import CHAPTERS, MEMORIES
from eimir.heart_moments.models import HeartMoment
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.places import service as place_service
from eimir.places.models import Place
from eimir.plans.models import Plan
from eimir.relations import service as relation_service
from eimir.relations.models import PlaceMemory
from eimir.story import service as story_service
from eimir.wishes.models import Wish
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
    breakfast = _memory_by_title(session, result.space_id, "Frühstück in Saarbrücken")
    lake_walk = _memory_by_title(session, result.space_id, "Spaziergang am See")
    movie_night = _memory_by_title(session, result.space_id, "Filmabend auf dem Sofa")
    assert breakfast.payload.tags == ["Frühstück", "Unterwegs"]
    assert lake_walk.payload.tags == ["Am See", "Spaziergang"]
    assert movie_night.payload.tags == []

    moments = session.scalars(
        select(HeartMoment).where(HeartMoment.space_id == result.space_id)
    ).all()
    moments_by_text = {moment.payload.text: moment for moment in moments}
    shared = moments_by_text["Danke, dass du heute einfach zugehört hast."]
    private = moments_by_text["Vorfreude auf eine kleine Überraschung für Alex."]
    assert shared.payload.tags == ["Dankbarkeit", "Miteinander"]
    assert private.payload.tags == ["Überraschung"]

    places = session.scalars(select(Place).where(Place.space_id == result.space_id)).all()
    memories = session.scalars(select(Memory).where(Memory.space_id == result.space_id)).all()
    links = session.scalars(
        select(PlaceMemory).where(PlaceMemory.space_id == result.space_id)
    ).all()
    place_names = {place.id: place.payload.name for place in places}
    memory_titles = {memory.id: memory.payload.title for memory in memories}
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


def _assert_memory_planning_showcase(session: Session, result: DemoSeedResult) -> None:
    for account_id in (result.lea_id, result.alex_id):
        context = AuthorizationContext(account_id=account_id, space_id=result.space_id)
        for kind, model, expected in (
            (
                relation_service.MEMORY_PLANS,
                Plan,
                {
                    "Spontaner Tagesausflug": "Gemeinsamer Tagesausflug",
                    "Spaziergang am See": "Herbstwanderung",
                    "Ravioli-Abend": "Neues Rezept ausprobieren",
                },
            ),
            (
                relation_service.MEMORY_WISHES,
                Wish,
                {
                    "Spontaner Tagesausflug": "Gemeinsamer Tagesausflug",
                    "Spaziergang am See": "Herbstwanderung",
                },
            ),
        ):
            targets = {
                target.id: target.payload.title
                for target in session.scalars(
                    select(model).where(model.space_id == result.space_id)
                )
            }
            for memory_title, target_title in expected.items():
                memory = _memory_by_title(session, result.space_id, memory_title)
                linked = relation_service.list_targets(session, context, memory.id, kind)
                assert [targets[target_id] for target_id in linked] == [target_title]
            unlinked = _memory_by_title(session, result.space_id, "Filmabend auf dem Sofa")
            assert relation_service.list_targets(session, context, unlinked.id, kind) == []


def test_demo_planning_links_survive_reset_but_ensure_preserves_visitor_unlink(
    session: Session,
) -> None:
    result = _seed(session)
    _assert_memory_planning_showcase(session, result)
    context = AuthorizationContext(account_id=result.alex_id, space_id=result.space_id)
    memory = _memory_by_title(session, result.space_id, "Spontaner Tagesausflug")
    [plan_id] = relation_service.list_targets(
        session, context, memory.id, relation_service.MEMORY_PLANS
    )
    relation_service.unlink(session, context, memory.id, plan_id, relation_service.MEMORY_PLANS)

    ensured = _seed(session)
    assert ensured.created is False
    assert ensured.space_id == result.space_id
    assert (
        relation_service.list_targets(session, context, memory.id, relation_service.MEMORY_PLANS)
        == []
    )
    assert session.get(Plan, plan_id) is not None
    assert session.get(Memory, memory.id) is not None

    restored = reset_demo_space(
        session, environment=Environment.TEST, reference_date=REFERENCE_DATE
    )
    assert restored.space_id != result.space_id
    _assert_memory_planning_showcase(session, restored)


def test_demo_diary_only_marks_authored_chapter_starts_for_both_personas(session: Session) -> None:
    result = _seed(session)
    chapters = list(session.scalars(select(Chapter).where(Chapter.space_id == result.space_id)))
    assert len(chapters) == 7
    by_title = {chapter.payload.title: chapter for chapter in chapters}
    assert by_title["Abende ohne Uhr"].start_on is None
    assert by_title["Abende ohne Uhr"].end_on is None
    assert by_title["Unser Anfang"].start_on is None
    assert by_title["Unser Anfang"].end_on == date(2024, 8, 24)
    expected_markers = {
        chapter.id: chapter.start_on for chapter in chapters if chapter.start_on is not None
    }
    assert len(expected_markers) == 5

    for account_id in (result.lea_id, result.alex_id):
        context = AuthorizationContext(account_id=account_id, space_id=result.space_id)
        cursor = None
        markers = {}
        while True:
            page = story_service.read_timeline(
                session, context, limit=2, cursor=cursor, include_chapters=True
            )
            assert len(page.items) + len(page.chapter_markers) <= 2
            for marker in page.chapter_markers:
                assert marker.id not in markers
                markers[marker.id] = marker.effective_date
            if not page.has_more:
                break
            assert page.next_cursor is not None and page.next_cursor != cursor
            cursor = page.next_cursor
        assert markers == expected_markers
        years = story_service.read_available_years(session, context, include_chapters=True)
        assert {2023, 2025, 2026} <= set(years)
        assert 2024 not in years  # An end-only Chapter never invents a diary position/year.


def test_demo_places_exercise_alphabetical_pages_and_lifecycle_scopes(session: Session) -> None:
    result = _seed(session)
    active = ["Alte Mühle", "Café am Markt", "Stadtgarten", "Waldsee"]
    archived = ["Kleines Programmkino"]
    for account_id in (result.lea_id, result.alex_id):
        context = AuthorizationContext(account_id=account_id, space_id=result.space_id)
        for scope, expected in (
            ("ACTIVE", active),
            ("ARCHIVED", archived),
            ("ALL", sorted([*active, *archived], key=str.casefold)),
        ):
            cursor = None
            names = []
            while True:
                page = place_service.list_places(
                    session, context, cursor=cursor, limit=2, scope=scope
                )
                names.extend(place.payload.name for place in page.items)
                if not page.has_more:
                    break
                assert page.next_cursor is not None and page.next_cursor != cursor
                cursor = page.next_cursor
            assert names == expected


def test_demo_tag_suggestions_reuse_shared_labels_without_partner_private_labels(
    session: Session,
) -> None:
    result = _seed(session)
    lea = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    alex = AuthorizationContext(account_id=result.alex_id, space_id=result.space_id)
    lea_learned, lea_proposed = context_tag_service.suggestions(session, lea)
    alex_learned, alex_proposed = context_tag_service.suggestions(session, alex)
    assert {"Am See", "Zuhause", "Frühstück", "Dankbarkeit"} <= (
        set(lea_learned) & set(alex_learned)
    )
    assert "Überraschung" in lea_learned
    assert "Überraschung" not in alex_learned
    assert lea_proposed == alex_proposed == []


def test_demo_same_memory_shows_both_personas_comments(session: Session) -> None:
    result = _seed(session)
    memory = _memory_by_title(session, result.space_id, "Spaziergang am See")
    for account_id in (result.lea_id, result.alex_id):
        page = comment_service.list_comments(
            session,
            AuthorizationContext(account_id=account_id, space_id=result.space_id),
            target_type=CommentTarget.MEMORY,
            target_id=memory.id,
            cursor=None,
            limit=20,
        )
        assert len(page.items) == 2
        assert {comment.owner_id for comment in page.items} == {result.lea_id, result.alex_id}
        assert all(comment.payload.body for comment in page.items)


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
    restored_link = session.execute(
        select(PlaceMemory).where(
            PlaceMemory.place_id == restored_cafe.id,
            PlaceMemory.memory_id == restored_breakfast.id,
        )
    ).scalar_one()
    assert restored_link.photo_generated is False

    # Reset recreates the annual and oldest-memory fixtures from the same
    # reference date; idempotent ensure never rewrites existing visitor content.
    assert _memory_by_title(session, reset.space_id, "Dieser Tag am See").happened_on == date(
        2025, 8, 24
    )
    assert _memory_by_title(
        session, reset.space_id, "Unser erster Abend am Wasser"
    ).happened_on == date(2023, 8, 24)
