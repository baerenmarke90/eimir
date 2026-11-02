"""Bounded MP4/MOV sanitizing using the separately shipped restricted FFmpeg build."""

from __future__ import annotations

import json
import math
import os
import resource
import signal
import subprocess
import time
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from tempfile import TemporaryFile
from typing import Any

from eimir.attachments import images
from eimir.attachments.limits import VIDEO_MAX_DURATION_SECONDS, VIDEO_MAX_SIZE, rule_for
from eimir.config import get_settings

PROCESS_TIMEOUT_SECONDS = 180
PROCESS_MEMORY_BYTES = 768 * 1024 * 1024
PROBE_MAX_BYTES = 512 * 1024
_CLEAN_TAGS = frozenset(
    {
        "major_brand",
        "minor_version",
        "compatible_brands",
        "encoder",
        "language",
        "handler_name",
        "vendor_id",
    }
)


class VideoRejectedError(ValueError):
    def __init__(self, code: str = "VIDEO_UNREADABLE") -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessedVideo:
    path: Path
    size: int
    width: int
    height: int
    duration_seconds: int
    thumbnail: bytes | None


def _limits(file_limit: int) -> None:
    resource.setrlimit(resource.RLIMIT_AS, (PROCESS_MEMORY_BYTES, PROCESS_MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (PROCESS_TIMEOUT_SECONDS, PROCESS_TIMEOUT_SECONDS))
    resource.setrlimit(resource.RLIMIT_FSIZE, (file_limit, file_limit))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    # RLIMIT_NPROC counts every process/thread owned by the host UID, including
    # unrelated jobs. The dedicated role's cgroup pids_limit is the per-role
    # process boundary; codec/filter thread counts are explicit below.


def _run(command: list[str], *, probe: bool = False, deadline: float | None = None) -> bytes:
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


def _input(path: Path) -> list[str]:
    return [
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "mov",
        "-probesize",
        "10485760",
        "-analyzeduration",
        "5000000",
        "-enable_drefs",
        "0",
        "-threads",
        "1",
        "-use_absolute_path",
        "0",
        "-f",
        "mov",
        "-i",
        str(path),
    ]


def _probe(path: Path, deadline: float | None = None) -> dict[str, Any]:
    raw = _run(
        [
            get_settings().ffprobe_path,
            "-v",
            "error",
            *_input(path),
            "-show_entries",
            "format=duration:format_tags:"
            "stream=codec_name,codec_type,width,height,duration,pix_fmt,color_transfer:"
            "stream_tags:stream_disposition=attached_pic:stream_side_data=side_data_type,rotation",
            "-of",
            "json",
        ],
        probe=True,
        deadline=deadline,
    )
    try:
        value = json.loads(raw)
        if not isinstance(value, dict) or len(raw) > PROBE_MAX_BYTES:
            raise ValueError
        return value
    except (ValueError, UnicodeError):
        raise VideoRejectedError() from None


def _metadata(info: dict[str, Any], *, clean: bool = False) -> tuple[int, int, int]:
    try:
        streams = info["streams"]
        if not isinstance(streams, list) or not 1 <= len(streams) <= 32:
            raise ValueError
        video = [
            s
            for s in streams
            if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")
        ]
        audio = [s for s in streams if s.get("codec_type") == "audio"]
        if len(video) != 1 or len(audio) > 1:
            raise VideoRejectedError("VIDEO_CODEC_UNSUPPORTED")
        primary = video[0]
        if (
            primary.get("codec_name") != "h264"
            or primary.get("pix_fmt") not in {"yuv420p", "yuvj420p"}
            or primary.get("color_transfer") in {"smpte2084", "arib-std-b67"}
            or any(s.get("codec_name") != "aac" for s in audio)
        ):
            raise VideoRejectedError("VIDEO_CODEC_UNSUPPORTED")
        width, height = int(primary["width"]), int(primary["height"])
        if min(width, height) <= 0 or max(width, height) > 3840 or min(width, height) > 2160:
            raise VideoRejectedError("VIDEO_DIMENSIONS_EXCEEDED")
        durations = [float(info["format"]["duration"])]
        durations.extend(float(s["duration"]) for s in video + audio if "duration" in s)
        if any(not math.isfinite(v) or v <= 0 or v > VIDEO_MAX_DURATION_SECONDS for v in durations):
            raise VideoRejectedError("VIDEO_DURATION_EXCEEDED")
        if clean:
            if len(streams) != len(video) + len(audio):
                raise VideoRejectedError("VIDEO_NOT_SANITIZABLE")
            for scope in [info["format"], *streams]:
                if set(scope.get("tags", {})) - _CLEAN_TAGS:
                    raise VideoRejectedError("VIDEO_NOT_SANITIZABLE")
            for s in streams:
                if any(
                    d.get("side_data_type") != "Display Matrix" for d in s.get("side_data_list", [])
                ):
                    raise VideoRejectedError("VIDEO_NOT_SANITIZABLE")
        return width, height, math.ceil(max(durations))
    except VideoRejectedError:
        raise
    except (AttributeError, KeyError, TypeError, ValueError, OverflowError):
        raise VideoRejectedError() from None


def process(source: Path, directory: Path) -> ProcessedVideo:
    """Return only the sanitized output; all temporary paths are caller-owned."""
    if not 0 < source.stat().st_size <= VIDEO_MAX_SIZE:
        raise VideoRejectedError("ATTACHMENT_TOO_LARGE")
    with source.open("rb") as handle:
        prefix = handle.read(12)
    if len(prefix) < 12 or prefix[4:8] not in {b"ftyp", b"wide", b"moov", b"mdat"}:
        raise VideoRejectedError()
    deadline = time.monotonic() + PROCESS_TIMEOUT_SECONDS
    _metadata(_probe(source, deadline))
    output = directory / "sanitized.mp4"
    ffmpeg = get_settings().ffmpeg_path
    run = partial(_run, deadline=deadline)
    run(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-y",
            *_input(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-sn",
            "-dn",
            "-c",
            "copy",
            "-bsf:v",
            "filter_units=remove_types=6",
            "-map_metadata",
            "-1",
            "-map_metadata:s",
            "-1",
            "-map_chapters",
            "-1",
            "-fflags",
            "+bitexact",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            str(output),
        ]
    )
    size = output.stat().st_size
    if not 0 < size <= VIDEO_MAX_SIZE:
        raise VideoRejectedError("ATTACHMENT_TOO_LARGE")
    width, height, duration = _metadata(_probe(output, deadline), clean=True)
    # Decode the complete sanitized streams, including their tail. A valid
    # header or first poster frame cannot establish that the file is readable.
    run(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-err_detect",
            "explode",
            *_input(output),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-threads",
            "1",
            "-f",
            "null",
            "-",
        ]
    )
    thumbnail = None
    try:
        poster = directory / "poster.jpg"
        run(
            [
                ffmpeg,
                "-nostdin",
                "-v",
                "error",
                "-y",
                *_input(output),
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-an",
                "-vf",
                "scale=640:640:force_original_aspect_ratio=decrease",
                "-map_metadata",
                "-1",
                "-threads",
                "1",
                "-f",
                "image2",
                str(poster),
            ]
        )
        rule = rule_for("image/jpeg")
        assert rule is not None
        with poster.open("rb") as handle:
            raw = handle.read(2 * 1024 * 1024)
        thumbnail = images.process(raw, rule).content
    except (VideoRejectedError, images.ImageRejectedError, OSError):
        # Existing variant contract: poster failure never authorizes raw bytes
        # and does not invalidate an independently verified playable video.
        pass
    return ProcessedVideo(output, size, width, height, duration, thumbnail)
