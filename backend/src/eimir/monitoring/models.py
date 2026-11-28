"""Monitoring storage (ServerAdmin redesign part 2, #2317).

Rows hold counts, bytes, durations and timestamps only: no route, account,
Space or request identifiers ever reach these tables.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Integer, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base

WORKER_ROLES = ("worker", "video-worker")


class WorkerHeartbeat(Base):
    """The last sign of life of one worker process."""

    __tablename__ = "worker_heartbeats"

    worker_name: Mapped[str] = mapped_column(String(128), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    build_revision: Mapped[str] = mapped_column(String(64), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_progress_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (CheckConstraint("role IN ('worker', 'video-worker')", name="role_valid"),)


class RequestMetricMinute(Base):
    """API requests of one minute, summed over all API processes."""

    __tablename__ = "request_metric_minutes"

    minute: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    server_errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_buckets: Mapped[list[int]] = mapped_column(postgresql.JSONB, nullable=False)


class OperationalMetricHour(Base):
    """One hour of operational history, kept for 90 days."""

    __tablename__ = "operational_metric_hours"

    hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    server_errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    p95_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_accounts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_spaces: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stored_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    disk_used_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    disk_total_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    failed_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_emails: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_pushes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class MonitoringAlertState(Base):
    """Whether one alert condition is active and when it was last mailed."""

    __tablename__ = "monitoring_alert_states"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    active_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    high_water_mark: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
