"""Optional single-job media role; the general worker never claims these jobs.

It loads the plugins like the ``api`` and ``worker`` roles (Decision 0017). Voice
notes are Core; video validation is registered by the Pro plugin, so without it
this role claims only voice notes and queued videos wait for a role that has it.
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import time
from types import FrameType

from eimir.attachments import video_jobs
from eimir.attachments.service import ATTACHMENT_AUDIO_VALIDATION, ATTACHMENT_VIDEO_VALIDATION
from eimir.config import get_settings
from eimir.db.session import unit_of_work
from eimir.jobs.worker import JobRegistry, registry, run_once
from eimir.monitoring.heartbeat import VIDEO_LEASE, worker_heartbeat
from eimir.observability import configure_logging
from eimir.plugins.loader import loaded_plugins

_shutdown = False
log = logging.getLogger(__name__)


def _stop(signum: int, frame: FrameType | None) -> None:
    global _shutdown
    _shutdown = True


def claimed_kinds(jobs: JobRegistry) -> list[str]:
    """Voice notes always; video only when a loaded plugin registered its processor."""
    kinds = [ATTACHMENT_AUDIO_VALIDATION]
    if jobs.get(ATTACHMENT_VIDEO_VALIDATION) is not None:
        kinds.insert(0, ATTACHMENT_VIDEO_VALIDATION)
    return kinds


def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    # A named plugin that cannot be loaded stops the role here.
    plugins = loaded_plugins()
    plugins.validate(settings)
    plugins.register_jobs(registry)
    video_jobs.register()
    kinds = claimed_kinds(registry)
    while not _shutdown:
        with unit_of_work() as session:
            recovered = video_jobs.recover_stranded_validations(session)
        if recovered:
            log.info("stranded video validations recovered", extra={"count": recovered})
        if recovered < video_jobs.RECOVERY_BATCH_SIZE:
            break
    name = f"video-{socket.gethostname()}-{os.getpid()}"
    heartbeat = worker_heartbeat(settings, role="video-worker")
    heartbeat.start()
    while not _shutdown:
        heartbeat.progress()
        try:
            completed = run_once(
                name,
                limit=1,
                kinds=kinds,
                lease=VIDEO_LEASE,
            )
        except Exception:
            log.exception("video worker round failed")
            completed = 0
        heartbeat.progress()
        if not completed:
            time.sleep(2)
    heartbeat.stop()


if __name__ == "__main__":
    main()
