"""Concurrency coverage for typed Chapter relations (M3-D09/M3-D26)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.chapters import service as chapter_service
from eimir.chapters.models import Chapter
from eimir.core.errors import DomainError
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.relations import service as relation_service
from eimir.relations.models import ChapterHeartMoment, ChapterMemory
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TODAY = date(2026, 8, 30)


def _setup(production_client):  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        anna_context = AuthorizationContext(anna.id, space.id)
        ben_context = AuthorizationContext(ben.id, space.id)
        chapter = chapter_service.create_chapter(
            session,
            anna_context,
            title="Our chapter",
            description=None,
            start_on=None,
            end_on=None,
            place_id=None,
        )
        memory = memory_service.create_memory(
            session,
            anna_context,
            title="Memory",
            body="",
            happened_on=None,
        )
        heart = heart_moment_service.create_heart_moment(
            session,
            anna_context,
            text="Heart",
            emotion=HeartEmotion.LOVED,
            visibility=ContentVisibility.SHARED,
            happened_on=TODAY,
        )
        return {
            "maker": maker,
            "anna": anna_context,
            "ben": ben_context,
            "chapter_id": chapter.id,
            "memory_id": memory.id,
            "heart_id": heart.id,
        }


def _result(fn):  # type: ignore[no-untyped-def]
    try:
        return fn()
    except DomainError as error:
        return error.code


def _concurrently(first, second):  # type: ignore[no-untyped-def]
    gate = Barrier(2, timeout=10)

    def run(fn):  # type: ignore[no-untyped-def]
        gate.wait()
        return _result(fn)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(run, first)
        second_future = pool.submit(run, second)
        return first_future.result(timeout=20), second_future.result(timeout=20)


def _count(maker, model) -> int:  # type: ignore[no-untyped-def]
    with maker() as session:
        return session.execute(select(func.count()).select_from(model)).scalar_one()


def test_chapter_delete_against_relation_create_has_no_orphan(production_client) -> None:  # type: ignore[no-untyped-def]
    world = _setup(production_client)
    maker = world["maker"]

    def delete():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            chapter_service.delete_chapter(
                session,
                world["anna"],
                world["chapter_id"],
                expected_version=1,
            )
            return "DELETED"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["chapter_id"],
                world["memory_id"],
                relation_service.CHAPTER_MEMORIES,
            )
            return "LINKED"

    results = set(_concurrently(delete, link))
    assert results <= {
        "DELETED",
        "LINKED",
        "CHAPTER_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        chapter = verification.get(Chapter, world["chapter_id"])
        memory = verification.get(Memory, world["memory_id"])
    assert memory is not None
    if chapter is None:
        assert _count(maker, ChapterMemory) == 0
    else:
        assert "LINKED" in results
        assert _count(maker, ChapterMemory) == 1


def test_target_delete_against_chapter_relation_create_has_no_orphan(production_client) -> None:  # type: ignore[no-untyped-def]
    world = _setup(production_client)
    maker = world["maker"]

    def delete():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            memory_service.delete_memory(
                session,
                world["anna"],
                world["memory_id"],
                expected_version=1,
            )
            return "DELETED"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["chapter_id"],
                world["memory_id"],
                relation_service.CHAPTER_MEMORIES,
            )
            return "LINKED"

    results = set(_concurrently(delete, link))
    assert results <= {
        "DELETED",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        memory = verification.get(Memory, world["memory_id"])
    if memory is None:
        assert _count(maker, ChapterMemory) == 0
    else:
        assert _count(maker, ChapterMemory) == 1


def test_two_identical_chapter_relation_creates_produce_one_row(production_client) -> None:  # type: ignore[no-untyped-def]
    world = _setup(production_client)
    maker = world["maker"]

    def link(context):  # type: ignore[no-untyped-def]
        def run():  # type: ignore[no-untyped-def]
            with maker.begin() as session:
                relation_service.link(
                    session,
                    context,
                    world["chapter_id"],
                    world["memory_id"],
                    relation_service.CHAPTER_MEMORIES,
                )
                return "LINKED"

        return run

    results = set(_concurrently(link(world["anna"]), link(world["ben"])))
    assert results == {"LINKED"}
    assert _count(maker, ChapterMemory) == 1


def test_privacy_transition_against_chapter_relation_create_never_leaks(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    world = _setup(production_client)
    maker = world["maker"]

    def make_private():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            heart_moment_service.change_visibility(
                session,
                world["anna"],
                world["heart_id"],
                expected_version=1,
                visibility=ContentVisibility.PRIVATE,
            )
            return "PRIVATE"

    def link():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["chapter_id"],
                world["heart_id"],
                relation_service.CHAPTER_HEART_MOMENTS,
            )
            return "LINKED"

    results = set(_concurrently(make_private, link))
    assert results <= {
        "PRIVATE",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        heart = verification.get(HeartMoment, world["heart_id"])
        assert heart is not None
        is_private = heart.privacy_class == "OWNER_ONLY"

    if is_private:
        assert _count(maker, ChapterHeartMoment) == 0
    else:
        assert _count(maker, ChapterHeartMoment) == 1


def test_existing_chapter_relation_cannot_survive_privacy_race(production_client) -> None:  # type: ignore[no-untyped-def]
    world = _setup(production_client)
    maker = world["maker"]
    with maker.begin() as session:
        relation_service.link(
            session,
            world["anna"],
            world["chapter_id"],
            world["heart_id"],
            relation_service.CHAPTER_HEART_MOMENTS,
        )
    assert _count(maker, ChapterHeartMoment) == 1

    def make_private():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            heart_moment_service.change_visibility(
                session,
                world["anna"],
                world["heart_id"],
                expected_version=1,
                visibility=ContentVisibility.PRIVATE,
            )
            return "PRIVATE"

    def relink():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            relation_service.link(
                session,
                world["ben"],
                world["chapter_id"],
                world["heart_id"],
                relation_service.CHAPTER_HEART_MOMENTS,
            )
            return "LINKED"

    results = set(_concurrently(make_private, relink))
    assert results <= {
        "PRIVATE",
        "LINKED",
        "RELATION_TARGET_NOT_FOUND",
        "RESOURCE_VERSION_CONFLICT",
    }

    with maker() as verification:
        heart = verification.get(HeartMoment, world["heart_id"])
        assert heart is not None
        if heart.privacy_class == "OWNER_ONLY":
            assert _count(maker, ChapterHeartMoment) == 0
