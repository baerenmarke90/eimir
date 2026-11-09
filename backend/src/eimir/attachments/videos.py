"""Bounded MP4/MOV normalization in the separately shipped restricted media role."""

from __future__ import annotations

import json
import math
import os
import resource
import signal
import subprocess
import time
from dataclasses import dataclass
from fractions import Fraction
from functools import partial
from pathlib import Path
from tempfile import TemporaryFile
from typing import Any

from eimir.attachments import images
from eimir.attachments.limits import VIDEO_MAX_DURATION_SECONDS, VIDEO_MAX_SIZE, rule_for
from eimir.config import get_settings

PROCESS_TIMEOUT_SECONDS = 600
PROCESS_MEMORY_BYTES = 768 * 1024 * 1024
PROBE_MAX_BYTES = 512 * 1024
_HDR_TRANSFERS = {"smpte2084": 16, "arib-std-b67": 18}
_INPUT_PIXELS = {
    "yuv420p",
    "yuvj420p",
    "yuvj422p",
    "yuvj444p",
    "yuv420p10le",
    "yuv422p",
    "yuv422p10le",
    "yuv444p",
    "yuv444p10le",
}
_INPUT_AUDIO = {
    "aac",
    "mp3",
    "pcm_s16le",
    "pcm_s24le",
    "pcm_s32le",
    "pcm_f32le",
    "pcm_s16be",
    "pcm_s24be",
}
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


