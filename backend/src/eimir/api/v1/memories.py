"""HTTP contract for the first M2 runtime slice: Memory CRUD."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, Field, field_validator, model_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.api.v1.attachments import AttachmentSummary
from eimir.attachments import binding
from eimir.attachments.models import MediaType
from eimir.memories import service
from eimir.memories.models import Memory

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

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("body must not be null")
        return self


class MemoryAttachmentEntry(ApiModel):
    model_config = ConfigDict(extra="forbid")

    attachment_id: UUID
    position: int = Field(ge=0)


class MemoryAttachmentSet(ApiModel):
    model_config = ConfigDict(extra="forbid")

    attachments: list[MemoryAttachmentEntry]


class MemoryAttachmentSummary(AttachmentSummary):
    """A bound attachment plus its position in the memory gallery."""

    position: int


class MemoryDetail(ApiModel):
    id: UUID
    space_id: UUID
    author_id: UUID
    title: str
    body: str
    happened_on: date | None
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachments: list[MemoryAttachmentSummary]


class MemoryPage(ApiModel):
    items: list[MemoryDetail]
    next_cursor: str | None
    has_more: bool


def _memory_detail(
    session: DbSession,
    authorization: Authorization,
    memory: Memory,
    author: AuthorSummary | None = None,
) -> MemoryDetail:
    if author is None:
        author = resolve_author_summary(session, memory.owner_id, resource="Memory author")
    is_author = memory.owner_id == authorization.account_id
    bound_attachments = binding.attachments_of_memory(session, memory.id)
    return MemoryDetail(
        id=memory.id,
        space_id=memory.space_id,
        author_id=memory.owner_id,
        title=memory.payload.title,
        body=memory.payload.body,
        happened_on=memory.happened_on,
        version=memory.version,
        created_at=memory.created_at,
        updated_at=memory.updated_at,
        author=author,
        capabilities=ResourceCapabilities(
            can_edit=is_author,
            can_delete=is_author,
            can_comment=True,
        ),
        attachments=[
            MemoryAttachmentSummary(
                id=entry.attachment.id,
                status="READY",
                media_type=MediaType(entry.attachment.media_type),
                mime_type=entry.attachment.mime_type,
                size=entry.attachment.size,
                width=entry.attachment.width,
                height=entry.attachment.height,
                has_thumbnail=entry.attachment.has_thumbnail,
                position=entry.position,
            )
            for entry in bound_attachments
        ],
    )


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
        **problem_responses(401, 404, 409, 422),
    },
)
def create_memory(
    authorization: Authorization,
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
        happened_on=body.happened_on,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
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
) -> MemoryPage:
    page = service.list_memories(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        year=year,
    )
    authors = resolve_author_summaries(session, {memory.owner_id for memory in page.items})
    return MemoryPage(
        items=[
            _memory_detail(session, authorization, memory, author=authors.get(memory.owner_id))
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
    authorization: Authorization,
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
        happened_on=body.happened_on,
    )
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
    authorization: Authorization,
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
    )
    response.headers["ETag"] = etag_for(memory.version)
    return _memory_detail(session, authorization, memory)
