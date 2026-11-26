"""Worker liveness for ServerAdmin monitoring (#2317)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.monitoring import heartbeat
from eimir.monitoring.models import WorkerHeartbeat
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

PUSH_URL = "https://kuma.example.test/api/push/secret-token"


class Clock:
    def __init__(self, at: datetime) -> None:
        self.at = at

    def __call__(self) -> datetime:
        return self.at


def _beat(session: Session, clock: Clock, *, push_url=None, transport=None, name="w1"):  # type: ignore[no-untyped-def]
    beat = heartbeat.Heartbeat(
        role="worker",
        name=name,
        revision="rev",
        push_url=push_url,
        clock=clock,
        session_factory=lambda: _Borrowed(session),
        transport=transport or (lambda url: None),
    )
    return beat


class _Borrowed:
    """Uses the test's session as the unit of work."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def __enter__(self) -> Session:
        return self.session

    def __exit__(self, *exc: object) -> None:
        self.session.flush()


def test_beat_upserts_one_row_per_worker(session: Session) -> None:
    clock = Clock(now())
    beat = _beat(session, clock)
    beat.progress()
    beat.beat()
    clock.at += timedelta(minutes=1)
    beat.beat()

    rows = session.execute(select(func.count()).select_from(WorkerHeartbeat)).scalar_one()
    assert rows == 1
    assert session.get(WorkerHeartbeat, "w1").last_seen_at == clock.at


def test_alive_needs_fresh_beat_and_recent_progress() -> None:
    at = now()
    row = WorkerHeartbeat(
        worker_name="w",
        role="worker",
        build_revision="rev",
        last_seen_at=at - timedelta(seconds=30),
        last_progress_at=at - timedelta(minutes=9),
    )
    assert heartbeat.is_alive(row, at) is False
    row.last_progress_at = at - timedelta(minutes=4)
    assert heartbeat.is_alive(row, at) is True
    row.last_seen_at = at - timedelta(minutes=4)
    assert heartbeat.is_alive(row, at) is False


def test_video_worker_allows_its_longer_job_lease() -> None:
    at = now()
    row = WorkerHeartbeat(
        worker_name="v",
        role="video-worker",
        build_revision="rev",
        last_seen_at=at - timedelta(seconds=30),
        last_progress_at=at - timedelta(minutes=20),
    )
    assert heartbeat.is_alive(row, at) is True
    row.last_progress_at = at - timedelta(minutes=40)
    assert heartbeat.is_alive(row, at) is False


def test_push_only_while_alive_and_never_raises(
    session: Session, caplog: pytest.LogCaptureFixture
) -> None:
    calls: list[str] = []

    def failing(url: str) -> None:
        calls.append(url)
        raise OSError("unreachable")

    clock = Clock(now())
    beat = _beat(session, clock, push_url=PUSH_URL, transport=failing)
    beat.progress()
    with caplog.at_level(logging.WARNING):
        beat.beat()
    assert calls == [PUSH_URL]
    assert PUSH_URL not in caplog.text
    assert "secret-token" not in caplog.text

    # A hung loop makes no progress: the row is still written, the ping is not.
    clock.at += timedelta(minutes=9)
    beat.beat()
    assert calls == [PUSH_URL]


def test_worker_state_reports_silent_and_none(session: Session) -> None:
    at = now()
    assert heartbeat.worker_state(session, "worker", at) == ("no_heartbeat_signal", None)

    clock = Clock(at - timedelta(minutes=10))
    beat = _beat(session, clock)
    beat.progress()
    beat.beat()
    assert heartbeat.worker_state(session, "worker", at) == ("silent", clock.at)

    clock.at = at
    beat.progress()
    beat.beat()
    assert heartbeat.worker_state(session, "worker", at) == ("ok", at)
    assert heartbeat.worker_state(session, "video-worker", at) == ("no_heartbeat_signal", None)
