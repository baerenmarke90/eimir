"""Restricted external media processes shared by video and voice notes (Core).

Runs ffprobe/ffmpeg with no credentials, bounded output, resource limits and a
deadline. Voice notes are Free and use it directly; the Pro video processor
(``eimir_pro.video_processing``) uses the same runner.
"""

from __future__ import annotations

import os
import resource
import signal
import subprocess
import time
from tempfile import TemporaryFile

from eimir.attachments.limits import VIDEO_MAX_SIZE

PROCESS_TIMEOUT_SECONDS = 600
PROCESS_MEMORY_BYTES = 768 * 1024 * 1024
PROBE_MAX_BYTES = 512 * 1024


class VideoRejectedError(ValueError):
    def __init__(self, code: str = "VIDEO_UNREADABLE") -> None:
        super().__init__(code)
        self.code = code


def _limits(file_limit: int) -> None:
    resource.setrlimit(resource.RLIMIT_AS, (PROCESS_MEMORY_BYTES, PROCESS_MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (PROCESS_TIMEOUT_SECONDS, PROCESS_TIMEOUT_SECONDS))
    resource.setrlimit(resource.RLIMIT_FSIZE, (file_limit, file_limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    # RLIMIT_NPROC counts every process/thread owned by the host UID, including
    # unrelated jobs. The dedicated role's cgroup pids_limit is the per-role
    # process boundary; codec/filter thread counts are explicit below.


def run_restricted(
    command: list[str], *, probe: bool = False, deadline: float | None = None
) -> bytes:
    """Never capture unbounded decoder output or inherit application credentials."""
    if not probe:
        command = [
            command[0],
            "-filter_threads",
            "1",
            "-filter_complex_threads",
            "1",
            *command[1:-1],
            "-threads",
            "1",
            command[-1],
        ]
    with TemporaryFile(mode="w+b") as output:
        try:
            child = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.DEVNULL,
                close_fds=True,
                start_new_session=True,
                env={"PATH": "/usr/bin:/bin", "LANG": "C", "HOME": "/nonexistent"},
                preexec_fn=lambda: _limits(PROBE_MAX_BYTES if probe else VIDEO_MAX_SIZE),
            )
        except OSError:
            raise VideoRejectedError("VIDEO_PROCESSOR_UNAVAILABLE") from None
        try:
            timeout = (
                PROCESS_TIMEOUT_SECONDS
                if deadline is None
                else max(0.1, deadline - time.monotonic())
            )
            result = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            raise VideoRejectedError("VIDEO_PROCESSING_TIMEOUT") from None
        if result != 0:
            raise VideoRejectedError()
        output.seek(0)
        return output.read(PROBE_MAX_BYTES + 1) if probe else b""
