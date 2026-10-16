"""HTTP contract for M2 comments."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel, AuthorSummary
from eimir.comments import service
from eimir.comments.models import Comment, CommentTarget

router = APIRouter(tags=["comments"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class CommentCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    body: str

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class CommentUpdate(CommentCreate):
    pass


class CommentDetail(ApiModel):
    id: UUID
    space_id: UUID
    author_id: UUID
    body: str
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary


class CommentPage(ApiModel):
    items: list[CommentDetail]
    next_cursor: str | None
    has_more: bool


def _detail(
    session: DbSession,
    comment: Comment,
    author: AuthorSummary | None = None,
) -> CommentDetail:
    if author is None:
        author = resolve_author_summary(session, comment.owner_id, resource="Comment author")
    return CommentDetail(
        id=comment.id,
        space_id=comment.space_id,
        author_id=comment.owner_id,
        body=comment.payload.body,
        version=comment.version,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author=author,
    )


_CREATE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": (
            "The request identity (`Idempotency-Key`) was already used for an equivalent "
            "request. The response returns the original Comment in its current state; no "
            "second Comment is created and the partner is not notified again."
        ),
        "headers": ETAG_HEADERS,
        "model": CommentDetail,
    },
    201: {"headers": ETAG_HEADERS},
    **problem_responses(401, 404, 409, 422),
}


def _create(
    session: DbSession,
    authorization: Authorization,
    response: Response,
    body: CommentCreate,
    target_type: CommentTarget,
    target_id: str,
    idempotency_key: UUID | None,
) -> CommentDetail:
    result = service.create_comment_once(
        session,
        authorization,
        idempotency_key=idempotency_key,
        target_type=target_type,
        target_id=target_id,
        body=body.body,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.comment.version)
    return _detail(session, result.comment)


def _list(
    session: DbSession,
    authorization: Authorization,
    target_type: CommentTarget,
    target_id: str,
    cursor: str | None,
    limit: int,
) -> CommentPage:
    page = service.list_comments(
        session,
        authorization,
        target_type=target_type,
        target_id=target_id,
        cursor=cursor,
        limit=limit,
    )
    authors = resolve_author_summaries(session, {comment.owner_id for comment in page.items})
    return CommentPage(
        items=[
            _detail(session, comment, author=authors.get(comment.owner_id))
            for comment in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.post(
    "/spaces/{spaceId}/memories/{memoryId}/comments",
    response_model=CommentDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMemoryComment",
    responses=_CREATE_RESPONSES,
)
def create_memory_comment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CommentCreate,
    memory_id: Annotated[str, Path(alias="memoryId")],
    idempotency_key: IdempotencyKey,
) -> CommentDetail:
    return _create(
        session, authorization, response, body, CommentTarget.MEMORY, memory_id, idempotency_key
    )


@router.get(
    "/spaces/{spaceId}/memories/{memoryId}/comments",
    response_model=CommentPage,
    operation_id="listMemoryComments",
    responses=problem_responses(400, 401, 404, 422),
)
def list_memory_comments(
    authorization: Authorization,
    session: DbSession,
    memory_id: Annotated[str, Path(alias="memoryId")],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CommentPage:
    return _list(session, authorization, CommentTarget.MEMORY, memory_id, cursor, limit)


@router.post(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
    response_model=CommentDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createHeartMomentComment",
    responses=_CREATE_RESPONSES,
)
def create_heart_moment_comment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CommentCreate,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
    idempotency_key: IdempotencyKey,
) -> CommentDetail:
    return _create(
        session,
        authorization,
        response,
        body,
        CommentTarget.HEART_MOMENT,
        heart_moment_id,
        idempotency_key,
    )


@router.get(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
    response_model=CommentPage,
    operation_id="listHeartMomentComments",
    responses=problem_responses(400, 401, 404, 422),
)
def list_heart_moment_comments(
    authorization: Authorization,
    session: DbSession,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CommentPage:
    return _list(
        session,
        authorization,
        CommentTarget.HEART_MOMENT,
        heart_moment_id,
        cursor,
        limit,
    )


@router.post(
    "/spaces/{spaceId}/milestones/{milestoneId}/comments",
    response_model=CommentDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMilestoneComment",
    responses=_CREATE_RESPONSES,
)
def create_milestone_comment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CommentCreate,
    milestone_id: Annotated[str, Path(alias="milestoneId")],
    idempotency_key: IdempotencyKey,
) -> CommentDetail:
    return _create(
        session,
        authorization,
        response,
        body,
        CommentTarget.MILESTONE,
        milestone_id,
        idempotency_key,
    )


@router.get(
    "/spaces/{spaceId}/milestones/{milestoneId}/comments",
    response_model=CommentPage,
    operation_id="listMilestoneComments",
    responses=problem_responses(400, 401, 404, 422),
)
def list_milestone_comments(
    authorization: Authorization,
    session: DbSession,
    milestone_id: Annotated[str, Path(alias="milestoneId")],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CommentPage:
    return _list(
        session,
        authorization,
        CommentTarget.MILESTONE,
        milestone_id,
        cursor,
        limit,
    )


@router.patch(
    "/spaces/{spaceId}/comments/{commentId}",
    response_model=CommentDetail,
    operation_id="updateComment",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_comment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CommentUpdate,
    expected_version: IfMatchVersion,
    comment_id: Annotated[str, Path(alias="commentId")],
) -> CommentDetail:
    comment = service.update_comment(
        session,
        authorization,
        comment_id,
        expected_version=expected_version,
        body=body.body,
    )
    response.headers["ETag"] = etag_for(comment.version)
    return _detail(session, comment)


@router.delete(
    "/spaces/{spaceId}/comments/{commentId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteComment",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_comment(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    comment_id: Annotated[str, Path(alias="commentId")],
) -> Response:
    service.delete_comment(
        session,
        authorization,
        comment_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
