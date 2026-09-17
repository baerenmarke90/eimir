"""HTTP contract for the shared story timeline.

The route returns shared content exclusively. M2-D22 intentionally defines no
``PRIVATE`` variant, no ``visibility`` parameter, and no owner mode here: the
owner view for private heart moments is a separate projection through the
HeartMoment collection.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from pydantic import Field, RootModel
from sqlalchemy import select

from eimir.api.authors import resolve_author_summaries
from eimir.api.deps import Authorization, DbSession, Tenant
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.api.v1.attachments import AttachmentSummary
from eimir.api.v1.memories import MemoryAttachmentSummary
from eimir.attachments import binding
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import readable
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.story import service, view_service
from eimir.story.service import StoryKind, StoryOrder, StoryRow

router = APIRouter(tags=["story"])


class MemorySummary(ApiModel):
    """Memory projection used as a timeline card.

    The body is intentionally omitted: the card needs a heading and images,
    while returning one hundred full texts would produce data nobody requested.
    The body remains available on the detail route.
    """

    id: UUID
    title: str
    happened_on: date | None
    created_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachments: list[MemoryAttachmentSummary]


class SharedHeartMomentSummary(ApiModel):
    """A shared heart moment. There is deliberately no private variant."""

    id: UUID
    text: str
    emotion: HeartEmotion
    happened_on: date
    created_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachment: AttachmentSummary | None


class MilestoneSummary(ApiModel):
    id: UUID
    title: str
    happened_on: date
    created_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities


class StoryMemoryItem(ApiModel):
    kind: Literal[StoryKind.MEMORY]
    effective_date: date
    memory: MemorySummary


class StoryHeartMomentItem(ApiModel):
    kind: Literal[StoryKind.HEART_MOMENT]
    effective_date: date
    heart_moment: SharedHeartMomentSummary


class StoryMilestoneItem(ApiModel):
    kind: Literal[StoryKind.MILESTONE]
    effective_date: date
    milestone: MilestoneSummary


StoryItemVariant = Annotated[
    StoryMemoryItem | StoryHeartMomentItem | StoryMilestoneItem,
    Field(discriminator="kind"),
]
"""``kind`` discriminates variants in the contract itself.

