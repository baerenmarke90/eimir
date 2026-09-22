"""HTTP contract for M2 heart moments."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.api.v1.attachments import AttachmentSummary
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import ContentVisibility, visibility_of
from eimir.heart_moments import service
from eimir.heart_moments.models import HeartEmotion, HeartMoment

router = APIRouter(tags=["heart-moments"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class HeartMomentCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    emotion: HeartEmotion
    visibility: ContentVisibility
    happened_on: date
    attachment_id: UUID | None = None

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class HeartMomentUpdate(ApiModel):
    """Content update payload.

    ``visibility`` is intentionally absent: changing visibility is a separate
    operation with destructive consequences and must not happen as a side
    effect of a text update.
    """

    model_config = ConfigDict(extra="forbid")

    text: str | None = None
    emotion: HeartEmotion | None = None
    happened_on: date | None = None
    attachment_id: UUID | None = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "text" in self.model_fields_set:
            if self.text is None or not self.text.strip():
                raise ValueError("text must not be null or blank")
            self.text = self.text.strip()
        if "emotion" in self.model_fields_set and self.emotion is None:
            raise ValueError("emotion must not be null")
        if "happened_on" in self.model_fields_set and self.happened_on is None:
            raise ValueError("happenedOn must not be null")
        return self


class HeartMomentVisibilityChange(ApiModel):
    model_config = ConfigDict(extra="forbid")

    visibility: ContentVisibility


class HeartMomentDetail(ApiModel):
    id: UUID
    space_id: UUID
    author_id: UUID
    text: str
    emotion: HeartEmotion
    visibility: ContentVisibility
    happened_on: date
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachment: AttachmentSummary | None


class HeartMomentPage(ApiModel):
    items: list[HeartMomentDetail]
    next_cursor: str | None
    has_more: bool


def _heart_moment_detail(
    session: DbSession,
    authorization: Authorization,
    heart_moment: HeartMoment,
    author: AuthorSummary | None = None,
) -> HeartMomentDetail:
    if author is None:
        author = resolve_author_summary(
            session, heart_moment.owner_id, resource="Heart moment author"
        )
    is_author = heart_moment.owner_id == authorization.account_id
    visibility = visibility_of(heart_moment.privacy_class)
    attachment = (
        session.get(Attachment, heart_moment.attachment_id)
        if heart_moment.attachment_id is not None
        else None
    )
    return HeartMomentDetail(
        id=heart_moment.id,
        space_id=heart_moment.space_id,
        author_id=heart_moment.owner_id,
        text=heart_moment.payload.text,
        emotion=heart_moment.payload.emotion,
        visibility=visibility,
        happened_on=heart_moment.happened_on,
        version=heart_moment.version,
        created_at=heart_moment.created_at,
        updated_at=heart_moment.updated_at,
        author=author,
        capabilities=ResourceCapabilities(
            can_edit=is_author,
            can_delete=is_author,
            # A private heart moment is not a shared discussion surface.
            # Comments there would only be the owner talking to themselves,
            # and making it shared later would expose those comments.
            can_comment=visibility is ContentVisibility.SHARED,
        ),
        attachment=(
            AttachmentSummary(
                id=attachment.id,
                status="READY",
                media_type=MediaType(attachment.media_type),
                mime_type=attachment.mime_type,
                size=attachment.size,
                width=attachment.width,
                height=attachment.height,
                has_thumbnail=attachment.has_thumbnail,
            )
            if attachment is not None
            else None
        ),
    )


@router.post(
    "/spaces/{spaceId}/heart-moments",
    response_model=HeartMomentDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createHeartMoment",
    responses={
        200: {
            "description": (
                "The request identity (`Idempotency-Key`) was already used for an "
                "equivalent request. The response returns the original HeartMoment "
                "in its current state; no second HeartMoment is created."
            ),
            "headers": ETAG_HEADERS,
            "model": HeartMomentDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def create_heart_moment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: HeartMomentCreate,
    idempotency_key: IdempotencyKey,
) -> HeartMomentDetail:
    result = service.create_heart_moment_once(
        session,
        authorization,
        idempotency_key=idempotency_key,
        text=body.text,
        emotion=body.emotion,
        visibility=body.visibility,
        happened_on=body.happened_on,
        attachment_id=body.attachment_id,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.heart_moment.version)
    return _heart_moment_detail(session, authorization, result.heart_moment)


@router.get(
    "/spaces/{spaceId}/heart-moments",
    response_model=HeartMomentPage,
    operation_id="listHeartMoments",
    responses=problem_responses(400, 401, 404, 422),
)
def list_heart_moments(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    visibility: Annotated[ContentVisibility | None, Query()] = None,
) -> HeartMomentPage:
    page = service.list_heart_moments(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        visibility=visibility,
    )
    authors = resolve_author_summaries(session, {moment.owner_id for moment in page.items})
    return HeartMomentPage(
        items=[
            _heart_moment_detail(
                session, authorization, heart_moment, author=authors.get(heart_moment.owner_id)
            )
            for heart_moment in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}",
    response_model=HeartMomentDetail,
    operation_id="getHeartMoment",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_heart_moment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
) -> HeartMomentDetail:
    heart_moment = service.get_heart_moment(session, authorization, heart_moment_id)
    response.headers["ETag"] = etag_for(heart_moment.version)
    return _heart_moment_detail(session, authorization, heart_moment)


@router.patch(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}",
    response_model=HeartMomentDetail,
    operation_id="updateHeartMoment",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_heart_moment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: HeartMomentUpdate,
    expected_version: IfMatchVersion,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
) -> HeartMomentDetail:
    heart_moment = service.update_heart_moment(
        session,
        authorization,
        heart_moment_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        text=body.text,
        emotion=body.emotion,
        happened_on=body.happened_on,
        attachment_id=body.attachment_id,
    )
    response.headers["ETag"] = etag_for(heart_moment.version)
    return _heart_moment_detail(session, authorization, heart_moment)


@router.patch(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}/visibility",
    response_model=HeartMomentDetail,
    operation_id="changeHeartMomentVisibility",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def change_heart_moment_visibility(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: HeartMomentVisibilityChange,
    expected_version: IfMatchVersion,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
) -> HeartMomentDetail:
    heart_moment = service.change_visibility(
        session,
        authorization,
        heart_moment_id,
        expected_version=expected_version,
        visibility=body.visibility,
    )
    response.headers["ETag"] = etag_for(heart_moment.version)
    return _heart_moment_detail(session, authorization, heart_moment)


@router.delete(
    "/spaces/{spaceId}/heart-moments/{heartMomentId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteHeartMoment",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_heart_moment(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    heart_moment_id: Annotated[str, Path(alias="heartMomentId")],
) -> Response:
    service.delete_heart_moment(
        session,
        authorization,
        heart_moment_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
