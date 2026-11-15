"""Video availability and narrowly scoped, live-authorized playback access."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response

from eimir.api.deps import Authorization, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments import playback, service
from eimir.attachments.content import content_response
from eimir.attachments.limits import (
    VIDEO_MAX_DURATION_SECONDS,
    VIDEO_MAX_SIZE,
    supported_mime_types,
)
from eimir.attachments.models import Attachment
from eimir.config import get_settings
from eimir.core.ids import parse_id
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability

router = APIRouter(tags=["attachments"])


class AttachmentUploadPolicy(ApiModel):
    accepted_mime_types: list[str]
    video_processing_enabled: bool
    video_upload_allowed: bool
    video_max_bytes: int
    video_max_duration_seconds: int


class VideoPlaybackRequest(ApiModel):
    parent_type: Literal["MEMORY", "HEART_MOMENT"]
    parent_id: UUID


class VideoPlaybackAccess(ApiModel):
    url: str
    expires_at: datetime


@router.get(
    "/spaces/{spaceId}/attachment-upload-policy",
    response_model=AttachmentUploadPolicy,
    operation_id="getAttachmentUploadPolicy",
    responses=problem_responses(401, 404),
)
def upload_policy(authorization: Authorization, session: DbSession) -> AttachmentUploadPolicy:
    enabled = get_settings().video_upload_enabled
    return AttachmentUploadPolicy(
        accepted_mime_types=sorted(supported_mime_types()),
        video_processing_enabled=enabled,
        video_upload_allowed=enabled
        and entitlements.has_capability(
            session, authorization.space_id, Capability.MEDIA_VIDEO_UPLOAD
        ),
        video_max_bytes=VIDEO_MAX_SIZE,
        video_max_duration_seconds=VIDEO_MAX_DURATION_SECONDS,
    )


@router.post(
    "/spaces/{spaceId}/attachments/{attachmentId}/playback-access",
    response_model=VideoPlaybackAccess,
    operation_id="createVideoPlaybackAccess",
    responses=problem_responses(401, 404, 409, 422, 429),
)
def create_playback_access(
    authorization: Authorization,
    session: DbSession,
    device_session: CurrentSession,
    response: Response,
    body: VideoPlaybackRequest,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> VideoPlaybackAccess:
    token, expires = playback.issue(
        session, authorization, device_session, attachment_id, body.parent_type, body.parent_id
    )
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return VideoPlaybackAccess(
        url=(
            f"/api/v1/spaces/{authorization.space_id}/attachments/{attachment_id}/playback?"
            + urlencode({"token": token})
        ),
        expires_at=expires,
    )


@router.get(
    "/spaces/{spaceId}/attachments/{attachmentId}/playback",
    operation_id="streamVideoPlayback",
    response_class=Response,
    responses=problem_responses(401, 404, 409),
)
def read_playback(
    session: DbSession,
    request: Request,
    token: Annotated[str, Query(min_length=40, max_length=128)],
    space_id: Annotated[str, Path(alias="spaceId")],
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> Response:
    space, attachment = parse_id(space_id), parse_id(attachment_id)
    if space is None or attachment is None:
        raise Attachment.privacy_absence.error()
    media = playback.authorize(session, token=token, space_id=space, attachment_id=attachment)
    return content_response(
        service.open_content(media),
        media_type=media.mime_type or "video/mp4",
        filename=str(media.id),
        range_header=request.headers.get("range"),
    )
