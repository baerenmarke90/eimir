"""Hourly operational history (ServerAdmin monitoring, #2317)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.config import MediaStoreBackend, get_settings
from eimir.jobs.models import Job, JobStatus
from eimir.monitoring import history
from eimir.monitoring.models import (
    OperationalMetricHour,
    RequestMetricMinute,
    WorkerHeartbeat,
)
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

HOUR = datetime(2026, 11, 26, 9, 0, tzinfo=UTC)


def _minute(session: Session, at: datetime, requests: int, errors: int, buckets: list[int]) -> None:
    session.add(
        RequestMetricMinute(
            minute=at, requests=requests, server_errors=errors, latency_buckets=buckets
        )
    )


def _settings(store: MediaStoreBackend, media_root: str = "."):  # type: ignore[no-untyped-def]
    return get_settings().model_copy(update={"media_store": store, "media_root": media_root})


def test_snapshot_aggregates_minutes_into_hour(session: Session) -> None:
    # 100 requests: 90 fast, 6 in the 500 ms bucket, 4 slower than 5 s.
    _minute(session, HOUR, 50, 1, [45, 0, 0, 5, 0, 0, 0, 0])
    _minute(session, HOUR + timedelta(minutes=30), 50, 2, [45, 0, 0, 1, 0, 0, 0, 4])
    _minute(session, HOUR + timedelta(hours=1), 7, 7, [0, 0, 0, 0, 0, 0, 0, 7])
    session.flush()

    row = history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.S3))

    assert (row.requests, row.server_errors) == (100, 3)
    assert row.p95_ms == 500
    assert row.disk_total_bytes is None


def test_p95_is_empty_without_requests(session: Session) -> None:
    row = history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.S3))
    assert row.requests == 0
    assert row.p95_ms is None


def test_p95_beyond_the_last_bound_is_the_slowest_bound(session: Session) -> None:
    _minute(session, HOUR, 10, 0, [0, 0, 0, 0, 0, 0, 0, 10])
    session.flush()
    assert history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.S3)).p95_ms == 5000


def test_snapshot_counts_failed_jobs_in_the_hour(session: Session) -> None:
    for finished in (HOUR + timedelta(minutes=5), HOUR - timedelta(minutes=5)):
        session.add(
            Job(
                kind="example",
                status=JobStatus.FAILED.value,
                payload={},
                attempts=3,
                max_attempts=3,
                run_after=finished,
                finished_at=finished,
            )
        )
    session.flush()

    row = history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.S3))
    assert row.failed_jobs == 1


def test_disk_only_for_local_store(session: Session, tmp_path) -> None:  # type: ignore[no-untyped-def]
    local = history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.LOCAL, str(tmp_path)))
    assert local.disk_total_bytes and local.disk_total_bytes > 0
    assert local.disk_used_bytes is not None

    remote = history.snapshot_hour(session, HOUR, _settings(MediaStoreBackend.S3, str(tmp_path)))
    assert remote.disk_total_bytes is None and remote.disk_used_bytes is None


def test_snapshot_is_idempotent_per_hour(session: Session) -> None:
    settings = _settings(MediaStoreBackend.S3)
    history.snapshot_hour(session, HOUR, settings)
    history.snapshot_hour(session, HOUR, settings)
    count = session.execute(select(func.count()).select_from(OperationalMetricHour)).scalar_one()
    assert count == 1


def test_prune_keeps_recent_rows(session: Session) -> None:
    at = HOUR + timedelta(hours=1)
    _minute(session, at - timedelta(hours=49), 1, 0, [1, 0, 0, 0, 0, 0, 0, 0])
    _minute(session, at - timedelta(hours=47), 1, 0, [1, 0, 0, 0, 0, 0, 0, 0])
    for age in (timedelta(days=91), timedelta(days=89)):
        session.add(
            OperationalMetricHour(
                hour=at - age,
                requests=0,
                server_errors=0,
                new_accounts=0,
                active_spaces=0,
                stored_bytes=0,
                failed_jobs=0,
                failed_emails=0,
                failed_pushes=0,
            )
        )
    for name, age in (("old", timedelta(days=8)), ("new", timedelta(days=1))):
        session.add(
            WorkerHeartbeat(
                worker_name=name,
                role="worker",
                build_revision="r",
                last_seen_at=at - age,
                last_progress_at=at - age,
            )
        )
    session.flush()

    history.prune(session, at)
    session.flush()

    assert session.execute(select(func.count()).select_from(RequestMetricMinute)).scalar_one() == 1
    assert (
        session.execute(select(func.count()).select_from(OperationalMetricHour)).scalar_one() == 1
    )
    assert session.get(WorkerHeartbeat, "old") is None
    assert session.get(WorkerHeartbeat, "new") is not None


def test_ensure_scheduled_is_single(session: Session) -> None:
    assert history.ensure_scheduled(session) is not None
    assert history.ensure_scheduled(session) is None
    count = session.execute(
        select(func.count()).select_from(Job).where(Job.kind == history.JOB_KIND)
    ).scalar_one()
    assert count == 1
