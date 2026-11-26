"""Flushing per-minute request counters additively (#2317)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from eimir.monitoring.models import RequestMetricMinute
from eimir.monitoring.requests import MinuteBucket, flush
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

MINUTE = datetime(2026, 11, 26, 10, 0, tzinfo=UTC)


def test_middleware_counts_requests_but_not_health_probes(client) -> None:  # type: ignore[no-untyped-def]
    from eimir.monitoring import requests as request_metrics

    request_metrics.REQUEST_METRICS.drain()
    client.get("/api/v1/health")
    client.get("/api/v1/auth/capabilities")

    [bucket] = request_metrics.REQUEST_METRICS.drain()
    assert bucket.requests == 1


def test_flush_adds_up_across_processes(session: Session) -> None:
    first = MinuteBucket(
        MINUTE, requests=2, server_errors=1, latency_buckets=[1, 1, 0, 0, 0, 0, 0, 0]
    )
    second = MinuteBucket(
        MINUTE, requests=3, server_errors=0, latency_buckets=[0, 1, 2, 0, 0, 0, 0, 0]
    )

    flush(session, [first])
    flush(session, [second])
    session.expire_all()

    row = session.get(RequestMetricMinute, MINUTE)
    assert row.requests == 5
    assert row.server_errors == 1
    assert row.latency_buckets == [1, 2, 2, 0, 0, 0, 0, 0]
