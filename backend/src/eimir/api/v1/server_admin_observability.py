"""Privacy-safe ServerAdmin job directory and storage aggregates.

This module is intentionally separate from the broader ServerAdmin dashboard so
operator observability cannot accidentally grow into a payload/content browser.
Every database query selects only explicitly safe technical columns or aggregates.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from eimir.api.deps import CurrentServerAdmin, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.core.clock import now
from eimir.jobs.models import Job, JobStatus

router = APIRouter(prefix="/server-admin", tags=["server-admin"])

JobStatusFilter = Literal["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]
JobTimeWindow = Literal["24h", "7d", "30d"]
StorageGrowthWindow = Literal["24h", "7d", "30d"]

_JOB_WINDOWS: dict[JobTimeWindow, timedelta] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
_STORAGE_WINDOWS: tuple[tuple[StorageGrowthWindow, timedelta], ...] = (
    ("24h", timedelta(hours=24)),
    ("7d", timedelta(days=7)),
    ("30d", timedelta(days=30)),
)


class ServerAdminJobItem(ApiModel):
    """Queue metadata safe for ServerAdmin responses.

    Deliberately absent: payload, last_error, locked_by, and payload-derived IDs.
    """

    id: str
    kind: str
    status: str
    attempts: int
    max_attempts: int
    created_at: datetime
    run_after: datetime
    finished_at: datetime | None
    exhausted: bool
    delayed: bool
    pending_age_seconds: int | None


class ServerAdminJobList(ApiModel):
    items: list[ServerAdminJobItem]
    total: int
    limit: int
    offset: int


class ServerAdminStorageStatusCount(ApiModel):
    status: str
    count: int


class ServerAdminStorageMediaCount(ApiModel):
    media_type: str
    count: int


class ServerAdminStorageGrowth(ApiModel):
    window: StorageGrowthWindow
    ready_count: int
    ready_bytes: int
    ready_size_unknown_count: int


class ServerAdminStorageOverview(ApiModel):
    """Aggregate-only storage projection with no content/ownership metadata."""

    status_counts: list[ServerAdminStorageStatusCount]
    media_type_counts: list[ServerAdminStorageMediaCount]
    ready_count: int
    ready_bytes: int
    ready_size_unknown_count: int
    failed_count: int
    delete_failed_count: int
    uploading_count: int
    validating_count: int
    deleting_count: int
    thumbnail_ready_count: int
    growth: list[ServerAdminStorageGrowth]


def _exhausted_filter(exhausted: bool):  # type: ignore[no-untyped-def]
    condition = (Job.status == JobStatus.FAILED.value) & (Job.attempts >= Job.max_attempts)
    if exhausted:
        return condition
    return or_(Job.status != JobStatus.FAILED.value, Job.attempts < Job.max_attempts)


@router.get(
    "/jobs",
    response_model=ServerAdminJobList,
    responses=problem_responses(401, 403, 422),
)
def list_server_admin_jobs(
    _: CurrentServerAdmin,
    session: DbSession,
    status: Annotated[JobStatusFilter | None, Query()] = None,
    kind: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
    exhausted: Annotated[bool | None, Query()] = None,
    created_within: Annotated[JobTimeWindow | None, Query(alias="createdWithin")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ServerAdminJobList:
    """List technical job state without selecting sensitive queue columns."""
    current_time = now()
    filters = []
    if status is not None:
        filters.append(Job.status == status)
    if kind is not None:
        filters.append(Job.kind == kind)
    if exhausted is not None:
        filters.append(_exhausted_filter(exhausted))
    if created_within is not None:
        filters.append(Job.created_at >= current_time - _JOB_WINDOWS[created_within])

    total = session.execute(select(func.count()).select_from(Job).where(*filters)).scalar_one()

    # Do not select Job itself. Loading the ORM row would also load payload,
    # last_error and locked_by even if Pydantic later omitted them.
    rows = session.execute(
        select(
            Job.id,
            Job.kind,
            Job.status,
            Job.attempts,
            Job.max_attempts,
            Job.created_at,
            Job.run_after,
            Job.finished_at,
        )
        .where(*filters)
        .order_by(Job.created_at.desc(), Job.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    items: list[ServerAdminJobItem] = []
    for row in rows:
        values = row._mapping
        job_status = str(values["status"])
        attempts = int(values["attempts"])
        max_attempts = int(values["max_attempts"])
        created_at = values["created_at"]
        run_after = values["run_after"]
        pending = job_status == JobStatus.PENDING.value
        items.append(
            ServerAdminJobItem(
                id=str(values["id"]),
                kind=str(values["kind"]),
                status=job_status,
                attempts=attempts,
                max_attempts=max_attempts,
                created_at=created_at,
                run_after=run_after,
                finished_at=values["finished_at"],
                exhausted=(job_status == JobStatus.FAILED.value and attempts >= max_attempts),
                delayed=(pending and run_after < current_time),
                pending_age_seconds=(
                    max(0, int((current_time - created_at).total_seconds())) if pending else None
                ),
            )
        )

    return ServerAdminJobList(items=items, total=int(total), limit=limit, offset=offset)


def _ready_storage_aggregate(session: Session):  # type: ignore[no-untyped-def]
    return (
        session.execute(
            select(
                func.count().label("ready_count"),
                func.coalesce(
                    func.sum(case((Attachment.size.is_not(None), Attachment.size), else_=0)),
                    0,
                ).label("ready_bytes"),
                func.coalesce(
                    func.sum(case((Attachment.size.is_(None), 1), else_=0)),
                    0,
                ).label("unknown_size_count"),
            ).where(Attachment.status == AttachmentStatus.READY.value)
        )
        .one()
        ._mapping
    )


def _storage_growth(session: Session) -> list[ServerAdminStorageGrowth]:
    current_time = now()
    result: list[ServerAdminStorageGrowth] = []
    for label, delta in _STORAGE_WINDOWS:
        values = (
            session.execute(
                select(
                    func.count().label("ready_count"),
                    func.coalesce(
                        func.sum(case((Attachment.size.is_not(None), Attachment.size), else_=0)),
                        0,
                    ).label("ready_bytes"),
                    func.coalesce(
                        func.sum(case((Attachment.size.is_(None), 1), else_=0)),
                        0,
                    ).label("unknown_size_count"),
                ).where(
                    Attachment.status == AttachmentStatus.READY.value,
                    Attachment.ready_at.is_not(None),
                    Attachment.ready_at >= current_time - delta,
                )
            )
            .one()
            ._mapping
        )
        result.append(
            ServerAdminStorageGrowth(
                window=label,
                ready_count=int(values["ready_count"] or 0),
                ready_bytes=int(values["ready_bytes"] or 0),
                ready_size_unknown_count=int(values["unknown_size_count"] or 0),
            )
        )
    return result


@router.get(
    "/storage",
    response_model=ServerAdminStorageOverview,
    responses=problem_responses(401, 403),
)
def get_server_admin_storage(
    _: CurrentServerAdmin,
    session: DbSession,
) -> ServerAdminStorageOverview:
    """Return authoritative aggregate storage state, never an attachment directory."""
    status_rows = session.execute(
        select(Attachment.status, func.count()).group_by(Attachment.status)
    ).all()
    status_counts = {status.value: 0 for status in AttachmentStatus}
    for status, count in status_rows:
        if status in status_counts:
            status_counts[str(status)] = int(count)

    media_rows = session.execute(
        select(Attachment.media_type, func.count()).group_by(Attachment.media_type)
    ).all()
    media_counts = {media_type.value: 0 for media_type in MediaType}
    for media_type, count in media_rows:
        if media_type in media_counts:
            media_counts[str(media_type)] = int(count)

    ready = _ready_storage_aggregate(session)
    thumbnail_ready_count = session.execute(
        select(func.count())
        .select_from(Attachment)
        .where(
            Attachment.status == AttachmentStatus.READY.value,
            Attachment.has_thumbnail.is_(True),
        )
    ).scalar_one()

    return ServerAdminStorageOverview(
        status_counts=[
            ServerAdminStorageStatusCount(status=status.value, count=status_counts[status.value])
            for status in AttachmentStatus
        ],
        media_type_counts=[
            ServerAdminStorageMediaCount(
                media_type=media_type.value,
                count=media_counts[media_type.value],
            )
            for media_type in MediaType
        ],
        ready_count=int(ready["ready_count"] or 0),
        ready_bytes=int(ready["ready_bytes"] or 0),
        ready_size_unknown_count=int(ready["unknown_size_count"] or 0),
        failed_count=status_counts[AttachmentStatus.FAILED.value],
        delete_failed_count=status_counts[AttachmentStatus.DELETE_FAILED.value],
        uploading_count=status_counts[AttachmentStatus.UPLOADING.value],
        validating_count=status_counts[AttachmentStatus.VALIDATING.value],
        deleting_count=status_counts[AttachmentStatus.DELETING.value],
        thumbnail_ready_count=int(thumbnail_ready_count),
        growth=_storage_growth(session),
    )