def _probe(
    path: Path, deadline: float | None = None, *, hdr_stream_index: int | None = None
) -> dict[str, Any]:
    selection = (
        [
            "-select_streams",
            str(hdr_stream_index),
            "-read_intervals",
            "%+#1",
            "-show_entries",
            "frame_side_data=side_data_type,max_content,max_luminance",
        ]
        if hdr_stream_index is not None
        else [
            "-show_entries",
            "format=duration:format_tags:"
            "stream=index,codec_name,codec_type,width,height,duration,pix_fmt,color_transfer,"
            "color_primaries,color_space,color_range:"
            "stream_tags:stream_disposition=attached_pic:"
            "stream_side_data=side_data_type,rotation,max_content,max_luminance",
        ]
    )
    raw = _run(
        [
            get_settings().ffprobe_path,
            "-v",
            "error",
            *_input(path),
            *selection,
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


def _streams(info: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
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
    return video[0], audio


def _compatible_video(primary: dict[str, Any]) -> bool:
    return (
        primary.get("codec_name") == "h264"
        and primary.get("pix_fmt") in {"yuv420p", "yuvj420p"}
        and primary.get("color_transfer") not in _HDR_TRANSFERS
    )


def _metadata(info: dict[str, Any], *, clean: bool = False) -> tuple[int, int, int]:
    try:
        streams = info["streams"]
        primary, audio = _streams(info)
        if (
            primary.get("codec_name") not in {"h264", "hevc"}
            or primary.get("pix_fmt") not in _INPUT_PIXELS
            or any(s.get("codec_name") not in _INPUT_AUDIO for s in audio)
            or (
                clean
                and (
                    not _compatible_video(primary)
                    or any(s.get("codec_name") != "aac" for s in audio)
                )
            )
        ):
            raise VideoRejectedError("VIDEO_CODEC_UNSUPPORTED")
        width, height = int(primary["width"]), int(primary["height"])
        if min(width, height) <= 0 or max(width, height) > 3840 or min(width, height) > 2160:
            raise VideoRejectedError("VIDEO_DIMENSIONS_EXCEEDED")
        if clean and not _within_output_resolution(primary):
            raise VideoRejectedError("VIDEO_DIMENSIONS_EXCEEDED")
        durations = [float(info["format"]["duration"])]
        durations.extend(float(s["duration"]) for s in [primary, *audio] if "duration" in s)
        if any(not math.isfinite(v) or v <= 0 or v > VIDEO_MAX_DURATION_SECONDS for v in durations):
            raise VideoRejectedError("VIDEO_DURATION_EXCEEDED")
        if clean:
            if len(streams) != 1 + len(audio):
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


def _hdr_peak(primary: dict[str, Any]) -> float:
    """Resolve source luminance before linearization loses the HDR transfer tag."""
    side_data = primary.get("side_data_list", [])
    for kind, key in (
        ("Content light level metadata", "max_content"),
        ("Mastering display metadata", "max_luminance"),
    ):
        for item in side_data:
            if item.get("side_data_type") != kind:
                continue
            try:
                luminance = float(Fraction(str(item.get(key, ""))))
            except (ValueError, ZeroDivisionError, OverflowError):
                continue
            if 100 < luminance <= 10_000:
                return luminance / 100
    # PQ is absolute up to 10,000 nits; HLG uses a 1,000-nit reference display.
    # FFmpeg otherwise sees the already-linear frame and assumes HLG for both.
    return 100 if primary.get("color_transfer") == "smpte2084" else 10


def _normalization(info: dict[str, Any]) -> list[str]:
    """Map verified media only; keep compatible streams without lossy encoding."""
    primary, audio = _streams(info)
    options = ["-map", f"0:{int(primary['index'])}"]
    if audio:
        options.extend(["-map", f"0:{int(audio[0]['index'])}"])
    if _compatible_video(primary) and _within_output_resolution(primary):
        options.extend(["-c:v", "copy"])
    else:
        # Scale before linear floating-point HDR work; preserve portrait/aspect
        # and bound encoder/filter memory independently of 4K source dimensions.
        filters = [
            "fps=fps='if(gt(source_fps,0),min(source_fps,30),30)'",
            "scale=w='min(iw,if(gte(iw,ih),1920,1080))':"
            "h='min(ih,if(gte(iw,ih),1080,1920))':"
            "force_original_aspect_ratio=decrease:force_divisible_by=2:"
            "flags=lanczos+accurate_rnd",
        ]
        transfer = _HDR_TRANSFERS.get(primary.get("color_transfer", ""))
        if transfer is not None:
            # HLG/PQ recordings commonly omit their matrix/primaries tags.
            # BT.2020 is their standard fallback; never merely relabel HDR as SDR.
            primaries = {"bt709": 1, "bt2020": 9, "smpte431": 11, "smpte432": 12}
            matrices = {"bt709": 1, "bt470bg": 5, "smpte170m": 6, "bt2020nc": 9}
            color_range = "full" if primary.get("color_range") == "pc" else "limited"
            filters.extend(
                [
                    f"zscale=transferin={transfer}:"
                    f"primariesin={primaries.get(primary.get('color_primaries', ''), 9)}:"
                    f"matrixin={matrices.get(primary.get('color_space', ''), 9)}:"
                    f"rangein={color_range}:transfer=linear:npl=100",
                    "format=gbrpf32le",
                    "zscale=primaries=bt709",
                    # tonemap uses this matrix for luminance, even on RGB.
                    # RGB's (1,1,1) coefficients would brighten neutral highlights.
                    "setparams=colorspace=bt709",
                    f"tonemap=tonemap=reinhard:param=0.5:desat=2:peak={_hdr_peak(primary):g}",
                    "zscale=transfer=bt709:matrix=bt709:range=limited:dither=error_diffusion",
                ]
            )
            options.extend(
                [
                    "-color_primaries",
                    "bt709",
                    "-color_trc",
                    "bt709",
                    "-colorspace",
                    "bt709",
                    "-color_range",
                    "tv",
                ]
            )
        filters.extend(["format=yuv420p", "sidedata=mode=delete"])
        options.extend(
            [
                "-vf",
                ",".join(filters),
                "-c:v",
                "libopenh264",
                "-rc_mode",
                "quality",
                "-b:v",
                "8000000",
                "-maxrate",
                "10000000",
                "-bufsize",
                "16000000",
                "-qmin",
                "18",
                "-qmax",
                "32",
                "-allow_skip_frames",
                "0",
                "-profile:v",
                "high",
                "-g",
                "60",
            ]
        )
    if audio:
        options.extend(["-c:a", "copy" if audio[0].get("codec_name") == "aac" else "aac"])
        if audio[0].get("codec_name") != "aac":
            options.extend(["-b:a", "128000"])
    return options


def _within_output_resolution(primary: dict[str, Any]) -> bool:
    """The same orientation-independent 1080p limit for remux and transcoding."""
    width, height = int(primary.get("width", 0)), int(primary.get("height", 0))
    return 0 < min(width, height) <= 1080 and max(width, height) <= 1920


def process(source: Path, directory: Path) -> ProcessedVideo:
    """Return only the sanitized output; all temporary paths are caller-owned."""
    if not 0 < source.stat().st_size <= VIDEO_MAX_SIZE:
        raise VideoRejectedError("ATTACHMENT_TOO_LARGE")
    with source.open("rb") as handle:
        prefix = handle.read(12)
    if len(prefix) < 12 or prefix[4:8] not in {b"ftyp", b"wide", b"moov", b"mdat"}:
        raise VideoRejectedError()
    deadline = time.monotonic() + PROCESS_TIMEOUT_SECONDS
    info = _probe(source, deadline)
    _metadata(info)
    primary, _ = _streams(info)
    if primary.get("color_transfer") in _HDR_TRANSFERS:
        # HEVC commonly carries luminance metadata on the first decoded frame,
        # not on its stream. Probe only that frame under the same resource fence.
        frames = _probe(source, deadline, hdr_stream_index=int(primary["index"])).get("frames", [])
        if frames:
            primary["side_data_list"] = [
                *primary.get("side_data_list", []),
                *frames[0].get("side_data_list", []),
            ]
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
            *_normalization(info),
            "-sn",
            "-dn",
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
    output_info = _probe(output, deadline)
    width, height, duration = _metadata(output_info, clean=True)
    _, source_audio = _streams(info)
    _, output_audio = _streams(output_info)
    if abs(
        float(info["format"]["duration"]) - float(output_info["format"]["duration"])
    ) > 0.25 or len(source_audio) != len(output_audio):
        raise VideoRejectedError("VIDEO_NOT_SANITIZABLE")
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
