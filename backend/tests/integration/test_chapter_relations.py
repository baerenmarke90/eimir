"""Acceptance coverage for typed M3 Chapter content relations."""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.chapters import service as chapter_service
from eimir.chapters.models import Chapter
from eimir.core.errors import NotFoundError
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.milestones import service as milestone_service
from eimir.milestones.models import Milestone
from eimir.relations import service as relation_service
from eimir.relations.models import ChapterHeartMoment, ChapterMemory, ChapterMilestone
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Foreign")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    session.flush()
    return {
        "anna": AuthorizationContext(anna.id, space.id),
        "ben": AuthorizationContext(ben.id, space.id),
        "foreign": AuthorizationContext(foreign.id, foreign_space.id),
    }


def _chapter(session: Session, context: AuthorizationContext, title: str = "Chapter") -> Chapter:
    return chapter_service.create_chapter(
        session,
        context,
        title=title,
        description=None,
        start_on=None,
        end_on=None,
        place_id=None,
    )


def _memory(
    session: Session,
    context: AuthorizationContext,
    *,
    happened_on: date | None,
) -> Memory:
    return memory_service.create_memory(
        session,
        context,
        title="Memory",
        body="",
        happened_on=happened_on,
    )


def _heart(session: Session, context: AuthorizationContext) -> HeartMoment:
    return heart_moment_service.create_heart_moment(
        session,
        context,
        text="Heart",
        emotion=HeartEmotion.LOVED,
        visibility=ContentVisibility.SHARED,
        happened_on=date(2026, 2, 1),
    )


def _milestone(session: Session, context: AuthorizationContext) -> Milestone:
    return milestone_service.create_milestone(
        session,
        context,
        title="Milestone",
        body=None,
        happened_on=date(2026, 3, 1),
    )


def _count(session: Session, model: type) -> int:
    return session.execute(select(func.count()).select_from(model)).scalar_one()


def test_chapter_delete_removes_relations_and_preserves_every_original(
    session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    chapter = _chapter(session, couple["anna"])
    memory = _memory(session, couple["anna"], happened_on=date(2026, 1, 1))
    heart = _heart(session, couple["anna"])
    milestone = _milestone(session, couple["anna"])

    relation_service.link(
        session, couple["anna"], chapter.id, memory.id, relation_service.CHAPTER_MEMORIES
    )
    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        heart.id,
        relation_service.CHAPTER_HEART_MOMENTS,
    )
    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        milestone.id,
        relation_service.CHAPTER_MILESTONES,
    )
    assert _count(session, ChapterMemory) == 1
    assert _count(session, ChapterHeartMoment) == 1
    assert _count(session, ChapterMilestone) == 1

    chapter_service.delete_chapter(
        session,
        couple["ben"],
        chapter.id,
        expected_version=1,
    )

    assert _count(session, ChapterMemory) == 0
    assert _count(session, ChapterHeartMoment) == 0
    assert _count(session, ChapterMilestone) == 0
    assert memory_service.get_memory(session, couple["ben"], memory.id).id == memory.id
    assert heart_moment_service.get_heart_moment(session, couple["ben"], heart.id).id == heart.id
    assert milestone_service.get_milestone(session, couple["ben"], milestone.id).id == milestone.id


def test_duplicate_link_is_idempotent_and_target_may_belong_to_two_chapters(
    session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    first = _chapter(session, couple["anna"], "First")
    second = _chapter(session, couple["anna"], "Second")
    memory = _memory(session, couple["anna"], happened_on=None)

    relation_service.link(
        session, couple["anna"], first.id, memory.id, relation_service.CHAPTER_MEMORIES
    )
    relation_service.link(
        session, couple["ben"], first.id, memory.id, relation_service.CHAPTER_MEMORIES
    )
    relation_service.link(
        session, couple["ben"], second.id, memory.id, relation_service.CHAPTER_MEMORIES
    )

    assert _count(session, ChapterMemory) == 2
    assert relation_service.list_targets(
        session, couple["anna"], first.id, relation_service.CHAPTER_MEMORIES
    ) == [memory.id]
    assert relation_service.list_targets(
        session, couple["anna"], second.id, relation_service.CHAPTER_MEMORIES
    ) == [memory.id]


def test_private_and_foreign_targets_fail_closed(session, couple) -> None:  # type: ignore[no-untyped-def]
    chapter = _chapter(session, couple["anna"])
    private = heart_moment_service.create_heart_moment(
        session,
        couple["anna"],
        text="Private",
        emotion=HeartEmotion.SEEN,
        visibility=ContentVisibility.PRIVATE,
        happened_on=date(2026, 1, 1),
    )
    foreign_memory = _memory(session, couple["foreign"], happened_on=None)

    for target, kind in (
        (private, relation_service.CHAPTER_HEART_MOMENTS),
        (foreign_memory, relation_service.CHAPTER_MEMORIES),
    ):
        with pytest.raises(NotFoundError) as caught:
            relation_service.link(session, couple["anna"], chapter.id, target.id, kind)
        assert caught.value.code == relation_service.RELATION_TARGET_NOT_FOUND


def test_shared_to_private_removes_chapter_relation_and_reverse_does_not_restore(
    session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    chapter = _chapter(session, couple["anna"])
    heart = _heart(session, couple["anna"])
    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        heart.id,
        relation_service.CHAPTER_HEART_MOMENTS,
    )
    assert _count(session, ChapterHeartMoment) == 1

    private = heart_moment_service.change_visibility(
        session,
        couple["anna"],
        heart.id,
        expected_version=1,
        visibility=ContentVisibility.PRIVATE,
    )
    assert private.version == 2
    assert _count(session, ChapterHeartMoment) == 0

    shared = heart_moment_service.change_visibility(
        session,
        couple["anna"],
        heart.id,
        expected_version=2,
        visibility=ContentVisibility.SHARED,
    )
    assert shared.version == 3
    assert _count(session, ChapterHeartMoment) == 0


def test_combined_chapter_order_uses_event_date_then_created_at_then_type_and_id(
    session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    chapter = _chapter(session, couple["anna"])
    memory_without_date = _memory(session, couple["anna"], happened_on=None)
    memory_without_date.created_at = datetime(2026, 1, 15, 12, tzinfo=UTC)
    heart = _heart(session, couple["anna"])
    milestone = _milestone(session, couple["anna"])
    session.flush()

    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        milestone.id,
        relation_service.CHAPTER_MILESTONES,
    )
    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        memory_without_date.id,
        relation_service.CHAPTER_MEMORIES,
    )
    relation_service.link(
        session,
        couple["anna"],
        chapter.id,
        heart.id,
        relation_service.CHAPTER_HEART_MOMENTS,
    )

    ordered = relation_service.list_chapter_content(session, couple["ben"], chapter.id)
    assert [(item.target_type, item.target_id) for item in ordered] == [
        ("MEMORY", memory_without_date.id),
        ("HEART_MOMENT", heart.id),
        ("MILESTONE", milestone.id),
    ]


def test_unlink_removes_only_relation(session, couple) -> None:  # type: ignore[no-untyped-def]
    chapter = _chapter(session, couple["anna"])
    memory = _memory(session, couple["anna"], happened_on=None)
    relation_service.link(
        session, couple["anna"], chapter.id, memory.id, relation_service.CHAPTER_MEMORIES
    )

    relation_service.unlink(
        session, couple["ben"], chapter.id, memory.id, relation_service.CHAPTER_MEMORIES
    )

    assert _count(session, ChapterMemory) == 0
    assert memory_service.get_memory(session, couple["ben"], memory.id).id == memory.id
