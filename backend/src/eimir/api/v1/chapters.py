"""HTTP contract for shared M3 Chapters."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.chapters import service
from eimir.chapters.models import Chapter

router = APIRouter(tags=["chapters"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class ChapterCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | SkipJsonSchema[None] = None
    start_on: date | SkipJsonSchema[None] = None
    end_on: date | SkipJsonSchema[None] = None
    place_id: UUID | SkipJsonSchema[None] = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("description", "start_on", "end_on", "place_id")
    @classmethod
    def _optional_values_not_null(cls, value: object | None) -> object:
        if value is None:
            raise ValueError("must not be null")
        return value


class ChapterUpdate(ApiModel):
    """Partial correction of Chapter metadata and its canonical Place reference."""

    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | None = None
    start_on: date | None = None
    end_on: date | None = None
    place_id: UUID | None = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        return self


class ChapterDetail(ApiModel):
    id: UUID
    space_id: UUID
    created_by: UUID
    title: str
    description: str | None
    start_on: date | None
    end_on: date | None
    place_id: UUID | None
    version: int
    created_at: datetime
    updated_at: datetime
    creator: AuthorSummary
    capabilities: ResourceCapabilities


class ChapterPage(ApiModel):
    items: list[ChapterDetail]
    next_cursor: str | None
    has_more: bool


def chapter_detail(
    session: DbSession,
    chapter: Chapter,
    creator: AuthorSummary | None = None,
) -> ChapterDetail:
    if creator is None:
        creator = resolve_author_summary(session, chapter.owner_id, resource="Chapter creator")
    return ChapterDetail(
        id=chapter.id,
        space_id=chapter.space_id,
        created_by=chapter.owner_id,
        title=chapter.payload.title,
        description=chapter.payload.description,
        start_on=chapter.start_on,
        end_on=chapter.end_on,
        place_id=chapter.place_id,
        version=chapter.version,
        created_at=chapter.created_at,
        updated_at=chapter.updated_at,
        creator=creator,
        capabilities=ResourceCapabilities(
            can_edit=True,
            can_delete=True,
            can_comment=False,
        ),
    )


@router.post(
    "/spaces/{spaceId}/chapters",
    response_model=ChapterDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createChapter",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_chapter(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ChapterCreate,
) -> ChapterDetail:
    chapter = service.create_chapter(
        session,
        authorization,
        title=body.title,
        description=body.description,
        start_on=body.start_on,
        end_on=body.end_on,
        place_id=body.place_id,
    )
    response.headers["ETag"] = etag_for(chapter.version)
    return chapter_detail(session, chapter)


@router.get(
    "/spaces/{spaceId}/chapters",
    response_model=ChapterPage,
    operation_id="listChapters",
    responses=problem_responses(400, 401, 404, 422),
)
def list_chapters(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> ChapterPage:
    page = service.list_chapters(session, authorization, cursor=cursor, limit=limit)
    creators = resolve_author_summaries(session, {chapter.owner_id for chapter in page.items})
    return ChapterPage(
        items=[
            chapter_detail(session, chapter, creator=creators.get(chapter.owner_id))
            for chapter in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/chapters/{chapterId}",
    response_model=ChapterDetail,
    operation_id="getChapter",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_chapter(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    chapter_id: Annotated[str, Path(alias="chapterId")],
) -> ChapterDetail:
    chapter = service.get_chapter(session, authorization, chapter_id)
    response.headers["ETag"] = etag_for(chapter.version)
    return chapter_detail(session, chapter)


@router.patch(
    "/spaces/{spaceId}/chapters/{chapterId}",
    response_model=ChapterDetail,
    operation_id="updateChapter",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_chapter(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ChapterUpdate,
    expected_version: IfMatchVersion,
    chapter_id: Annotated[str, Path(alias="chapterId")],
) -> ChapterDetail:
    chapter = service.update_chapter(
        session,
        authorization,
        chapter_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        description=body.description,
        start_on=body.start_on,
        end_on=body.end_on,
        place_id=body.place_id,
    )
    response.headers["ETag"] = etag_for(chapter.version)
    return chapter_detail(session, chapter)


@router.delete(
    "/spaces/{spaceId}/chapters/{chapterId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteChapter",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_chapter(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    chapter_id: Annotated[str, Path(alias="chapterId")],
) -> Response:
    service.delete_chapter(
        session,
        authorization,
        chapter_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
