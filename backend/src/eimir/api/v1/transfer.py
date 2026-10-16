"""HTTP contract for versioned asynchronous Transfer Bundle portability."""

from __future__ import annotations

import tempfile
from collections.abc import Iterator, Mapping
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import ConfigDict

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import ErrorCode, PayloadTooLargeError, UnsupportedMediaTypeError
from eimir.transfer import service
from eimir.transfer.archive import MAX_COMPRESSED_BYTES, STREAM_CHUNK
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
    TransferScope,
)

router = APIRouter(tags=["transfer"])


class TransferExportCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    scope: TransferScope


class TransferExportDetail(ApiModel):
    id: UUID
    scope: TransferScope
    status: ExportStatus
    created_at: datetime
    ready_at: datetime | None
    expires_at: datetime
    artifact_size: int | None
    error_code: str | None
    download_url: str | None


class TransferImportSummary(ApiModel):
    scope: TransferScope
    record_counts: dict[str, int]
    media_count: int
    source_member_count: int


class TransferImportDetail(ApiModel):
    id: UUID
    status: ImportStatus
    scope: TransferScope | None
    created_at: datetime
    validated_at: datetime | None
    completed_at: datetime | None
    expires_at: datetime
    artifact_size: int
    error_code: str | None
    summary: TransferImportSummary | None


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


def _export_detail(transfer: TransferExport) -> TransferExportDetail:
    ready = transfer.status == ExportStatus.READY.value
    return TransferExportDetail(
        id=transfer.id,
        scope=TransferScope(transfer.scope),
        status=ExportStatus(transfer.status),
        created_at=transfer.created_at,
        ready_at=transfer.ready_at,
        expires_at=transfer.expires_at,
        artifact_size=transfer.artifact_size,
        error_code=transfer.error_code,
        download_url=(
            f"/api/v1/spaces/{transfer.space_id}/transfer/exports/{transfer.id}/download"
            if ready
            else None
        ),
    )


def _summary_count(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _summary_record_counts(value: object) -> dict[str, int]:
    if not isinstance(value, Mapping):
        return {}
    return {
        str(key): count
        for key, count in value.items()
        if isinstance(count, int) and not isinstance(count, bool)
    }


def _import_detail(transfer: TransferImport) -> TransferImportDetail:
    summary: TransferImportSummary | None = None
    if transfer.summary is not None and transfer.scope is not None:
        raw_scope = transfer.summary.get("scope", transfer.scope)
        scope = raw_scope if isinstance(raw_scope, str) else transfer.scope
        summary = TransferImportSummary(
            scope=TransferScope(scope),
            record_counts=_summary_record_counts(transfer.summary.get("recordCounts", {})),
            media_count=_summary_count(transfer.summary.get("mediaCount", 0)),
            source_member_count=_summary_count(transfer.summary.get("sourceMemberCount", 0)),
        )
    return TransferImportDetail(
        id=transfer.id,
        status=ImportStatus(transfer.status),
        scope=TransferScope(transfer.scope) if transfer.scope is not None else None,
        created_at=transfer.created_at,
        validated_at=transfer.validated_at,
        completed_at=transfer.completed_at,
        expires_at=transfer.expires_at,
        artifact_size=transfer.artifact_size,
        error_code=transfer.error_code,
        summary=summary,
    )


@router.post(
    "/spaces/{spaceId}/transfer/exports",
    response_model=TransferExportDetail,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="createTransferExport",
    responses=problem_responses(401, 404, 422),
)
def create_transfer_export(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: TransferExportCreate,
) -> TransferExportDetail:
    transfer = service.create_export(session, authorization, body.scope)
    _no_store(response)
    return _export_detail(transfer)


@router.get(
    "/spaces/{spaceId}/transfer/exports/{exportId}",
    response_model=TransferExportDetail,
    operation_id="getTransferExport",
    responses=problem_responses(401, 404),
)
def get_transfer_export(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    export_id: Annotated[str, Path(alias="exportId")],
) -> TransferExportDetail:
    transfer = service.get_export(session, authorization, export_id)
    _no_store(response)
    return _export_detail(transfer)


@router.get(
    "/spaces/{spaceId}/transfer/exports/{exportId}/download",
    response_class=StreamingResponse,
    operation_id="downloadTransferExport",
    responses={
        200: {
            "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}},
            "description": "Authorized Transfer Bundle download.",
        },
        **problem_responses(401, 404, 409),
    },
)
def download_transfer_export(
    authorization: Authorization,
    session: DbSession,
    export_id: Annotated[str, Path(alias="exportId")],
) -> StreamingResponse:
    transfer, source = service.open_export_download(session, authorization, export_id)

    def chunks() -> Iterator[bytes]:
        try:
            while chunk := source.read(STREAM_CHUNK):
                yield chunk
        finally:
            source.close()

    headers = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": f'attachment; filename="eimir-export-v1-{transfer.id}.zip"',
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    }
    return StreamingResponse(chunks(), media_type="application/zip", headers=headers)


@router.post(
    "/spaces/{spaceId}/transfer/imports",
    response_model=TransferImportDetail,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="createTransferImport",
    responses=problem_responses(401, 404, 413, 415, 422),
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
async def create_transfer_import(
    authorization: Authorization,
    session: DbSession,
    request: Request,
    response: Response,
) -> TransferImportDetail:
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/zip":
        raise UnsupportedMediaTypeError(
            "Transfer import requires application/zip.",
            ErrorCode.TRANSFER_MANIFEST_INVALID,
        )

    temporary = tempfile.SpooledTemporaryFile(  # noqa: SIM115
        max_size=16 * 1024 * 1024, mode="w+b"
    )
    size = 0
    try:
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_COMPRESSED_BYTES:
                raise PayloadTooLargeError(
                    "Transfer archive exceeds the supported resource limits.",
                    ErrorCode.TRANSFER_TOO_LARGE,
                )
            temporary.write(chunk)
        temporary.seek(0)
        transfer = service.create_import(
            session,
            authorization,
            temporary,
            size=size,
        )
    finally:
        temporary.close()
    _no_store(response)
    return _import_detail(transfer)


@router.get(
    "/spaces/{spaceId}/transfer/imports/{importId}",
    response_model=TransferImportDetail,
    operation_id="getTransferImport",
    responses=problem_responses(401, 404),
)
def get_transfer_import(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    import_id: Annotated[str, Path(alias="importId")],
) -> TransferImportDetail:
    transfer = service.get_import(session, authorization, import_id)
    _no_store(response)
    return _import_detail(transfer)


@router.post(
    "/spaces/{spaceId}/transfer/imports/{importId}/apply",
    response_model=TransferImportDetail,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="applyTransferImport",
    responses=problem_responses(401, 404, 409),
)
def apply_transfer_import(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    import_id: Annotated[str, Path(alias="importId")],
) -> TransferImportDetail:
    transfer = service.request_apply(session, authorization, import_id)
    _no_store(response)
    return _import_detail(transfer)
