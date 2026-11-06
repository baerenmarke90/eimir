"""HTTP contract for the first M2 runtime slice: Memory CRUD."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, Field, field_validator, model_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import (
    AccountBoundAuthorization,
    Authorization,
    DbSession,
    PhotoBindingAuthorization,
)
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import (
    ApiModel,
    AuthorSummary,
    ResourceCapabilities,
    story_resource_capabilities,
)
from eimir.api.v1.attachments import AttachmentEntry, OrderedAttachmentSummary
from eimir.attachments import binding
from eimir.attachments.models import MediaType
from eimir.domain.experiences import ExperienceKind
from eimir.engagement.gentle import record_manual_save
from eimir.memories import experiences, service
from eimir.memories import places as memory_places
from eimir.memories.models import Memory, PhotoReaction
from eimir.memories.tags import MemoryTags, unique_tags

router = APIRouter(tags=["memories"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class MemoryCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    body: str = ""
    happened_on: date | None = None
    happened_until: date | None = None
    tags: MemoryTags = Field(default_factory=list)
    place_id: UUID | None = None
    place_ids: list[UUID] | None = Field(default=None, max_length=20)
    experience_kind: ExperienceKind | None = None
    experience_reply_to: UUID | None = None

    _unique_tags = field_validator("tags")(unique_tags)

    @model_validator(mode="after")
    def _validate_places(self) -> Self:
        if "place_ids" in self.model_fields_set:
            if self.place_ids is None or "place_id" in self.model_fields_set:
                raise ValueError("placeIds requires a list and cannot be combined with placeId")
            memory_places.validate(self.place_ids)
        return self

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class MemoryUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    body: str | None = None
    happened_on: date | None = None
    happened_until: date | None = None
    place_ids: list[UUID] | None = Field(default=None, max_length=20)
    expected_place_ids: list[UUID] | None = Field(default=None, max_length=20)
    tags: MemoryTags | None = None

    _unique_tags = field_validator("tags")(unique_tags)

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if "place_ids" in self.model_fields_set:
            if self.place_ids is None:
                raise ValueError("placeIds must not be null")
            if self.expected_place_ids is None:
                raise ValueError("expectedPlaceIds is required when replacing places")
            memory_places.validate(self.place_ids)
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("body must not be null")
        if "tags" in self.model_fields_set and self.tags is None:
            raise ValueError("tags must not be null")
        return self


class MemoryAttachmentEntry(AttachmentEntry):
    pass


class MemoryAttachmentSet(ApiModel):
    model_config = ConfigDict(extra="forbid")

    attachments: list[MemoryAttachmentEntry]
    selected_cover_attachment_id: UUID | None = None


class PhotoReactionSummary(ApiModel):
    reaction: PhotoReaction
    count: int
    own: bool


class PhotoReactionSet(ApiModel):
    model_config = ConfigDict(extra="forbid")

    reaction: PhotoReaction | None


class MemoryAttachmentSummary(OrderedAttachmentSummary):
    """A bound attachment plus its position in the memory gallery."""

    reactions: list[PhotoReactionSummary] = Field(default_factory=list)


class ExperienceAnswer(ApiModel):
    id: UUID
    body: str
    author: AuthorSummary
    version: int
    capabilities: ResourceCapabilities
    attachments: list[MemoryAttachmentSummary] = Field(default_factory=list)


class MemoryDetail(ApiModel):
    id: UUID
    space_id: UUID
    author_id: UUID
    title: str
    body: str
    tags: MemoryTags
    happened_on: date | None
    happened_until: date | None = None
    selected_cover_attachment_id: UUID | None = None
    place_ids: list[UUID] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachments: list[MemoryAttachmentSummary]
    experience_kind: ExperienceKind | None = None
    experience_root_id: UUID | None = None
    experience_answers: list[ExperienceAnswer] = Field(default_factory=list)


class MemoryPage(ApiModel):
    items: list[MemoryDetail]
    next_cursor: str | None
    has_more: bool


def _memory_attachments(
    authorization: Authorization, memory: Memory, bound_attachments: list[binding.BoundAttachment]
) -> list[MemoryAttachmentSummary]:
    return [
        MemoryAttachmentSummary(
            id=entry.attachment.id,
            status="PROCESSING"
            if entry.attachment.status == "VALIDATING"
            else entry.attachment.status,
            failure_code=entry.attachment.failure_code
            if entry.attachment.status == "FAILED"
            else None,
            media_type=MediaType(entry.attachment.media_type),
            mime_type=entry.attachment.mime_type,
            size=entry.attachment.size,
            width=entry.attachment.width,
            height=entry.attachment.height,
            has_thumbnail=entry.attachment.has_thumbnail,
            duration_seconds=entry.attachment.duration_seconds,
            is_sensitive=entry.attachment.payload.is_sensitive,
            can_edit_sensitivity=(
                (memory.experience_kind is None and entry.attachment.media_type == "IMAGE")
                or binding.can_edit_sensitivity(
                    entry.attachment,
                    account_id=authorization.account_id,
                    parent_owner_id=memory.owner_id,
                )
            ),
            position=entry.position,
            reactions=[
                PhotoReactionSummary(
                    reaction=choice,
                    count=sum(
                        item.attachment_id == entry.attachment.id and item.reaction == choice
                        for item in memory.payload.photo_reactions
                    ),
                    own=any(
                        item.attachment_id == entry.attachment.id
                        and item.reaction == choice
                        and item.account_id == authorization.account_id
                        for item in memory.payload.photo_reactions
                    ),
                )
                for choice in PhotoReaction
                if any(
                    item.attachment_id == entry.attachment.id and item.reaction == choice
                    for item in memory.payload.photo_reactions
                )
            ],
        )
        for entry in bound_attachments
    ]


def project_experience_answers(
    session: DbSession, authorization: Authorization, memories: list[Memory]
) -> dict[UUID, list[ExperienceAnswer]]:
    groups = experiences.responses(session, authorization, memories)
    entries = [entry for group in groups.values() for entry in group]
    if not entries:
        return {}
    authors = resolve_author_summaries(session, {entry.owner_id for entry in entries})
    galleries = binding.attachments_of_memories(session, [entry.id for entry in entries])
    return {
        root: [
            ExperienceAnswer(
                id=entry.id,
                body=entry.payload.body,
                author=authors[entry.owner_id],
                version=entry.version,
                capabilities=story_resource_capabilities(entry, authorization.account_id),
                attachments=_memory_attachments(authorization, entry, galleries.get(entry.id, [])),
            )
            for entry in group
        ]
        for root, group in groups.items()
    }


def _memory_detail(
    session: DbSession,
    authorization: Authorization,
    memory: Memory,
    author: AuthorSummary | None = None,
    answers: dict[UUID, list[ExperienceAnswer]] | None = None,
) -> MemoryDetail:
    if author is None:
        author = resolve_author_summary(session, memory.owner_id, resource="Memory author")
    bound_attachments = binding.attachments_of_memory(session, memory.id)
    return MemoryDetail(
        id=memory.id,
        space_id=memory.space_id,
        author_id=memory.owner_id,
        title=memory.payload.title,
        body=memory.payload.body,
        experience_kind=ExperienceKind(memory.experience_kind)
        if memory.experience_kind is not None
        else None,
        tags=memory.payload.tags,
        happened_on=memory.happened_on,
        happened_until=memory.happened_until,
        selected_cover_attachment_id=memory.payload.selected_cover_attachment_id,
        place_ids=memory_places.identifiers(session, memory),
        version=memory.version,
        created_at=memory.created_at,
        updated_at=memory.updated_at,
        author=author,
        capabilities=story_resource_capabilities(
            memory, authorization.account_id, can_comment=True
        ),
        experience_root_id=memory.experience_root_id,
        experience_answers=(
            answers
            if answers is not None
            else project_experience_answers(session, authorization, [memory])
        ).get(memory.experience_root_id or memory.id, []),
        attachments=_memory_attachments(authorization, memory, bound_attachments),
    )


@router.put(
    "/spaces/{spaceId}/memories/{memoryId}/attachments/{attachmentId}/reaction",
    response_model=MemoryDetail,
    operation_id="setMemoryPhotoReaction",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def set_memory_photo_reaction(
    authorization: PhotoBindingAuthorization,
    session: DbSession,
    response: Response,
    body: PhotoReactionSet,
    memory_id: Annotated[str, Path(alias="memoryId")],
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> MemoryDetail:
    """Set or remove the caller's preset photo reaction; retries are idempotent."""
    memory = service.set_photo_reaction(
        session, authorization, memory_id, attachment_id, body.reaction
    )
    response.headers["ETag"] = etag_for(memory.version)
    return _memory_detail(session, authorization, memory)


