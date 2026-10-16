"""HTTP contract for M3 PrivateNote and GiftIdea resources."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, ResourceCapabilities
from eimir.gift_ideas import service as gift_idea_service
from eimir.gift_ideas.models import GiftIdea, GiftIdeaStatus
from eimir.private_notes import service as private_note_service
from eimir.private_notes.models import PrivateNote

router = APIRouter(tags=["private-area"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class PrivateNoteCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    body: str
    pinned: bool = False

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class PrivateNoteUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    body: str | SkipJsonSchema[None] = None
    pinned: bool | SkipJsonSchema[None] = None

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
        if "pinned" in self.model_fields_set and self.pinned is None:
            raise ValueError("pinned must not be null")
        return self


class PrivateNoteDetail(ApiModel):
    id: UUID
    space_id: UUID
    owner_id: UUID
    title: str
    body: str
    pinned: bool
    version: int
    created_at: datetime
    updated_at: datetime
    capabilities: ResourceCapabilities


class PrivateNotePage(ApiModel):
    items: list[PrivateNoteDetail]
    next_cursor: str | None
    has_more: bool


class GiftIdeaCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    recipient: str | None = None
    occasion: str | None = None
    target_on: date | None = None
    price_text: str | None = None
    url: str | None = None
    pinned: bool = False

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class GiftIdeaUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | None = None
    recipient: str | None = None
    occasion: str | None = None
    target_on: date | None = None
    price_text: str | None = None
    url: str | None = None
    status: GiftIdeaStatus | SkipJsonSchema[None] = None
    pinned: bool | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status must not be null")
        if "pinned" in self.model_fields_set and self.pinned is None:
            raise ValueError("pinned must not be null")
        return self


class GiftIdeaDetail(ApiModel):
    id: UUID
    space_id: UUID
    owner_id: UUID
    title: str
    description: str | None
    recipient: str | None
    occasion: str | None
    target_on: date | None
    price_text: str | None
    url: str | None
    status: GiftIdeaStatus
    pinned: bool
    version: int
    created_at: datetime
    updated_at: datetime
    capabilities: ResourceCapabilities


class GiftIdeaPage(ApiModel):
    items: list[GiftIdeaDetail]
    next_cursor: str | None
    has_more: bool


def _capabilities() -> ResourceCapabilities:
    return ResourceCapabilities(can_edit=True, can_delete=True, can_comment=False)


def private_note_detail(note: PrivateNote) -> PrivateNoteDetail:
    return PrivateNoteDetail(
        id=note.id,
        space_id=note.space_id,
        owner_id=note.owner_id,
        title=note.payload.title,
        body=note.payload.body,
        pinned=note.pinned,
        version=note.version,
        created_at=note.created_at,
        updated_at=note.updated_at,
        capabilities=_capabilities(),
    )


def gift_idea_detail(idea: GiftIdea) -> GiftIdeaDetail:
    return GiftIdeaDetail(
        id=idea.id,
        space_id=idea.space_id,
        owner_id=idea.owner_id,
        title=idea.payload.title,
        description=idea.payload.description,
        recipient=idea.payload.recipient,
        occasion=idea.payload.occasion,
        target_on=idea.payload.target_on,
        price_text=idea.payload.price_text,
        url=idea.payload.url,
        status=GiftIdeaStatus(idea.status),
        pinned=idea.pinned,
        version=idea.version,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
        capabilities=_capabilities(),
    )


@router.post(
    "/spaces/{spaceId}/private/notes",
    response_model=PrivateNoteDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPrivateNote",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_private_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateNoteCreate,
) -> PrivateNoteDetail:
    note = private_note_service.create_note(
        session,
        authorization,
        title=body.title,
        body=body.body,
        pinned=body.pinned,
    )
    response.headers["ETag"] = etag_for(note.version)
    return private_note_detail(note)


@router.get(
    "/spaces/{spaceId}/private/notes",
    response_model=PrivateNotePage,
    operation_id="listPrivateNotes",
    responses=problem_responses(400, 401, 404, 422),
)
def list_private_notes(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> PrivateNotePage:
    page = private_note_service.list_notes(session, authorization, cursor=cursor, limit=limit)
    return PrivateNotePage(
        items=[private_note_detail(note) for note in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/private/notes/{noteId}",
    response_model=PrivateNoteDetail,
    operation_id="getPrivateNote",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_private_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    note_id: Annotated[str, Path(alias="noteId")],
) -> PrivateNoteDetail:
    note = private_note_service.get_note(session, authorization, note_id)
    response.headers["ETag"] = etag_for(note.version)
    return private_note_detail(note)


@router.patch(
    "/spaces/{spaceId}/private/notes/{noteId}",
    response_model=PrivateNoteDetail,
    operation_id="updatePrivateNote",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_private_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateNoteUpdate,
    expected_version: IfMatchVersion,
    note_id: Annotated[str, Path(alias="noteId")],
) -> PrivateNoteDetail:
    note = private_note_service.update_note(
        session,
        authorization,
        note_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        body=body.body,
        pinned=body.pinned,
    )
    response.headers["ETag"] = etag_for(note.version)
    return private_note_detail(note)


@router.delete(
    "/spaces/{spaceId}/private/notes/{noteId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deletePrivateNote",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_private_note(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    note_id: Annotated[str, Path(alias="noteId")],
) -> Response:
    private_note_service.delete_note(
        session,
        authorization,
        note_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/spaces/{spaceId}/private/gift-ideas",
    response_model=GiftIdeaDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createGiftIdea",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_gift_idea(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: GiftIdeaCreate,
) -> GiftIdeaDetail:
    idea = gift_idea_service.create_idea(
        session,
        authorization,
        title=body.title,
        description=body.description,
        recipient=body.recipient,
        occasion=body.occasion,
        target_on=body.target_on,
        price_text=body.price_text,
        url=body.url,
        pinned=body.pinned,
    )
    response.headers["ETag"] = etag_for(idea.version)
    return gift_idea_detail(idea)


@router.get(
    "/spaces/{spaceId}/private/gift-ideas",
    response_model=GiftIdeaPage,
    operation_id="listGiftIdeas",
    responses=problem_responses(400, 401, 404, 422),
)
def list_gift_ideas(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> GiftIdeaPage:
    page = gift_idea_service.list_ideas(session, authorization, cursor=cursor, limit=limit)
    return GiftIdeaPage(
        items=[gift_idea_detail(idea) for idea in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
    response_model=GiftIdeaDetail,
    operation_id="getGiftIdea",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_gift_idea(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    idea_id: Annotated[str, Path(alias="giftIdeaId")],
) -> GiftIdeaDetail:
    idea = gift_idea_service.get_idea(session, authorization, idea_id)
    response.headers["ETag"] = etag_for(idea.version)
    return gift_idea_detail(idea)


@router.patch(
    "/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
    response_model=GiftIdeaDetail,
    operation_id="updateGiftIdea",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_gift_idea(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: GiftIdeaUpdate,
    expected_version: IfMatchVersion,
    idea_id: Annotated[str, Path(alias="giftIdeaId")],
) -> GiftIdeaDetail:
    idea = gift_idea_service.update_idea(
        session,
        authorization,
        idea_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        description=body.description,
        recipient=body.recipient,
        occasion=body.occasion,
        target_on=body.target_on,
        price_text=body.price_text,
        url=body.url,
        status=body.status,
        pinned=body.pinned,
    )
    response.headers["ETag"] = etag_for(idea.version)
    return gift_idea_detail(idea)


@router.delete(
    "/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteGiftIdea",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_gift_idea(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    idea_id: Annotated[str, Path(alias="giftIdeaId")],
) -> Response:
    gift_idea_service.delete_idea(
        session,
        authorization,
        idea_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
