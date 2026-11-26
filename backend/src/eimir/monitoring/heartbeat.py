"""Worker liveness (ServerAdmin monitoring, #2317).

A running container is not proof that the worker works: a loop that hangs in
one call keeps the process alive. A small thread therefore writes the
heartbeat every minute, while the loop records its own progress. A process
counts as alive only when both are recent, so a long but healthy job (which
keeps renewing its lease) stays alive and a hung loop turns silent.

The optional push URL is the operator's Uptime Kuma push monitor. It is
configuration, carries a token, and is never logged or returned by any API.
"""

from __future__ import annotations

import logging
import socket
import threading
import urllib.request
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.config import Settings
from eimir.core.clock import now
from eimir.db.session import unit_of_work
from eimir.deployment.revision import build_revision
from eimir.jobs.queue import DEFAULT_LEASE
from eimir.monitoring.models import WorkerHeartbeat

log = logging.getLogger(__name__)

INTERVAL_SECONDS = 60.0
FRESH = timedelta(minutes=3)
"""A heartbeat older than this means the process is gone or the thread died."""
VIDEO_LEASE = timedelta(minutes=30)
"""The video worker claims its jobs with this lease (see ``jobs/video_worker.py``)."""
PROGRESS_LIMITS = {"worker": DEFAULT_LEASE + FRESH, "video-worker": VIDEO_LEASE + FRESH}
"""A healthy loop makes progress at least once per job lease of its role."""
PUSH_TIMEOUT_SECONDS = 5.0


def _push(url: str) -> None:
    request = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(request, timeout=PUSH_TIMEOUT_SECONDS):
        pass


def is_alive(row: WorkerHeartbeat, at: datetime) -> bool:
    """Whether the process behind ``row`` is alive at ``at``."""
    limit = PROGRESS_LIMITS.get(row.role, DEFAULT_LEASE + FRESH)
    return at - row.last_seen_at <= FRESH and at - row.last_progress_at <= limit


def worker_state(session: Session, role: str, at: datetime) -> tuple[str, datetime | None]:
    """Return (``ok`` | ``silent`` | ``no_heartbeat_signal``, newest beat) for a role."""
    rows = list(
        session.execute(select(WorkerHeartbeat).where(WorkerHeartbeat.role == role)).scalars()
    )
    if not rows:
        return "no_heartbeat_signal", None
    newest = max(row.last_seen_at for row in rows)
    if any(is_alive(row, at) for row in rows):
        return "ok", newest
    return "silent", newest


def prune(session: Session, at: datetime) -> int:
    """Remove rows of processes not seen for seven days (old containers)."""
    stale = list(
        session.execute(
            select(WorkerHeartbeat).where(WorkerHeartbeat.last_seen_at < at - timedelta(days=7))
        ).scalars()
    )
    for row in stale:
        session.delete(row)
    return len(stale)


class Heartbeat:
    """Writes one worker process's heartbeat and pings the push monitor."""

    def __init__(
        self,
        *,
        role: str,
        name: str,
        revision: str,
        push_url: str | None,
        clock: Callable[[], datetime] = now,
        session_factory: Callable[[], AbstractContextManager[Session]] = unit_of_work,
        transport: Callable[[str], None] = _push,
    ) -> None:
        self._role = role
        self._name = name[:128]
        self._revision = revision[:64]
        self._push_url = push_url
        self._clock = clock
        self._session_factory = session_factory
        self._transport = transport
        self._lock = threading.Lock()
        self._progress_at = clock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def progress(self) -> None:
        """Record that the loop moved on; call it every iteration and around jobs."""
        with self._lock:
            self._progress_at = self._clock()

    def beat(self) -> None:
        """Write the heartbeat once and ping the push monitor while alive."""
        at = self._clock()
        with self._lock:
            progress_at = self._progress_at
        try:
            with self._session_factory() as session:
                statement = insert(WorkerHeartbeat).values(
                    worker_name=self._name,
                    role=self._role,
                    build_revision=self._revision,
                    last_seen_at=at,
                    last_progress_at=progress_at,
                )
                session.execute(
                    statement.on_conflict_do_update(
                        index_elements=[WorkerHeartbeat.worker_name],
                        set_={
                            "role": statement.excluded.role,
                            "build_revision": statement.excluded.build_revision,
                            "last_seen_at": statement.excluded.last_seen_at,
                            "last_progress_at": statement.excluded.last_progress_at,
                        },
                    )
                )
                session.expire_all()
        except Exception:
            log.warning("worker heartbeat could not be written", exc_info=True)
        limit = PROGRESS_LIMITS.get(self._role, DEFAULT_LEASE + FRESH)
        if self._push_url and at - progress_at <= limit:
            try:
                self._transport(self._push_url)
            except Exception as error:
                # Never the URL: it carries the push monitor's token.
                log.warning(
                    "heartbeat push failed",
                    extra={"error_type": type(error).__name__},
                )

    def _run(self) -> None:
        while not self._stop.is_set():
            self.beat()
            self._stop.wait(INTERVAL_SECONDS)

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="heartbeat", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=PUSH_TIMEOUT_SECONDS + 1)


def worker_heartbeat(settings: Settings, *, role: str) -> Heartbeat:
    """The liveness signal of this worker process."""
    push_url = settings.heartbeat_push_url
    return Heartbeat(
        role=role,
        name=settings.worker_name or socket.gethostname(),
        revision=build_revision(),
        push_url=push_url.get_secret_value() if push_url else None,
    )
