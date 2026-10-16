"""PostgreSQL acceptance coverage for the M3-S5 Chapter core domain."""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.chapters import service as chapter_service
from eimir.chapters.models import Chapter
from eimir.core.errors import BadRequestError, ConflictError, NotFoundError, ValidationError
from eimir.places import service as place_service
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
        "anna": anna,
        "ben": ben,
        "foreign": foreign,
        "space": space,
        "foreign_space": foreign_space,
        "anna_context": AuthorizationContext(anna.id, space.id),
        "ben_context": AuthorizationContext(ben.id, space.id),
        "foreign_context": AuthorizationContext(foreign.id, foreign_space.id),
    }


def create_chapter(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str = "Our first year",
    description: str | None = "The beginning.",
    start_on: date | None = None,
    end_on: date | None = None,
    place_id: UUID | str | None = None,
) -> Chapter:
    return chapter_service.create_chapter(
        session,
        context,
        title=title,
        description=description,
        start_on=start_on,
        end_on=end_on,
        place_id=place_id,
    )


@pytest.mark.parametrize(
    ("start_on", "end_on"),
    [
        (None, None),
        (date(2026, 1, 1), None),
        (None, date(2026, 12, 31)),
        (date(2026, 1, 1), date(2026, 12, 31)),
    ],
)
def test_all_decided_date_shapes_are_valid(  # type: ignore[no-untyped-def]
    session, couple, start_on, end_on
) -> None:
    chapter = create_chapter(
        session,
        couple["anna_context"],
        start_on=start_on,
        end_on=end_on,
    )
    assert chapter.start_on == start_on
    assert chapter.end_on == end_on


def test_end_before_start_is_rejected_by_service(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    with pytest.raises(ValidationError) as caught:
        create_chapter(
            session,
            couple["anna_context"],
            start_on=date(2026, 5, 2),
            end_on=date(2026, 5, 1),
        )
    assert caught.value.code == chapter_service.CHAPTER_DATE_RANGE_INVALID


def test_database_keeps_date_invariant_without_service(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    chapter = create_chapter(session, couple["anna_context"])
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(
            text(
                "UPDATE chapters SET start_on = :start_on, end_on = :end_on WHERE id = :chapter_id"
            ),
            {
                "start_on": date(2026, 5, 2),
                "end_on": date(2026, 5, 1),
                "chapter_id": chapter.id,
            },
        )


def test_partner_can_update_shared_chapter_with_version_check(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    chapter = create_chapter(session, couple["anna_context"])
    updated = chapter_service.update_chapter(
        session,
        couple["ben_context"],
        chapter.id,
        expected_version=1,
        changed_fields=frozenset({"title", "start_on"}),
        title="  Our next chapter  ",
        description=None,
        start_on=date(2026, 1, 1),
        end_on=None,
        place_id=None,
    )
    assert updated.payload.title == "Our next chapter"
    assert updated.owner_id == couple["anna"].id
    assert updated.version == 2

    with pytest.raises(ConflictError):
        chapter_service.update_chapter(
            session,
            couple["anna_context"],
            chapter.id,
            expected_version=1,
            changed_fields=frozenset({"description"}),
            title=None,
            description="Stale change",
            start_on=None,
            end_on=None,
            place_id=None,
        )


def test_cross_space_chapter_is_privacy_safe_not_found(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    chapter = create_chapter(session, couple["anna_context"])
    with pytest.raises(NotFoundError) as caught:
        chapter_service.get_chapter(session, couple["foreign_context"], chapter.id)
    assert caught.value.code == "CHAPTER_NOT_FOUND"


def test_place_reference_is_same_space_and_place_delete_detaches_versionedly(
    session,
    couple,
) -> None:  # type: ignore[no-untyped-def]
    place = place_service.create_place(
        session,
        couple["anna_context"],
        name="Our place",
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )
    chapter = create_chapter(session, couple["anna_context"], place_id=place.id)
    assert chapter.place_id == place.id
    assert chapter.version == 1

    place_service.delete_place(
        session,
        couple["ben_context"],
        place.id,
        expected_version=1,
    )
    session.refresh(chapter)
    assert chapter.place_id is None
    assert chapter.version == 2


def test_foreign_place_cannot_be_referenced(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    foreign_place = place_service.create_place(
        session,
        couple["foreign_context"],
        name="Foreign place",
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )
    with pytest.raises(NotFoundError) as caught:
        create_chapter(session, couple["anna_context"], place_id=foreign_place.id)
    assert caught.value.code == "PLACE_NOT_FOUND"


def test_delete_removes_only_the_chapter(session, couple) -> None:  # type: ignore[no-untyped-def]
    place = place_service.create_place(
        session,
        couple["anna_context"],
        name="Still here",
        description=None,
        address=None,
        latitude=None,
        longitude=None,
    )
    chapter = create_chapter(session, couple["anna_context"], place_id=place.id)
    chapter_service.delete_chapter(
        session,
        couple["ben_context"],
        chapter.id,
        expected_version=1,
    )
    assert session.get(Chapter, chapter.id) is None
    assert place_service.get_place(session, couple["anna_context"], place.id).id == place.id


def test_list_is_newest_first_and_cursor_is_space_bound(  # type: ignore[no-untyped-def]
    session, couple
) -> None:
    first = create_chapter(session, couple["anna_context"], title="First")
    second = create_chapter(session, couple["anna_context"], title="Second")
    page = chapter_service.list_chapters(
        session,
        couple["anna_context"],
        cursor=None,
        limit=1,
    )
    assert [chapter.id for chapter in page.items] == [second.id]
    assert page.has_more is True
    assert page.next_cursor is not None

    with pytest.raises(BadRequestError) as caught:
        chapter_service.list_chapters(
            session,
            couple["foreign_context"],
            cursor=page.next_cursor,
            limit=1,
        )
    assert caught.value.code == "INVALID_CURSOR"
    assert first.id != second.id
