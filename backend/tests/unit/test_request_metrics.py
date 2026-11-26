"""Per-minute request counters (ServerAdmin monitoring, #2317)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from eimir.monitoring.requests import LATENCY_BUCKETS_MS, RequestMetrics, counts_path

MINUTE = datetime(2026, 11, 26, 10, 0, tzinfo=UTC)


def test_bucket_math_within_one_minute() -> None:
    metrics = RequestMetrics()
    assert metrics.record(status=200, duration_ms=40, at=MINUTE) == []
    assert metrics.record(status=503, duration_ms=120, at=MINUTE + timedelta(seconds=10)) == []
    assert metrics.record(status=200, duration_ms=6000, at=MINUTE + timedelta(seconds=59)) == []

    [bucket] = metrics.drain()
    assert bucket.minute == MINUTE
    assert bucket.requests == 3
    assert bucket.server_errors == 1
    assert bucket.latency_buckets == [1, 0, 1, 0, 0, 0, 0, 1]
    assert len(bucket.latency_buckets) == len(LATENCY_BUCKETS_MS) + 1


def test_a_new_minute_hands_back_the_finished_one() -> None:
    metrics = RequestMetrics()
    metrics.record(status=200, duration_ms=10, at=MINUTE)
    finished = metrics.record(status=200, duration_ms=10, at=MINUTE + timedelta(minutes=1))

    assert [bucket.minute for bucket in finished] == [MINUTE]
    assert [bucket.minute for bucket in metrics.drain()] == [MINUTE + timedelta(minutes=1)]
    assert metrics.drain() == []


def test_health_probes_are_not_counted() -> None:
    assert counts_path("/api/v1/health") is False
    assert counts_path("/api/v1/health/ready") is False
    assert counts_path("/api/v1/spaces/x/memories") is True
