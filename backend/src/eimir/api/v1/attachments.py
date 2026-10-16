"""HTTP contract for M2 attachments."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal, Self
from uuid import UUID

from fastapi import APIRouter, Path, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import ConfigDict, Field, model_validator

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments import service, upload_ownership
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.core.clock import now
from eimir.media import create_signed_upload, get_media_store

router = APIRouter(tags=["attachments"])

STREAM_CHUNK = 64 * 1024
SIGNED_UPLOAD_TTL = timedelta(minutes=10)
SIGNED_READ_TTL = timedelta(minutes=5)
ReadVariant = Literal["original", "thumbnail"]

_PUBLIC_STATUS: dict[str, str] = {
    AttachmentStatus.PENDING.value: "PENDING",
    AttachmentStatus.UPLOADING.value: "PENDING",
    AttachmentStatus.VALIDATING.value: "PROCESSING",
    AttachmentStatus.READY.value: "READY",
    AttachmentStatus.FAILED.value: "FAILED",
}
"""Public status projection defined by API-DESIGN.

``DELETING`` and ``DELETE_FAILED`` are intentionally absent: a deleted
attachment no longer exists at the domain level and is not returned at all.
"""


class AttachmentUploadCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    media_type: MediaType
    original_name: str = Field(min_length=1, max_length=255)
    expected_mime_type: str = Field(min_length=1, max_length=128)
    expected_size: int = Field(gt=0)


class AttachmentFinalize(ApiModel):
    """Empty by contract: finalize carries no client-supplied metadata.

    The server determines everything it needs to know about the file itself.
    """

    model_config = ConfigDict(extra="forbid")


class AttachmentReadRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")

    parent_type: Literal["MEMORY", "HEART_MOMENT", "RELATED_PERSON", "NONE"] = "NONE"
    parent_id: UUID | None = None
    variant: ReadVariant = Field(
        default="original",
        description=(
            "Server-defined content variant. Request thumbnail only when hasThumbnail is true."
        ),
    )

    @model_validator(mode="after")
    def _validate_target(self) -> Self:
        if self.parent_type == "NONE":
            if self.parent_id is not None:
                raise ValueError("parentId must be omitted for parentType NONE")
        elif self.parent_id is None:
            raise ValueError("parentId is required for this parentType")
        return self


class AttachmentDetail(ApiModel):
    id: UUID
    status: str
    media_type: MediaType
    mime_type: str | None
    size: int | None
    width: int | None
    height: int | None
    duration_seconds: int | None
    has_thumbnail: bool
    version: int
    created_at: datetime


class AttachmentSummary(ApiModel):
    """Projection of a bound attachment at its parent resource.

    A single shared type is used rather than one per domain. Duplicate DTO
    names would make OpenAPI generate module-qualified schema names and leak
    internal paths into the public contract.
    """

    id: UUID
    status: str
    media_type: MediaType
    mime_type: str | None
    size: int | None
    width: int | None
    height: int | None
    has_thumbnail: bool


class UploadDescriptor(ApiModel):
    attachment: AttachmentDetail
    method: Literal["STREAM", "SIGNED_UPLOAD"]
    upload_url: str
    expires_at: datetime | None = None
    required_headers: dict[str, str]


class ReadDescriptor(ApiModel):
    method: Literal["STREAM", "SIGNED_URL"]
    url: str
    expires_at: datetime | None = None


def _detail(attachment: Attachment) -> AttachmentDetail:
    return AttachmentDetail(
        id=attachment.id,
        status=_PUBLIC_STATUS.get(attachment.status, "PROCESSING"),
        media_type=MediaType(attachment.media_type),
        mime_type=attachment.mime_type,
        size=attachment.size,
        width=attachment.width,
        height=attachment.height,
        duration_seconds=attachment.duration_seconds,
        has_thumbnail=attachment.has_thumbnail,
        version=attachment.version,
        created_at=attachment.created_at,
    )


def _content_path(
    space_id: UUID,
    attachment_id: UUID,
    variant: ReadVariant = "original",
) -> str:
    """Build the Space-scoped streaming path for an attachment.

    The caller's authorized Space is used rather than the row's own key: every
    route reaching this point already proved that both are the same Space, and
    Account-owned profile media has no Space key at all and is never served
    here.
    """
    path = f"/api/v1/spaces/{space_id}/attachments/{attachment_id}/content"
    return f"{path}?variant=thumbnail" if variant == "thumbnail" else path


def _require_available_variant(attachment: Attachment, variant: ReadVariant) -> None:
    """Keep derived-media existence private and authoritative on the server."""
    if variant == "thumbnail" and not attachment.has_thumbnail:
        raise Attachment.privacy_absence.error()


def _storage_variant(variant: ReadVariant) -> str:
    """Map the public enum to server constants before storage-key construction."""
    if variant == "thumbnail":
        return service.THUMBNAIL_VARIANT
    return service.ORIGINAL_VARIANT


def _no_store(response: Response) -> None:
    # Descriptor responses can contain bearer capabilities. Neither the browser
    # cache nor an intermediary cache may retain them persistently.
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


@router.post(
    "/spaces/{spaceId}/attachments",
    response_model=UploadDescriptor,
    status_code=status.HTTP_201_CREATED,
    operation_id="createAttachmentUpload",
    responses=problem_responses(401, 404, 413, 415, 422),
)
def create_attachment_upload(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: AttachmentUploadCreate,
) -> UploadDescriptor:
    attachment = service.create_upload(
        session,
        authorization,
        media_type=body.media_type,
        original_name=body.original_name,
        expected_mime_type=body.expected_mime_type,
        expected_size=body.expected_size,
    )
    _no_store(response)

    store = get_media_store()
    signed = create_signed_upload(
        store,
        service.storage_key_for(attachment),
        attachment.declared_mime_type,
        SIGNED_UPLOAD_TTL,
    )
    if signed is not None:
        return UploadDescriptor(
            attachment=_detail(attachment),
            method="SIGNED_UPLOAD",
            upload_url=signed.url,
            expires_at=now() + SIGNED_UPLOAD_TTL,
            required_headers=signed.required_headers,
        )

    return UploadDescriptor(
        attachment=_detail(attachment),
        method="STREAM",
        upload_url=_content_path(authorization.space_id, attachment.id),
        required_headers={"Content-Type": "application/octet-stream"},
    )


@router.put(
    "/spaces/{spaceId}/attachments/{attachmentId}/content",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="uploadAttachmentContent",
    responses=problem_responses(401, 403, 404, 409, 413, 415),
)
async def upload_attachment_content(
    authorization: Authorization,
    session: DbSession,
    request: Request,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> Response:
    """Receive bytes through the server stream (M2-D13, local adapter).

    Two operations intentionally happen in this order.

    Authorization happens before reading. Otherwise an arbitrary sender could
    determine how much data the server accepts before upload authorization is
    known.

    Reading is also bounded. ``await request.body()`` would buffer the entire
    body regardless of size, while the media pipeline explicitly forbids
    unbounded RAM buffering. Streaming therefore aborts at the first limit
    violation instead of measuring only after the full body is read.
    """
    claim = upload_ownership.claim_upload(session, authorization, attachment_id)
    try:
        chunks: list[bytes] = []
        bytes_read = 0
        async for chunk in request.stream():
            bytes_read += len(chunk)
            if bytes_read > claim.rule.max_size:
                raise service.too_large()
            chunks.append(chunk)
            if upload_ownership.should_renew(claim):
                claim = upload_ownership.renew_upload_claim(session, claim)

        upload_ownership.complete_upload(session, claim, b"".join(chunks))
    except BaseException:
        # Token matching makes this safe even if another request reclaimed an
        # expired generation while this one was unwinding.
        upload_ownership.release_upload_claim(session, claim)
        raise

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/spaces/{spaceId}/attachments/{attachmentId}/finalize",
    response_model=AttachmentDetail,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="finalizeAttachmentUpload",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def finalize_attachment_upload(
    authorization: Authorization,
    session: DbSession,
    body: AttachmentFinalize,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> AttachmentDetail:
    del body
    attachment = upload_ownership.finalize_upload(session, authorization, attachment_id)
    return _detail(attachment)


@router.get(
    "/spaces/{spaceId}/attachments/{attachmentId}",
    response_model=AttachmentDetail,
    operation_id="getAttachment",
    responses={
        200: {"headers": {"ETag": {"schema": {"type": "string"}}}},
        **problem_responses(401, 404),
    },
)
def get_attachment(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> AttachmentDetail:
    attachment = service.get_attachment(session, authorization, attachment_id)
    response.headers["ETag"] = etag_for(attachment.version)
    return _detail(attachment)


@router.post(
    "/spaces/{spaceId}/attachments/{attachmentId}/read-access",
    response_model=ReadDescriptor,
    operation_id="createAttachmentReadAccess",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_attachment_read_access(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: AttachmentReadRequest,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> ReadDescriptor:
    attachment = service.authorize_read(
        session,
        authorization,
        attachment_id,
        service.ReadTarget.unbound()
        if body.parent_type == "NONE"
        else service.ReadTarget.parent(body.parent_type, body.parent_id),  # type: ignore[arg-type]
    )
    _require_available_variant(attachment, body.variant)
    _no_store(response)

    store = get_media_store()
    signed_url = store.create_read_url(
        service.storage_key_for(attachment, _storage_variant(body.variant)), SIGNED_READ_TTL
    )
    if signed_url is not None:
        return ReadDescriptor(
            method="SIGNED_URL",
            url=signed_url,
            expires_at=now() + SIGNED_READ_TTL,
        )

    return ReadDescriptor(
        method="STREAM",
        url=_content_path(authorization.space_id, attachment.id, body.variant),
    )


@router.get(
    "/spaces/{spaceId}/attachments/{attachmentId}/content",
    operation_id="getAttachmentContent",
    response_class=StreamingResponse,
    responses=problem_responses(401, 403, 404, 409),
)
def get_attachment_content(
    authorization: Authorization,
    session: DbSession,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
    variant: ReadVariant = "original",
) -> StreamingResponse:
    """Authorized streaming route (media pipeline, section 9).

    Every access is verified immediately before opening the content. A
    previously issued ``ReadDescriptor`` is not an authorization credential:
    it does not shorten or replace this check.
    """
    attachment = service.authorize_read(
        session,
        authorization,
        attachment_id,
        service.ReadTarget.resolved_by_server(),
    )
    _require_available_variant(attachment, variant)

    source = service.open_content(attachment, variant=_storage_variant(variant))
    media_type = (
        "image/jpeg"
        if variant == "thumbnail"
        else (attachment.mime_type or "application/octet-stream")
    )

    # Read the first block before the response starts. Decryption authenticates
    # per block, so a wrong key or a tampered object is reported as an error
    # here instead of after a 200 has already been sent.
    try:
        first = source.read(STREAM_CHUNK)
    except BaseException:
        source.close()
        raise

    def chunks() -> object:
        try:
            chunk = first
            while chunk:
                yield chunk
                chunk = source.read(STREAM_CHUNK)
        finally:
            source.close()

    return StreamingResponse(
        chunks(),  # type: ignore[arg-type]
        media_type=media_type,
        headers={
            # Do not leak a filesystem path or username in the header; the
            # download name is controlled by the server.
            "Content-Disposition": f'inline; filename="{attachment.id}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/spaces/{spaceId}/attachments/{attachmentId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteAttachment",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_attachment(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    attachment_id: Annotated[str, Path(alias="attachmentId")],
) -> Response:
    service.delete_attachment(
        session,
        authorization,
        attachment_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
