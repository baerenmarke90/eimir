"""Domain logic for typed M3 content relations.

All Place and Chapter relation kinds share the same implementation so their
security and concurrency semantics cannot drift.

**The lock order is parent, then target.** Always, without exception
(M3-D26). The parent is locked exclusively, then the target with `FOR SHARE`.
A HeartMoment privacy transition therefore never acquires parent locks after
locking the target.

**A target is checked again after locking, not before.** Between lookup and
write it could be deleted or become private. Only the lock makes the check
stable.

**Every invalid target receives the same response.** Unknown, deleted,
foreign space, `OWNER_ONLY`: four different facts, one response
(`RELATION_TARGET_NOT_FOUND`, 404).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING, Literal, Protocol, cast
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.orm import Session

from eimir.authorization import (
    AuthorizationContext,
    PrivacyClass,
    PrivateResourceMixin,
    require_readable,
    require_readable_shared,
    require_writable_locked,
)
from eimir.chapters.models import Chapter
from eimir.core.errors import DomainError, NotFoundError
from eimir.db.base import Base
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.outbox import service as outbox_service
from eimir.places.models import Place
from eimir.relations.models import (
    ChapterHeartMoment,
    ChapterMemory,
    ChapterMilestone,
    PlaceHeartMoment,
    PlaceMemory,
    PlaceMilestone,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from collections.abc import Sequence


TargetType = Literal["MEMORY", "HEART_MOMENT", "MILESTONE"]


class RelatableTarget(Protocol):
    """The target surface required by relation creation."""

    id: UUID
    privacy_class: str


class RelationParent(Protocol):
    """The parent surface required by generic relation mutations."""

    id: UUID
    space_id: UUID
    version: int


RELATION_TARGET_NOT_FOUND = "RELATION_TARGET_NOT_FOUND"
RELATION_NOT_FOUND = "RELATION_NOT_FOUND"


def target_not_found() -> NotFoundError:
    """Return the single privacy-safe response used for every invalid target."""
    return NotFoundError("Relation target not found.", RELATION_TARGET_NOT_FOUND)


@dataclass(frozen=True)
class RelationKind:
    """One explicitly allowed typed relation."""

    slug: str
    relation: type[Base]
    parent: type[PrivateResourceMixin]
    parent_column: str
    subject_type: Literal["place_relation", "chapter_relation"]
    target: type[PrivateResourceMixin]
    target_column: str
    event_target_type: TargetType
    linked_event: EventType
    unlinked_event: EventType
    shared_target_only: bool = False


PLACE_MEMORIES = RelationKind(
    slug="memories",
    event_target_type="MEMORY",
    relation=PlaceMemory,
    parent=Place,
    parent_column="place_id",
    subject_type="place_relation",
    target=Memory,
    target_column="memory_id",
    linked_event=EventType.PLACE_MEMORY_LINKED,
    unlinked_event=EventType.PLACE_MEMORY_UNLINKED,
)
PLACE_MILESTONES = RelationKind(
    slug="milestones",
    event_target_type="MILESTONE",
    relation=PlaceMilestone,
    parent=Place,
    parent_column="place_id",
    subject_type="place_relation",
    target=Milestone,
    target_column="milestone_id",
    linked_event=EventType.PLACE_MILESTONE_LINKED,
    unlinked_event=EventType.PLACE_MILESTONE_UNLINKED,
)
PLACE_HEART_MOMENTS = RelationKind(
    slug="heart-moments",
    event_target_type="HEART_MOMENT",
    relation=PlaceHeartMoment,
    parent=Place,
    parent_column="place_id",
    subject_type="place_relation",
    target=HeartMoment,
    target_column="heart_moment_id",
    linked_event=EventType.PLACE_HEART_MOMENT_LINKED,
    unlinked_event=EventType.PLACE_HEART_MOMENT_UNLINKED,
    shared_target_only=True,
)

CHAPTER_MEMORIES = RelationKind(
    slug="memories",
    event_target_type="MEMORY",
    relation=ChapterMemory,
    parent=Chapter,
    parent_column="chapter_id",
    subject_type="chapter_relation",
    target=Memory,
    target_column="memory_id",
    linked_event=EventType.CHAPTER_MEMORY_LINKED,
    unlinked_event=EventType.CHAPTER_MEMORY_UNLINKED,
)
CHAPTER_MILESTONES = RelationKind(
    slug="milestones",
    event_target_type="MILESTONE",
    relation=ChapterMilestone,
    parent=Chapter,
    parent_column="chapter_id",
    subject_type="chapter_relation",
    target=Milestone,
    target_column="milestone_id",
    linked_event=EventType.CHAPTER_MILESTONE_LINKED,
    unlinked_event=EventType.CHAPTER_MILESTONE_UNLINKED,
)
CHAPTER_HEART_MOMENTS = RelationKind(
    slug="heart-moments",
    event_target_type="HEART_MOMENT",
    relation=ChapterHeartMoment,
    parent=Chapter,
    parent_column="chapter_id",
    subject_type="chapter_relation",
    target=HeartMoment,
    target_column="heart_moment_id",
    linked_event=EventType.CHAPTER_HEART_MOMENT_LINKED,
    unlinked_event=EventType.CHAPTER_HEART_MOMENT_UNLINKED,
    shared_target_only=True,
)

PLACE_RELATION_KINDS: tuple[RelationKind, ...] = (
    PLACE_MEMORIES,
    PLACE_HEART_MOMENTS,
    PLACE_MILESTONES,
)
CHAPTER_RELATION_KINDS: tuple[RelationKind, ...] = (
    CHAPTER_MEMORIES,
    CHAPTER_HEART_MOMENTS,
    CHAPTER_MILESTONES,
)

_PLACE_BY_SLUG = {kind.slug: kind for kind in PLACE_RELATION_KINDS}
_CHAPTER_BY_SLUG = {kind.slug: kind for kind in CHAPTER_RELATION_KINDS}


def _kind_for(slug: str, kinds: dict[str, RelationKind]) -> RelationKind:
    found = kinds.get(slug)
    if found is None:
        raise target_not_found()
    return found


def kind_for(slug: str) -> RelationKind:
    """Resolve a Place relation route segment, preserving the S4 contract."""
    return _kind_for(slug, _PLACE_BY_SLUG)


def chapter_kind_for(slug: str) -> RelationKind:
    """Resolve a Chapter relation route segment."""
    return _kind_for(slug, _CHAPTER_BY_SLUG)


def _flush(session: Session) -> None:
    session.flush()


def _record(
    session: Session,
    kind: RelationKind,
    parent: RelationParent,
    target_id: UUID,
    actor_id: UUID,
    event_type: EventType,
) -> None:
    """Record IDs only; relation events are never a content read path."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=parent.space_id,
            actor_id=actor_id,
            subject_type=kind.subject_type,
            subject_id=parent.id,
            resource_version=parent.version,
            payload=PublicEventPayload(
                target_type=kind.event_target_type,
                target_id=target_id,
            ),
        ),
    )


