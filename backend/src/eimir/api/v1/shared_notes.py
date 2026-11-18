"""HTTP contract for shared notes (#1969)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, Field, model_validator

from eimir.api.authors import resolve_author_summaries
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.shared_notes import service
from eimir.shared_notes.models import BODY_MAX_LENGTH, TITLE_MAX_LENGTH, SharedNote

router = APIRouter(tags=["shared-notes"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class SharedNoteCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    # Both are optional individually; the service requires at least one of them.
    title: Annotated[str | None, Field(max_length=TITLE_MAX_LENGTH * 2)] = None
    body: Annotated[str | None, Field(max_length=BODY_MAX_LENGTH * 2)] = None
    pinned: bool = False


class SharedNoteUpdate(ApiModel):
    """Partial text update. Pinning is a separate state, see ``SharedNotePresentation``."""

    model_config = ConfigDict(extra="forbid")

    title: Annotated[str | None, Field(max_length=TITLE_MAX_LENGTH * 2)] = None
    body: Annotated[str | None, Field(max_length=BODY_MAX_LENGTH * 2)] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        return self


class SharedNotePresentation(ApiModel):
    """Whether a note is pinned (overview and Wir) and whether Wir hides its excerpt."""

    model_config = ConfigDict(extra="forbid")

    pinned: bool | None = None
    wir_title_only: bool | None = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "pinned" in self.model_fields_set and self.pinned is None:
            raise ValueError("pinned must not be null")
        if "wir_title_only" in self.model_fields_set and self.wir_title_only is None:
            raise ValueError("wirTitleOnly must not be null")
        return self


class SharedNoteDetail(ApiModel):
    id: UUID
    space_id: UUID
    created_by: UUID
    title: str
    body: str
    pinned: bool
    wir_title_only: bool
    version: int
    created_at: datetime
    # When and by whom the text last changed; pinning is not an edit.
    edited_at: datetime
    edited_by: UUID | None = None
    creator: AuthorSummary
    editor: AuthorSummary | None = None
    capabilities: ResourceCapabilities


class SharedNotePage(ApiModel):
    items: list[SharedNoteDetail]
    next_cursor: str | None
    has_more: bool


def shared_note_details(session: DbSession, notes: list[SharedNote]) -> list[SharedNoteDetail]:
    """Resolve authors in one batch for any canonical presentation of notes."""
    account_ids = {note.owner_id for note in notes}
    account_ids.update(note.edited_by for note in notes if note.edited_by is not None)
    authors = resolve_author_summaries(session, account_ids)
    return [
        SharedNoteDetail(
            id=note.id,
            space_id=note.space_id,
            created_by=note.owner_id,
            title=note.payload.title,
            body=note.payload.body,
            pinned=note.pinned,
            wir_title_only=note.wir_title_only,
            version=note.version,
            created_at=note.created_at,
            edited_at=note.edited_at,
            edited_by=note.edited_by,
            creator=authors[note.owner_id],
            editor=authors.get(note.edited_by) if note.edited_by is not None else None,
            capabilities=ResourceCapabilities(can_edit=True, can_delete=True, can_comment=False),
        )
        for note in notes
    ]


def shared_note_detail(session: DbSession, note: SharedNote) -> SharedNoteDetail:
    return shared_note_details(session, [note])[0]


@router.post(
    "/spaces/{spaceId}/shared-notes",
    response_model=SharedNoteDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSharedNote",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_shared_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: SharedNoteCreate,
) -> SharedNoteDetail:
    note = service.create_note(
        session, authorization, title=body.title, body=body.body, pinned=body.pinned
    )
    response.headers["ETag"] = etag_for(note.version)
    return shared_note_detail(session, note)


@router.get(
    "/spaces/{spaceId}/shared-notes",
    response_model=SharedNotePage,
    operation_id="listSharedNotes",
    responses=problem_responses(400, 401, 404, 422),
)
def list_shared_notes(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    pinned: Annotated[
        bool | None,
        Query(description="Return only pinned (true) or only unpinned (false) notes."),
    ] = None,
    ids: Annotated[
        list[UUID] | None,
        Query(
            max_length=50,
            description="Return only these notes, so several known notes need one request.",
        ),
    ] = None,
) -> SharedNotePage:
    page = service.list_notes(
        session, authorization, cursor=cursor, limit=limit, pinned=pinned, ids=ids
    )
    return SharedNotePage(
        items=shared_note_details(session, page.items),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/shared-notes/{sharedNoteId}",
    response_model=SharedNoteDetail,
    operation_id="getSharedNote",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_shared_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> SharedNoteDetail:
    note = service.get_note(session, authorization, note_id)
    response.headers["ETag"] = etag_for(note.version)
    return shared_note_detail(session, note)


@router.patch(
    "/spaces/{spaceId}/shared-notes/{sharedNoteId}",
    response_model=SharedNoteDetail,
    operation_id="updateSharedNote",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_shared_note(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: SharedNoteUpdate,
    expected_version: IfMatchVersion,
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> SharedNoteDetail:
    note = service.update_note(
        session,
        authorization,
        note_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        body=body.body,
    )
    response.headers["ETag"] = etag_for(note.version)
    return shared_note_detail(session, note)


@router.put(
    "/spaces/{spaceId}/shared-notes/{sharedNoteId}/presentation",
    response_model=SharedNoteDetail,
    operation_id="setSharedNotePresentation",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def set_shared_note_presentation(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: SharedNotePresentation,
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> SharedNoteDetail:
    note = service.set_presentation(
        session,
        authorization,
        note_id,
        pinned=body.pinned,
        wir_title_only=body.wir_title_only,
    )
    response.headers["ETag"] = etag_for(note.version)
    return shared_note_detail(session, note)


@router.delete(
    "/spaces/{spaceId}/shared-notes/{sharedNoteId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteSharedNote",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_shared_note(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    note_id: Annotated[str, Path(alias="sharedNoteId")],
) -> Response:
    service.delete_note(session, authorization, note_id, expected_version=expected_version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
