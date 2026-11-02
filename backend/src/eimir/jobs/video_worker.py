"""Optional single-job video role; the general worker never claims these jobs."""

from __future__ import annotations

import logging
import os
import signal
import socket
import time
from datetime import timedelta
from types import FrameType

from eimir.attachments import video_jobs
from eimir.attachments.service import ATTACHMENT_VIDEO_VALIDATION
from eimir.config import get_settings
from eimir.jobs.worker import run_once
from eimir.observability import configure_logging

_shutdown = False
log = logging.getLogger(__name__)


def _stop(signum: int, frame: FrameType | None) -> None:
    global _shutdown
    _shutdown = True


def main() -> None:
    configure_logging(get_settings())
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    video_jobs.register()
    name = f"video-{socket.gethostname()}-{os.getpid()}"
    while not _shutdown:
        try:
            completed = run_once(
                name, limit=1, kinds=[ATTACHMENT_VIDEO_VALIDATION], lease=timedelta(minutes=20)
            )
        except Exception:
            log.exception("video worker round failed")
            completed = 0
        if not completed:
            time.sleep(2)


if __name__ == "__main__":
    main()
