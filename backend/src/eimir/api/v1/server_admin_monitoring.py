"""ServerAdmin monitoring history and service states (redesign part 2, #2317).

Reads only the aggregate monitoring tables and heartbeat rows: counts, bytes,
durations and timestamps. Nothing here can reach couple content.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from eimir.administration import service as administration
from eimir.api.deps import CurrentServerAdmin, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.clock import now
from eimir.monitoring import heartbeat
from eimir.monitoring.models import OperationalMetricHour
from eimir.monitoring.status import delivery_status, failed_deliveries_since

router = APIRouter(prefix="/server-admin", tags=["server-admin"])

MonitoringRange = Literal["24h", "30d", "90d"]
_RANGES: dict[MonitoringRange, timedelta] = {
    "24h": timedelta(hours=24),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}


class ServerAdminMonitoringPoint(ApiModel):
    at: datetime
    requests: int
    server_errors: int
    p95_ms: int | None
    new_accounts: int
    active_spaces: int
    stored_bytes: int
    disk_used_bytes: int | None
    disk_total_bytes: int | None
    failed_jobs: int
    failed_emails: int
    failed_pushes: int


class ServerAdminMonitoringStorage(ApiModel):
    used_bytes: int
    total_bytes: int | None
    full_in_days: int | None


class ServerAdminServiceState(ApiModel):
    key: Literal["worker", "video_worker", "email", "push"]
    status: str
    last_seen_at: datetime | None


class ServerAdminMonitoring(ApiModel):
    range: MonitoringRange
    points: list[ServerAdminMonitoringPoint]
    storage: ServerAdminMonitoringStorage
    services: list[ServerAdminServiceState]
    alerts_enabled: bool


def _point(row: OperationalMetricHour, at: datetime) -> ServerAdminMonitoringPoint:
    return ServerAdminMonitoringPoint(
        at=at,
        requests=row.requests,
        server_errors=row.server_errors,
        p95_ms=row.p95_ms,
        new_accounts=row.new_accounts,
        active_spaces=row.active_spaces,
        stored_bytes=row.stored_bytes,
        disk_used_bytes=row.disk_used_bytes,
        disk_total_bytes=row.disk_total_bytes,
        failed_jobs=row.failed_jobs,
        failed_emails=row.failed_emails,
        failed_pushes=row.failed_pushes,
    )


def _daily(rows: list[OperationalMetricHour]) -> list[ServerAdminMonitoringPoint]:
    """Sum counts per day; keep the day's last state and its slowest hour."""
    days: OrderedDict[datetime, list[OperationalMetricHour]] = OrderedDict()
    for row in rows:
        days.setdefault(row.hour.replace(hour=0), []).append(row)
    points = []
    for day, hours in days.items():
        last = hours[-1]
        p95_values = [hour.p95_ms for hour in hours if hour.p95_ms is not None]
        points.append(
            ServerAdminMonitoringPoint(
                at=day,
                requests=sum(hour.requests for hour in hours),
                server_errors=sum(hour.server_errors for hour in hours),
                p95_ms=max(p95_values) if p95_values else None,
                new_accounts=sum(hour.new_accounts for hour in hours),
                active_spaces=last.active_spaces,
                stored_bytes=last.stored_bytes,
                disk_used_bytes=last.disk_used_bytes,
                disk_total_bytes=last.disk_total_bytes,
                failed_jobs=sum(hour.failed_jobs for hour in hours),
                failed_emails=sum(hour.failed_emails for hour in hours),
                failed_pushes=sum(hour.failed_pushes for hour in hours),
            )
        )
    return points


def _storage(points: list[ServerAdminMonitoringPoint]) -> ServerAdminMonitoringStorage:
    if not points:
        return ServerAdminMonitoringStorage(used_bytes=0, total_bytes=None, full_in_days=None)
    latest = points[-1]
    total = latest.disk_total_bytes
    if total is None or latest.disk_used_bytes is None:
        return ServerAdminMonitoringStorage(
            used_bytes=latest.stored_bytes, total_bytes=None, full_in_days=None
        )
    samples = [
        ((point.at - points[0].at).total_seconds() / 86_400, point.disk_used_bytes)
        for point in points
        if point.disk_used_bytes is not None
    ]
    full_in_days: int | None = None
    if len(samples) >= 2:
        mean_x = sum(x for x, _ in samples) / len(samples)
        mean_y = sum(y for _, y in samples) / len(samples)
        spread = sum((x - mean_x) ** 2 for x, _ in samples)
        if spread > 0:
            slope = sum((x - mean_x) * (y - mean_y) for x, y in samples) / spread
            if slope > 0:
                full_in_days = max(0, round((total - latest.disk_used_bytes) / slope))
    return ServerAdminMonitoringStorage(
        used_bytes=latest.disk_used_bytes, total_bytes=total, full_in_days=full_in_days
    )


@router.get(
    "/monitoring",
    response_model=ServerAdminMonitoring,
    responses=problem_responses(401, 403, 422),
)
def get_server_admin_monitoring(
    _: CurrentServerAdmin,
    session: DbSession,
    range_: Annotated[MonitoringRange, Query(alias="range")] = "24h",
) -> ServerAdminMonitoring:
    """Return history, storage forecast and service states for the chosen range."""
    at = now()
    rows = list(
        session.execute(
            select(OperationalMetricHour)
            .where(OperationalMetricHour.hour >= at - _RANGES[range_])
            .order_by(OperationalMetricHour.hour)
        ).scalars()
    )
    points = [_point(row, row.hour) for row in rows] if range_ == "24h" else _daily(rows)
    worker_status, worker_seen = heartbeat.worker_state(session, "worker", at)
    video_status, video_seen = heartbeat.worker_state(session, "video-worker", at)
    emails, pushes = failed_deliveries_since(session, at - timedelta(hours=1))
    return ServerAdminMonitoring(
        range=range_,
        points=points,
        storage=_storage(points),
        services=[
            ServerAdminServiceState(key="worker", status=worker_status, last_seen_at=worker_seen),
            ServerAdminServiceState(
                key="video_worker", status=video_status, last_seen_at=video_seen
            ),
            ServerAdminServiceState(key="email", status=delivery_status(emails), last_seen_at=None),
            ServerAdminServiceState(key="push", status=delivery_status(pushes), last_seen_at=None),
        ],
        alerts_enabled=bool(administration.get_settings(session).monitoring_alerts_enabled),
    )