@router.post(
    "/spaces/{spaceId}/memories",
    response_model=MemoryDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMemory",
    responses={
        200: {
            "description": (
                "The request identity (`Idempotency-Key`) was already used for an equivalent "
                "request. The response returns the original Memory in its current state; no "
                "second Memory is created."
            ),
            "headers": ETAG_HEADERS,
            "model": MemoryDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def create_memory(
    authorization: AccountBoundAuthorization,
    session: DbSession,
    response: Response,
    body: MemoryCreate,
    idempotency_key: IdempotencyKey,
) -> MemoryDetail:
    """Create a Memory.

    Send an `Idempotency-Key` to make the save reconcilable after a lost
    response: the identical request repeated with the same key returns the
    original Memory (`200`); the same key with a different payload is a `409`
    (`IDEMPOTENCY_KEY_REUSED`); if the original Memory was deleted meanwhile the
    answer is `404` (`MEMORY_CREATE_RESULT_DELETED`) and nothing is recreated.
    """
    result = service.create_memory_once(
        session,
        authorization,
        idempotency_key=idempotency_key,
        title=body.title,
        body=body.body,
        tags=body.tags,
        place_id=body.place_id,
        experience_kind=body.experience_kind,
        experience_reply_to=body.experience_reply_to,
        happened_on=body.happened_on,
        happened_until=body.happened_until,
        place_ids=body.place_ids,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
    if result.created:
        record_manual_save(session, authorization)
    response.headers["ETag"] = etag_for(result.memory.version)
    return _memory_detail(session, authorization, result.memory)


@router.get(
    "/spaces/{spaceId}/memories",
    response_model=MemoryPage,
    operation_id="listMemories",
    responses=problem_responses(400, 401, 404, 422),
)
def list_memories(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    experience_kind: Annotated[ExperienceKind | None, Query(alias="experienceKind")] = None,
) -> MemoryPage:
    page = service.list_memories(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        year=year,
        experience_kind=experience_kind,
    )
    authors = resolve_author_summaries(session, {memory.owner_id for memory in page.items})
    answers = project_experience_answers(session, authorization, page.items)
    return MemoryPage(
        items=[
            _memory_detail(
                session, authorization, memory, author=authors.get(memory.owner_id), answers=answers
            )
            for memory in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/memories/{memoryId}",
    response_model=MemoryDetail,
    operation_id="getMemory",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_memory(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    memory_id: Annotated[str, Path(alias="memoryId")],
) -> MemoryDetail:
    memory = service.get_memory(session, authorization, memory_id)
    response.headers["ETag"] = etag_for(memory.version)
    return _memory_detail(session, authorization, memory)


@router.patch(
    "/spaces/{spaceId}/memories/{memoryId}",
    response_model=MemoryDetail,
    operation_id="updateMemory",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_memory(
    authorization: AccountBoundAuthorization,
    session: DbSession,
    response: Response,
    body: MemoryUpdate,
    expected_version: IfMatchVersion,
    memory_id: Annotated[str, Path(alias="memoryId")],
) -> MemoryDetail:
    memory = service.update_memory(
        session,
        authorization,
        memory_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        body=body.body,
        tags=body.tags,
        happened_on=body.happened_on,
        happened_until=body.happened_until,
        place_ids=body.place_ids,
        expected_place_ids=body.expected_place_ids,
    )
    record_manual_save(session, authorization)
    response.headers["ETag"] = etag_for(memory.version)
    return _memory_detail(session, authorization, memory)


@router.delete(
    "/spaces/{spaceId}/memories/{memoryId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteMemory",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_memory(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    memory_id: Annotated[str, Path(alias="memoryId")],
) -> Response:
    service.delete_memory(
        session,
        authorization,
        memory_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/spaces/{spaceId}/memories/{memoryId}/attachments",
    response_model=MemoryDetail,
    operation_id="replaceMemoryAttachments",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def replace_memory_attachments(
    authorization: PhotoBindingAuthorization,
    session: DbSession,
    response: Response,
    body: MemoryAttachmentSet,
    expected_version: IfMatchVersion,
    memory_id: Annotated[str, Path(alias="memoryId")],
) -> MemoryDetail:
    """Replace the attachment set and ordering in one operation.

    This is a PUT rather than an add/remove sequence: the client submits the
    state it observed, while ``If-Match`` verifies that state is still current.
    """
    memory = service.replace_attachments(
        session,
        authorization,
        memory_id,
        expected_version=expected_version,
        entries=[(entry.attachment_id, entry.position) for entry in body.attachments],
        sensitivity={entry.attachment_id: entry.is_sensitive for entry in body.attachments},
        selected_cover_attachment_id=body.selected_cover_attachment_id,
        cover_selection_supplied="selected_cover_attachment_id" in body.model_fields_set,
    )
    response.headers["ETag"] = etag_for(memory.version)
    return _memory_detail(session, authorization, memory)