def _require_relatable_target(
    session: Session,
    context: AuthorizationContext,
    kind: RelationKind,
    target_id: UUID | str,
) -> RelatableTarget:
    """Lock and then revalidate a target, normalizing all absence reasons."""
    try:
        found = require_readable_shared(session, kind.target, context, target_id)
    except DomainError as error:
        raise target_not_found() from error

    if kind.shared_target_only and found.privacy_class != PrivacyClass.SPACE_SHARED.value:
        raise target_not_found()
    return cast("RelatableTarget", found)


def link(
    session: Session,
    context: AuthorizationContext,
    parent_id: UUID | str,
    target_id: UUID | str,
    kind: RelationKind,
) -> None:
    """Link parent and target idempotently using Parent -> Target lock order."""
    parent = cast(
        "RelationParent",
        require_writable_locked(session, kind.parent, context, parent_id),
    )
    target = _require_relatable_target(session, context, kind, target_id)

    values: dict[str, object] = {
        kind.parent_column: parent.id,
        kind.target_column: target.id,
        "space_id": parent.space_id,
        "created_by": context.account_id,
    }
    if kind.shared_target_only:
        values["target_privacy_class"] = target.privacy_class

    statement = (
        postgres_insert(kind.relation)
        .values(**values)
        .on_conflict_do_nothing(
            index_elements=[kind.parent_column, kind.target_column],
        )
        .returning(kind.relation.__table__.c[kind.parent_column])
    )
    created = session.execute(statement).first() is not None
    _flush(session)
    if created:
        _record(session, kind, parent, target.id, context.account_id, kind.linked_event)
        _flush(session)