Clients do not need to infer which field is set, and a new type can be added
later without changing existing variants."""


class StoryItem(RootModel[StoryItemVariant]):
    """A timeline item discriminated by ``kind``.

    This is a named type rather than an anonymous union in the list field.
    Otherwise OpenAPI names it after its location (``StoryPageItemsInner``)
    and every generated client propagates that accidental name.
    ``API-DESIGN.md`` calls the contract type ``StoryItem`` and the schema
    should do the same.
    """

    root: StoryItemVariant


class StoryPage(ApiModel):
    items: list[StoryItem]
    next_cursor: str | None
    has_more: bool
    available_years: list[int] = Field(default_factory=list)


class StoryViewReceipt(ApiModel):
    """An intentional canonical-detail presentation reported by a client."""

    kind: StoryKind
    item_id: str


@router.post(
    "/spaces/{spaceId}/story-views",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="recordStoryView",
    responses=problem_responses(401, 404, 422),
)
def record_story_view(
    receipt: StoryViewReceipt,
    tenant: Tenant,
    authorization: Authorization,
    session: DbSession,
) -> Response:
    """Record an intentional Story detail view without retaining an event history."""
    view_service.record_intentional_view(
        session,
        authorization,
        account_timezone=tenant.account.timezone,
        kind=receipt.kind,
        item_id=receipt.item_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _authors(session: DbSession, owner_ids: set[UUID]) -> dict[UUID, AuthorSummary]:
    return resolve_author_summaries(session, owner_ids)


def _capabilities(
    owner_id: UUID, authorization: Authorization, *, can_comment: bool = True
) -> ResourceCapabilities:
    is_author = owner_id == authorization.account_id
    return ResourceCapabilities(can_edit=is_author, can_delete=is_author, can_comment=can_comment)


def _attachment_summary(attachment: Attachment) -> AttachmentSummary:
    return AttachmentSummary(
        id=attachment.id,
        status="READY",
        media_type=MediaType(attachment.media_type),
        mime_type=attachment.mime_type,
        size=attachment.size,
        width=attachment.width,
        height=attachment.height,
        has_thumbnail=attachment.has_thumbnail,
    )


@router.get(
    "/spaces/{spaceId}/timeline",
    response_model=StoryPage,
    operation_id="getStoryTimeline",
    responses=problem_responses(400, 401, 404, 422),
)
def get_story_timeline(
    authorization: Authorization,
    session: DbSession,
    type: Annotated[list[StoryKind] | None, Query()] = None,
    year: Annotated[int | None, Query(ge=service.MIN_YEAR, le=service.MAX_YEAR)] = None,
    order: Annotated[StoryOrder, Query()] = StoryOrder.DESC,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIMIT)] = service.DEFAULT_LIMIT,
) -> StoryPage:
    """Return the shared timeline of memories, milestones, and heart moments.

    Private heart moments never appear here, including for their owner.
    """
    kinds_tuple = tuple(type or ())
    page = service.read_timeline(
        session,
        authorization,
        kinds=kinds_tuple,
        year=year,
        order=order,
        cursor=cursor,
        limit=limit,
    )
    available_years = service.read_available_years(
        session,
        authorization,
        kinds=kinds_tuple,
    )
    return StoryPage(
        items=_project(session, authorization, page.items),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        available_years=available_years,
    )


def _project(
    session: DbSession,
    authorization: Authorization,
    items: list[StoryRow],
) -> list[StoryItem]:
    """Project one page into DTOs in batches rather than row by row.

    The timeline query returns only keys. This function performs one query per
    resource type, one for authors, and one for galleries. Loading each item
    individually would turn a page of one hundred items into several hundred
    queries.

    Resource loading again uses ``readable()``. This is not distrust of the
    timeline query but the invariant that no row in this system is read without
    an explicit visibility predicate.
    """
    ids_by_kind: dict[StoryKind, list[UUID]] = {kind: [] for kind in StoryKind}
    for item in items:
        ids_by_kind[item.kind].append(item.id)

    memories = _load(session, authorization, Memory, ids_by_kind[StoryKind.MEMORY])
    heart_moments = _load(session, authorization, HeartMoment, ids_by_kind[StoryKind.HEART_MOMENT])
    milestones = _load(session, authorization, Milestone, ids_by_kind[StoryKind.MILESTONE])

    galleries = binding.attachments_of_memories(session, list(memories))
    attachments = _heart_attachments(session, heart_moments.values())
    authors = _authors(
        session,
        {
            entry.owner_id
            for source in (memories, heart_moments, milestones)
            for entry in source.values()
        },
    )

    view: list[StoryItemVariant] = []
    for item in items:
        if item.kind is StoryKind.MEMORY:
            memory = memories.get(item.id)
            if memory is None:
                continue
            view.append(
                StoryMemoryItem(
                    kind=StoryKind.MEMORY,
                    effective_date=item.effective_date,
                    memory=MemorySummary(
                        id=memory.id,
                        title=memory.payload.title,
                        happened_on=memory.happened_on,
                        created_at=memory.created_at,
                        author=_author(authors, memory.owner_id),
                        capabilities=_capabilities(memory.owner_id, authorization),
                        attachments=[
                            MemoryAttachmentSummary(
                                **_attachment_summary(bound.attachment).model_dump(),
                                position=bound.position,
                            )
                            for bound in galleries.get(memory.id, [])
                        ],
                    ),
                )
            )
        elif item.kind is StoryKind.HEART_MOMENT:
            heart_moment = heart_moments.get(item.id)
            if heart_moment is None:
                continue
            view.append(
                StoryHeartMomentItem(
                    kind=StoryKind.HEART_MOMENT,
                    effective_date=item.effective_date,
                    heart_moment=SharedHeartMomentSummary(
                        id=heart_moment.id,
                        text=heart_moment.payload.text,
                        emotion=heart_moment.payload.emotion,
                        happened_on=heart_moment.happened_on,
                        created_at=heart_moment.created_at,
                        author=_author(authors, heart_moment.owner_id),
                        capabilities=_capabilities(heart_moment.owner_id, authorization),
                        attachment=(
                            _attachment_summary(attachments[heart_moment.attachment_id])
                            if heart_moment.attachment_id in attachments
                            else None
                        ),
                    ),
                )
            )
        else:
            milestone = milestones.get(item.id)
            if milestone is None:
                continue
            view.append(
                StoryMilestoneItem(
                    kind=StoryKind.MILESTONE,
                    effective_date=item.effective_date,
                    milestone=MilestoneSummary(
                        id=milestone.id,
                        title=milestone.payload.title,
                        happened_on=milestone.happened_on,
                        created_at=milestone.created_at,
                        author=_author(authors, milestone.owner_id),
                        capabilities=_capabilities(milestone.owner_id, authorization),
                    ),
                )
            )
    # Variants are built individually and wrapped in the named contract type
    # only at this boundary.
    return [StoryItem(root=entry) for entry in view]


def _load[ResourceT: (Memory, HeartMoment, Milestone)](
    session: DbSession,
    authorization: Authorization,
    model: type[ResourceT],
    ids: list[UUID],
) -> dict[UUID, ResourceT]:
    if not ids:
        return {}
    rows = session.execute(readable(model, authorization).where(model.id.in_(ids))).scalars().all()
    return {row.id: row for row in rows}


def _heart_attachments(
    session: DbSession, heart_moments: Iterable[HeartMoment]
) -> dict[UUID, Attachment]:
    ids = {
        heart_moment.attachment_id
        for heart_moment in heart_moments
        if heart_moment.attachment_id is not None
    }
    if not ids:
        return {}
    rows = session.execute(select(Attachment).where(Attachment.id.in_(ids))).scalars().all()
    return {attachment.id: attachment for attachment in rows}


def _author(authors: dict[UUID, AuthorSummary], owner_id: UUID) -> AuthorSummary:
    author = authors.get(owner_id)
    if author is None:
        raise RuntimeError("Story author disappeared despite foreign key protection.")
    return author
