"""HTTP contract for M2 heart moments."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, Field, field_validator, model_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import (
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
from eimir.api.v1.attachments import AttachmentEntry, AttachmentSummary, OrderedAttachmentSummary
from eimir.attachments.binding import MAX_GALLERY_ATTACHMENTS, BoundAttachment, can_edit_sensitivity
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import ContentVisibility, visibility_of
from eimir.engagement.gentle import record_manual_save
from eimir.heart_moments import media, service
from eimir.heart_moments.location import HeartMomentLocation
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.heart_moments.tags import HeartMomentTags, unique_tags

router = APIRouter(tags=["heart-moments"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


def _validate_gallery(body: HeartMomentCreate | HeartMomentUpdate) -> None:
    if "attachments" not in body.model_fields_set:
        return
    if body.attachments is None:
        raise ValueError("attachments must not be null")
    if body.model_fields_set & {"attachment_id", "attachment_is_sensitive"}:
        raise ValueError("attachments cannot be combined with legacy attachment fields")
    positions = sorted(entry.position for entry in body.attachments)
    if positions != list(range(len(positions))):
        raise ValueError("media positions must be contiguous and start at zero")


def _selection(entries: list[AttachmentEntry] | None) -> media.MediaSelection | None:
    return (
        [
            (entry.attachment_id, entry.is_sensitive)
            for entry in sorted(entries, key=lambda entry: entry.position)
        ]
        if entries is not None
        else None
    )


class HeartMomentCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    audio_title: str = Field(default="", max_length=120)
    audio_speaker_name: str = Field(default="", max_length=80)
    emotion: HeartEmotion
    visibility: ContentVisibility
    happened_on: date
    attachment_id: UUID | None = None
    attachment_is_sensitive: bool | None = Field(default=None, strict=True)
    attachments: list[AttachmentEntry] | None = Field(
        default=None, max_length=MAX_GALLERY_ATTACHMENTS
    )
    selected_cover_attachment_id: UUID | None = None
    tags: HeartMomentTags = Field(default_factory=list)
    place_id: UUID | None = None
    location: HeartMomentLocation | None = None

    _unique_tags = field_validator("tags")(unique_tags)

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        return cleaned

    @model_validator(mode="after")
    def _has_content(self) -> Self:
        _validate_gallery(self)
        if self.place_id is not None and self.location is not None:
            raise ValueError("placeId and location cannot be combined")
        if not self.text and not self.tags and self.attachment_id is None and not self.attachments:
            raise ValueError("a thought, context tag or photo is required")
        if self.attachment_is_sensitive is not None and self.attachment_id is None:
            raise ValueError("attachmentIsSensitive requires an attachment")
        return self


class HeartMomentUpdate(ApiModel):
    """Content update payload.

    ``visibility`` is intentionally absent: changing visibility is a separate
    operation with destructive consequences and must not happen as a side
    effect of a text update.
    """

    model_config = ConfigDict(extra="forbid")

    audio_title: str | None = Field(default=None, max_length=120)
    audio_speaker_name: str | None = Field(default=None, max_length=80)
    text: str | None = None
    emotion: HeartEmotion | None = None
    happened_on: date | None = None
    attachment_id: UUID | None = None
    attachment_is_sensitive: bool | None = Field(default=None, strict=True)
    attachments: list[AttachmentEntry] | None = Field(
        default=None, max_length=MAX_GALLERY_ATTACHMENTS
    )
    selected_cover_attachment_id: UUID | None = None
    tags: HeartMomentTags | None = None
    location: HeartMomentLocation | None = None

    _unique_tags = field_validator("tags")(unique_tags)

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        _validate_gallery(self)
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "text" in self.model_fields_set:
            if self.text is None:
                raise ValueError("text must not be null")
            self.text = self.text.strip()
        if "tags" in self.model_fields_set and self.tags is None:
            raise ValueError("tags must not be null")
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
    audio_title: str = ""
    audio_speaker_name: str = ""
    tags: HeartMomentTags
    location: HeartMomentLocation | None = None
    emotion: HeartEmotion
    visibility: ContentVisibility
    happened_on: date
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities
    attachment: AttachmentSummary | None
    attachments: list[OrderedAttachmentSummary] = Field(default_factory=list)
    selected_cover_attachment_id: UUID | None = None


class HeartMomentPage(ApiModel):
    items: list[HeartMomentDetail]
    next_cursor: str | None
    has_more: bool


def _heart_moment_detail(
    session: DbSession,
    authorization: Authorization,
    heart_moment: HeartMoment,
    author: AuthorSummary | None = None,
    gallery: list[BoundAttachment] | None = None,
) -> HeartMomentDetail:
    if author is None:
        author = resolve_author_summary(
            session, heart_moment.owner_id, resource="Heart moment author"
        )
    visibility = visibility_of(heart_moment.privacy_class)
    attachment = (
        session.get(Attachment, heart_moment.attachment_id)
        if heart_moment.attachment_id is not None
        else None
    )
    entries = (
        gallery
        if gallery is not None
        else media.galleries(session, [heart_moment])[heart_moment.id]
    )
    return HeartMomentDetail(
        id=heart_moment.id,
        space_id=heart_moment.space_id,
        author_id=heart_moment.owner_id,
        text=heart_moment.payload.text,
        location=heart_moment.payload.location,
        audio_title=heart_moment.payload.audio_title,
        audio_speaker_name=heart_moment.payload.audio_speaker_name,
        tags=heart_moment.payload.tags,
        emotion=heart_moment.payload.emotion,
        visibility=visibility,
        happened_on=heart_moment.happened_on,
        version=heart_moment.version,
        created_at=heart_moment.created_at,
        updated_at=heart_moment.updated_at,
        author=author,
        capabilities=story_resource_capabilities(
            heart_moment,
            authorization.account_id,
            can_comment=visibility is ContentVisibility.SHARED,
        ),
        selected_cover_attachment_id=heart_moment.payload.selected_cover_attachment_id,
        attachments=[
            OrderedAttachmentSummary(
                id=entry.attachment.id,
                position=entry.position,
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
                can_edit_sensitivity=can_edit_sensitivity(
                    entry.attachment,
                    account_id=authorization.account_id,
                    parent_owner_id=heart_moment.owner_id,
                ),
            )
            for entry in entries
        ],
        attachment=(
            AttachmentSummary(
                id=attachment.id,
                status="PROCESSING" if attachment.status == "VALIDATING" else attachment.status,
                failure_code=attachment.failure_code if attachment.status == "FAILED" else None,
                media_type=MediaType(attachment.media_type),
                mime_type=attachment.mime_type,
                size=attachment.size,
                width=attachment.width,
                height=attachment.height,
                has_thumbnail=attachment.has_thumbnail,
                duration_seconds=attachment.duration_seconds,
                is_sensitive=attachment.payload.is_sensitive,
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
    authorization: PhotoBindingAuthorization,
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
        audio_title=body.audio_title,
        audio_speaker_name=body.audio_speaker_name,
        location=body.location,
        emotion=body.emotion,
        visibility=body.visibility,
        happened_on=body.happened_on,
        attachment_id=body.attachment_id,
        attachment_is_sensitive=body.attachment_is_sensitive,
        tags=body.tags,
        attachments=_selection(body.attachments),
        selected_cover_attachment_id=body.selected_cover_attachment_id,
        place_id=body.place_id,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
    if result.created:
        record_manual_save(session, authorization)
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
    galleries = media.galleries(session, page.items)
    return HeartMomentPage(
        items=[
            _heart_moment_detail(
                session,
                authorization,
                heart_moment,
                author=authors.get(heart_moment.owner_id),
                gallery=galleries.get(heart_moment.id, []),
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
    authorization: PhotoBindingAuthorization,
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
        audio_title=body.audio_title,
        audio_speaker_name=body.audio_speaker_name,
        location=body.location,
        emotion=body.emotion,
        happened_on=body.happened_on,
        attachment_id=body.attachment_id,
        attachment_is_sensitive=body.attachment_is_sensitive,
        tags=body.tags,
        attachments=_selection(body.attachments),
        selected_cover_attachment_id=body.selected_cover_attachment_id,
    )
    record_manual_save(session, authorization)
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