def unlink(
    session: Session,
    context: AuthorizationContext,
    parent_id: UUID | str,
    target_id: UUID | str,
    kind: RelationKind,
) -> None:
    """Remove only the link; both original resources remain unchanged."""
    parent = cast(
        "RelationParent",
        require_writable_locked(session, kind.parent, context, parent_id),
    )
    target = _require_relatable_target(session, context, kind, target_id)
    table = kind.relation.__table__
    removed = session.execute(
        delete(kind.relation)
        .where(
            table.c[kind.parent_column] == parent.id,
            table.c[kind.target_column] == target.id,
        )
        .returning(table.c[kind.parent_column])
    ).first()
    _flush(session)
    if removed is None:
        raise NotFoundError("Relation not found.", RELATION_NOT_FOUND)
    _record(session, kind, parent, target.id, context.account_id, kind.unlinked_event)
    _flush(session)


def list_targets(
    session: Session,
    context: AuthorizationContext,
    parent_id: UUID | str,
    kind: RelationKind,
) -> Sequence[UUID]:
    """Return target IDs for one typed relation, oldest link first."""
    parent = cast(
        "RelationParent",
        require_readable(session, kind.parent, context, parent_id),
    )
    table = kind.relation.__table__
    rows = session.execute(
        select(table.c[kind.target_column])
        .where(table.c[kind.parent_column] == parent.id)
        .order_by(table.c.created_at, table.c[kind.target_column])
    ).scalars()
    return list(rows)


@dataclass(frozen=True)
class ChapterContentReference:
    """A content identity in the derived Chapter presentation order."""

    target_type: TargetType
    target_id: UUID


def _sort_instant(event_date: date | None, created_at: datetime) -> datetime:
    if event_date is not None:
        return datetime.combine(event_date, time.min, tzinfo=UTC)
    if created_at.tzinfo is None:
        return created_at.replace(tzinfo=UTC)
    return created_at.astimezone(UTC)


def list_chapter_content(
    session: Session,
    context: AuthorizationContext,
    chapter_id: UUID | str,
) -> list[ChapterContentReference]:
    """Derive one stable cross-type Chapter order from original resources.

    No relation position is persisted. The key is M3-D24 exactly: `happenedOn`
    when the resource has one, otherwise `createdAt`, then resource type and
    UUID. The service returns identities only so each resource remains readable
    through its own authorization boundary.
    """
    chapter = require_readable(session, Chapter, context, chapter_id)
    sortable: list[tuple[datetime, str, str, ChapterContentReference]] = []

    for target_id, happened_on, created_at in session.execute(
        select(Memory.id, Memory.happened_on, Memory.created_at)
        .join(ChapterMemory, ChapterMemory.memory_id == Memory.id)
        .where(ChapterMemory.chapter_id == chapter.id)
    ):
        ref = ChapterContentReference("MEMORY", target_id)
        sortable.append(
            (_sort_instant(happened_on, created_at), ref.target_type, str(target_id), ref)
        )

    for target_id, happened_on, created_at in session.execute(
        select(HeartMoment.id, HeartMoment.happened_on, HeartMoment.created_at)
        .join(ChapterHeartMoment, ChapterHeartMoment.heart_moment_id == HeartMoment.id)
        .where(ChapterHeartMoment.chapter_id == chapter.id)
    ):
        ref = ChapterContentReference("HEART_MOMENT", target_id)
        sortable.append(
            (_sort_instant(happened_on, created_at), ref.target_type, str(target_id), ref)
        )

    for target_id, happened_on, created_at in session.execute(
        select(Milestone.id, Milestone.happened_on, Milestone.created_at)
        .join(ChapterMilestone, ChapterMilestone.milestone_id == Milestone.id)
        .where(ChapterMilestone.chapter_id == chapter.id)
    ):
        ref = ChapterContentReference("MILESTONE", target_id)
        sortable.append(
            (_sort_instant(happened_on, created_at), ref.target_type, str(target_id), ref)
        )

    sortable.sort(key=lambda item: item[:3])
    return [item[3] for item in sortable]


def drop_shared_relations_of_heart_moment(session: Session, heart_moment: HeartMoment) -> None:
    """Remove every shared Place/Chapter relation before OWNER_ONLY transition.

    No parent lock is acquired after the target lock. A concurrent relation
    create holds the parent first and waits for this HeartMoment; reversing the
    order here would create the deadlock prohibited by M3-D26.
    """
    place_table = PlaceHeartMoment.__table__
    chapter_table = ChapterHeartMoment.__table__
    session.execute(
        delete(PlaceHeartMoment).where(place_table.c.heart_moment_id == heart_moment.id)
    )
    session.execute(
        delete(ChapterHeartMoment).where(chapter_table.c.heart_moment_id == heart_moment.id)
    )
    session.flush()
