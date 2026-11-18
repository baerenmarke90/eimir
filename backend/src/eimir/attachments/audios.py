"""Bounded voice input normalization in the existing restricted media role."""

from __future__ import annotations

import json
import math
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from eimir.attachments.limits import AUDIO_MAX_DURATION_SECONDS, AUDIO_MAX_SIZE
from eimir.attachments.videos import PROBE_MAX_BYTES, VideoRejectedError, _run
from eimir.config import get_settings


class AudioRejectedError(ValueError):
    def __init__(self, code: str = "AUDIO_UNREADABLE") -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessedAudio:
    path: Path
    size: int
    duration_seconds: int
    width: None = None
    height: None = None
    thumbnail: None = None


def _format(path: Path) -> str:
    with path.open("rb") as source:
        prefix = source.read(16)
    if prefix.startswith(b"OggS"):
        return "ogg"
    if prefix.startswith(b"\x1a\x45\xdf\xa3"):
        return "matroska"
    if prefix[4:8] == b"ftyp":
        return "mov"
    if prefix.startswith(b"RIFF") and prefix[8:12] == b"WAVE":
        return "wav"
    if prefix.startswith(b"ID3") or (
        len(prefix) > 1 and prefix[0] == 255 and prefix[1] & 224 == 224
    ):
        return "aac" if len(prefix) > 1 and prefix[1] & 246 == 240 else "mp3"
    raise AudioRejectedError()


def _input(path: Path) -> list[str]:
    demuxer = _format(path)
    options = [
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        demuxer,
        "-probesize",
        "1048576",
        "-analyzeduration",
        "5000000",
        "-threads",
        "1",
    ]
    if demuxer == "mov":
        options += ["-enable_drefs", "0", "-use_absolute_path", "0"]
    return [*options, "-f", demuxer, "-i", str(path)]


def _probe(path: Path, deadline: float) -> dict[str, Any]:
    raw = _run(
        [
            get_settings().ffprobe_path,
            "-v",
            "error",
            *_input(path),
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,channels,sample_rate,duration",
            "-of",
            "json",
        ],
        probe=True,
        deadline=deadline,
    )
    try:
        info = json.loads(raw)
        if not isinstance(info, dict):
            raise ValueError
        streams = info["streams"]
        if len(raw) > PROBE_MAX_BYTES or len(streams) != 1:
            raise ValueError
        stream = streams[0]
        if (
            stream["codec_type"] != "audio"
            or stream["codec_name"]
            not in {
                "opus",
                "vorbis",
                "aac",
                "mp3",
                "pcm_s16le",
                "pcm_s24le",
                "pcm_s32le",
                "pcm_f32le",
            }
            or not 1 <= int(stream["channels"]) <= 2
            or not 8000 <= int(stream["sample_rate"]) <= 96000
        ):
            raise ValueError
        for scope in [info.get("format", {}), stream]:
            if "duration" in scope:
                duration = float(scope["duration"])
                if not math.isfinite(duration) or not 0 < duration <= AUDIO_MAX_DURATION_SECONDS:
                    raise AudioRejectedError("AUDIO_DURATION_EXCEEDED")
        return info
    except AudioRejectedError:
        raise
    except (KeyError, TypeError, ValueError, OverflowError, UnicodeError):
        raise AudioRejectedError() from None


def process(source: Path, directory: Path) -> ProcessedAudio:
    """Never trust declared MIME/duration; decode and strip embedded metadata."""
    if not 0 < source.stat().st_size <= AUDIO_MAX_SIZE:
        raise AudioRejectedError("ATTACHMENT_TOO_LARGE")
    deadline = time.monotonic() + 60
    output = directory / "voice.m4a"
    try:
        _probe(source, deadline)
        # Decode the complete source to bounded PCM. Live WebM often has no
        # duration header; frame count, not a client/container claim, is authority.
        pcm = directory / "voice.wav"
        _run(
            [
                get_settings().ffmpeg_path,
                "-nostdin",
                "-v",
                "error",
                "-xerror",
                "-y",
                *_input(source),
                "-map",
                "0:a:0",
                "-vn",
                "-sn",
                "-dn",
                "-t",
                str(AUDIO_MAX_DURATION_SECONDS + 1),
                "-fs",
                str(AUDIO_MAX_SIZE + 1),
                "-c:a",
                "pcm_s16le",
                "-ac",
                "1",
                "-ar",
                "48000",
                "-f",
                "wav",
                str(pcm),
            ],
            deadline=deadline,
        )
        with wave.open(str(pcm), "rb") as decoded:
            duration = decoded.getnframes() / decoded.getframerate()
        if not 0 < duration <= AUDIO_MAX_DURATION_SECONDS:
            raise AudioRejectedError("AUDIO_DURATION_EXCEEDED")
        _run(
            [
                get_settings().ffmpeg_path,
                "-nostdin",
                "-v",
                "error",
                "-xerror",
                "-y",
                *_input(pcm),
                "-map",
                "0:a:0",
                "-c:a",
                "aac",
                "-b:a",
                "64000",
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
            ],
            deadline=deadline,
        )
        size = output.stat().st_size
        if not 0 < size <= AUDIO_MAX_SIZE:
            raise AudioRejectedError("ATTACHMENT_TOO_LARGE")
        # AAC frame padding is not the source duration; full decoding verifies output.
        _format(output)
        _run(
            [
                get_settings().ffmpeg_path,
                "-nostdin",
                "-v",
                "error",
                "-xerror",
                "-err_detect",
                "explode",
                *_input(output),
                "-map",
                "0:a:0",
                "-f",
                "null",
                "-",
            ],
            deadline=deadline,
        )
        return ProcessedAudio(output, size, math.ceil(duration))
    except (wave.Error, EOFError):
        raise AudioRejectedError() from None
    except VideoRejectedError as error:
        code = {
            "VIDEO_PROCESSOR_UNAVAILABLE": "AUDIO_PROCESSOR_UNAVAILABLE",
            "VIDEO_PROCESSING_TIMEOUT": "AUDIO_PROCESSING_TIMEOUT",
        }.get(error.code, "AUDIO_UNREADABLE")
        raise AudioRejectedError(code) from None
