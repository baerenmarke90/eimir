"""Per-minute request counters (ServerAdmin monitoring, #2317).

Each API process counts its requests per minute in memory and hands a finished
minute to a background thread, which adds it to ``request_metric_minutes``.
The additive upsert lets several processes share one row per minute. Only
counts and latency buckets are kept: no path, account or request id.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.config import Environment, get_settings
from eimir.db.session import unit_of_work
from eimir.monitoring.models import RequestMetricMinute

log = logging.getLogger(__name__)

LATENCY_BUCKETS_MS = (50, 100, 250, 500, 1000, 2500, 5000)
"""Upper bounds of the latency buckets; one more bucket counts everything slower."""

_UNCOUNTED_PREFIXES = ("/api/v1/health",)


def counts_path(path: str) -> bool:
    """Health probes (Uptime Kuma, container checks) would drown the real traffic."""
    return not path.startswith(_UNCOUNTED_PREFIXES)


def _bucket_index(duration_ms: float) -> int:
    for index, bound in enumerate(LATENCY_BUCKETS_MS):
        if duration_ms <= bound:
            return index
    return len(LATENCY_BUCKETS_MS)


@dataclass
class MinuteBucket:
    minute: datetime
    requests: int = 0
    server_errors: int = 0
    latency_buckets: list[int] = field(default_factory=lambda: [0] * (len(LATENCY_BUCKETS_MS) + 1))


class RequestMetrics:
    """The counters of the current minute in this process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._current: MinuteBucket | None = None

    def record(self, *, status: int, duration_ms: float, at: datetime) -> list[MinuteBucket]:
        """Count one request; return the minute it finished, if any."""
        minute = at.replace(second=0, microsecond=0)
        finished: list[MinuteBucket] = []
        with self._lock:
            if self._current is not None and self._current.minute != minute:
                finished.append(self._current)
                self._current = None
            if self._current is None:
                self._current = MinuteBucket(minute)
            self._current.requests += 1
            if status >= 500:
                self._current.server_errors += 1
            self._current.latency_buckets[_bucket_index(duration_ms)] += 1
        return finished

    def drain(self) -> list[MinuteBucket]:
        """Hand over the current minute (shutdown, tests)."""
        with self._lock:
            current, self._current = self._current, None
        return [current] if current is not None else []


def flush(session: Session, buckets: list[MinuteBucket]) -> None:
    """Add finished minutes to the shared rows."""
    for bucket in buckets:
        statement = insert(RequestMetricMinute).values(
            minute=bucket.minute,
            requests=bucket.requests,
            server_errors=bucket.server_errors,
            latency_buckets=bucket.latency_buckets,
        )
        table = RequestMetricMinute.__table__
        session.execute(
            statement.on_conflict_do_update(
                index_elements=[RequestMetricMinute.minute],
                set_={
                    "requests": table.c.requests + statement.excluded.requests,
                    "server_errors": table.c.server_errors + statement.excluded.server_errors,
                    "latency_buckets": func.jsonb_build_array(
                        *[
                            (table.c.latency_buckets[index].as_integer())
                            + (statement.excluded.latency_buckets[index].as_integer())
                            for index in range(len(LATENCY_BUCKETS_MS) + 1)
                        ]
                    ),
                },
            )
        )


def _flush_in_unit_of_work(buckets: list[MinuteBucket]) -> None:
    try:
        with unit_of_work() as session:
            flush(session, buckets)
    except Exception:
        # Monitoring must never disturb requests; a lost minute is acceptable.
        log.warning("request metrics could not be written", exc_info=True)


REQUEST_METRICS = RequestMetrics()
"""The counters of this API process."""


def observe(path: str, status: int, duration_ms: float, at: datetime) -> None:
    """Count a finished request and flush a finished minute off the request path."""
    if not counts_path(path):
        return
    finished = REQUEST_METRICS.record(status=status, duration_ms=duration_ms, at=at)
    if not finished or get_settings().environment is Environment.TEST:
        # Test clients share one transaction per test; a second connection
        # writing metrics would only wait on it. ``flush`` is tested directly.
        return
    # A daemon thread: nothing (shutdown, a test client, the event loop) ever
    # waits for monitoring.
    threading.Thread(
        target=_flush_in_unit_of_work, args=(finished,), name="request-metrics", daemon=True
    ).start()
