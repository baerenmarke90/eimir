"""Real restricted-codec acceptance plus deterministic limit/metadata negatives."""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from eimir.attachments import videos
from eimir.config import get_settings
from tests.support.video import processor as processor

SAMPLE = Path(__file__).parents[1] / "fixtures/media/video-with-metadata.mp4"


def audio_packet_hashes(path: Path) -> list[str]:
    content = videos._run(
        [
            get_settings().ffprobe_path,
            "-v",
            "error",
            *videos._input(path),
            "-select_streams",
            "a:0",
            "-show_packets",
            "-show_data_hash",
            "sha256",
            "-show_entries",
            "packet=data_hash",
            "-of",
            "json",
        ],
        probe=True,
    )
    return [packet["data_hash"] for packet in json.loads(content)["packets"]]


def test_standalone_worker_can_prepare_attachment_persistence_without_api_bootstrap() -> None:
    program = """
from eimir.jobs import video_worker
from eimir.attachments.models import Attachment
from sqlalchemy.orm import configure_mappers
configure_mappers()
assert Attachment.__mapper__._sorted_tables
for foreign_key in Attachment.__table__.foreign_keys:
    assert foreign_key.column.table.name in {"accounts", "spaces"}
"""
    result = subprocess.run(
        [sys.executable, "-c", program],
        cwd=Path(__file__).parents[2],
        env={**os.environ, "PYTHONPATH": "src"},
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr


def test_real_video_is_sanitized_fully_decoded_and_has_clean_poster(
    processor, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    result = videos.process(SAMPLE, tmp_path)
    assert (result.width, result.height, result.duration_seconds) == (96, 64, 1)
    assert result.thumbnail is not None
    content = result.path.read_bytes()
    for private in [b"private-video-title", b"private-device-comment", b"+49.00+007.00"]:
        assert private not in content
        assert private not in result.thumbnail
    assert videos._metadata(videos._probe(result.path), clean=True) == (96, 64, 1)


def test_truncated_video_never_produces_ready_content(processor, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    source = tmp_path / "truncated.mp4"
    source.write_bytes(SAMPLE.read_bytes()[:512])
    with pytest.raises(videos.VideoRejectedError):
        videos.process(source, tmp_path)


def test_poster_failure_keeps_an_independently_validated_video(
    processor,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,  # type: ignore[no-untyped-def]
) -> None:
    original = videos._run

    def reject_poster(command: list[str], **options: Any) -> bytes:
        if "image2" in command:
            raise videos.VideoRejectedError()
        return original(command, **options)

    monkeypatch.setattr(videos, "_run", reject_poster)
    assert videos.process(SAMPLE, tmp_path).thumbnail is None


@pytest.mark.parametrize(
    ("update", "code"),
    [
        ({"codec_name": "av1"}, "VIDEO_CODEC_UNSUPPORTED"),
        ({"codec_name": "vp9"}, "VIDEO_CODEC_UNSUPPORTED"),
        ({"pix_fmt": "yuv420p12le"}, "VIDEO_CODEC_UNSUPPORTED"),
        ({"width": 4096}, "VIDEO_DIMENSIONS_EXCEEDED"),
        ({"height": 0}, "VIDEO_DIMENSIONS_EXCEEDED"),
        ({"duration": "181"}, "VIDEO_DURATION_EXCEEDED"),
        ({"duration": "nan"}, "VIDEO_DURATION_EXCEEDED"),
    ],
)
def test_video_constraints_are_server_owned(update: dict[str, Any], code: str) -> None:
    stream = {
        "codec_type": "video",
        "codec_name": "h264",
        "pix_fmt": "yuv420p",
        "width": 96,
        "height": 64,
        **update,
    }
    with pytest.raises(videos.VideoRejectedError, match=code):
        videos._metadata({"format": {"duration": "1"}, "streams": [stream]})


@pytest.mark.parametrize(
    "update",
    [
        {"codec_name": "hevc"},
        {"color_transfer": "smpte2084"},
        {"color_transfer": "arib-std-b67"},
        {"pix_fmt": "yuv420p10le"},
        {"pix_fmt": "yuv422p10le"},
        {"pix_fmt": "yuv444p10le"},
        {"pix_fmt": "yuvj422p"},
        {"pix_fmt": "yuvj444p"},
    ],
)
def test_normalizable_input_does_not_relax_retained_playback_contract(
    update: dict[str, Any],
) -> None:
    info = {
        "format": {"duration": "1"},
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "pix_fmt": "yuv420p",
                "width": 96,
                "height": 64,
                **update,
            }
        ],
    }
    assert videos._metadata(info) == (96, 64, 1)
    with pytest.raises(videos.VideoRejectedError, match="VIDEO_CODEC_UNSUPPORTED"):
        videos._metadata(info, clean=True)


@pytest.mark.parametrize("dimensions", [(3840, 2160), (2160, 3840), (1920, 1440)])
def test_compatible_high_resolution_input_must_not_bypass_1080p_normalization(
    dimensions: tuple[int, int],
) -> None:
    stream = {
        "index": 0,
        "codec_type": "video",
        "codec_name": "h264",
        "pix_fmt": "yuv420p",
        "width": dimensions[0],
        "height": dimensions[1],
    }
    info = {"streams": [stream], "format": {"duration": "1"}}
    assert videos._metadata(info)[:2] == dimensions
    options = videos._normalization(info)
    assert options[options.index("-c:v") + 1] == "libopenh264"
    assert "1080" in options[options.index("-vf") + 1]
    with pytest.raises(videos.VideoRejectedError, match="VIDEO_DIMENSIONS_EXCEEDED"):
        videos._metadata(info, clean=True)


@pytest.mark.parametrize("dimensions", [(1920, 1080), (1080, 1920), (640, 480)])
def test_compatible_1080p_and_smaller_recordings_keep_the_lossless_path(
    dimensions: tuple[int, int],
) -> None:
    stream = {
        "index": 0,
        "codec_type": "video",
        "codec_name": "h264",
        "pix_fmt": "yuv420p",
        "width": dimensions[0],
        "height": dimensions[1],
    }
    info = {"streams": [stream], "format": {"duration": "1"}}
    options = videos._normalization(info)
    assert options[options.index("-c:v") + 1] == "copy"
    assert videos._metadata(info, clean=True)[:2] == dimensions


@pytest.mark.parametrize(
    ("filename", "dimensions", "has_audio"),
    [
        ("hevc-sdr.mp4", (96, 64), True),
        ("hevc-hlg.mp4", (96, 64), True),
        ("hevc-pq.mp4", (96, 64), True),
        ("hevc-main10.mov", (96, 64), False),
        ("hevc-rotated.mov", (64, 96), False),
        ("h264-high10-pcm.mov", (96, 64), True),
        ("h264-mp3.mp4", (96, 64), True),
    ],
)
def test_common_smartphone_recordings_produce_clean_playable_media(
    processor, tmp_path: Path, filename: str, dimensions: tuple[int, int], has_audio: bool
) -> None:  # type: ignore[no-untyped-def]
    source = SAMPLE.parent / filename
    result = videos.process(source, tmp_path)
    assert (result.width, result.height) == dimensions
    assert result.thumbnail
    info = videos._probe(result.path)
    primary, audio = videos._streams(info)
    assert primary["codec_name"] == "h264"
    assert primary["pix_fmt"] in {"yuv420p", "yuvj420p"}
    assert len(audio) == int(has_audio)
    assert all(s["codec_name"] == "aac" for s in audio)
    assert abs(float(info["format"]["duration"]) - 1) < 0.1
    assert all(s["codec_type"] in {"video", "audio"} for s in info["streams"])
    if filename.startswith("hevc"):
        assert not any("rotation" in side for side in primary.get("side_data_list", []))
    assert b"synthetic-private" not in result.path.read_bytes()
    assert b"synthetic-private" not in result.thumbnail
    if filename in {"hevc-sdr.mp4", "hevc-hlg.mp4", "hevc-pq.mp4"}:
        # The existing AAC recording survives normalization byte for byte.
        original_audio = audio_packet_hashes(source)
        assert original_audio and audio_packet_hashes(result.path) == original_audio
    if filename in {"hevc-hlg.mp4", "hevc-pq.mp4"}:
        assert primary["color_transfer"] == primary["color_primaries"] == "bt709"
        assert primary["color_space"] == "bt709"
        assert not primary.get("side_data_list")
        # Known flat red/green/blue bars in the synthetic source must retain
        # readable brightness and their dominant hue after actual tone mapping.
        # Merely relabelling the HDR YUV samples does not satisfy these bounds.
        with Image.open(io.BytesIO(result.thumbnail)) as poster:
            rgb = poster.convert("RGB")
            for channel, x in enumerate([50, 130, 360]):
                pixel = rgb.getpixel((x, 400))
                assert pixel[channel] > 160
                assert all(
                    value < pixel[channel] / 2 for c, value in enumerate(pixel) if c != channel
                )
    assert videos._metadata(info, clean=True)[:2] == dimensions


def test_non_media_tracks_and_attached_pictures_cannot_replace_the_recording() -> None:
    info = {
        "streams": [
            {
                "index": 0,
                "codec_type": "video",
                "codec_name": "mjpeg",
                "disposition": {"attached_pic": 1},
            },
            {"index": 3, "codec_type": "data"},
            {
                "index": 5,
                "codec_type": "video",
                "codec_name": "h264",
                "pix_fmt": "yuv420p",
                "width": 96,
                "height": 64,
            },
            {"index": 6, "codec_type": "audio", "codec_name": "aac"},
        ]
    }
    assert videos._normalization(info) == [
        "-map",
        "0:5",
        "-map",
        "0:6",
        "-c:v",
        "copy",
        "-c:a",
        "copy",
    ]


def test_truncated_hevc_tail_is_not_published(processor, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    source = tmp_path / "truncated.mp4"
    content = (SAMPLE.parent / "hevc-hlg.mp4").read_bytes()
    source.write_bytes(content[:-1000])
    with pytest.raises(videos.VideoRejectedError):
        videos.process(source, tmp_path)


def test_unknown_output_metadata_cannot_be_published() -> None:
    with pytest.raises(videos.VideoRejectedError, match="VIDEO_NOT_SANITIZABLE"):
        videos._metadata(
            {
                "format": {"duration": "1", "tags": {"location": "private"}},
                "streams": [
                    {
                        "codec_type": "video",
                        "codec_name": "h264",
                        "pix_fmt": "yuv420p",
                        "width": 96,
                        "height": 64,
                    }
                ],
            },
            clean=True,
        )


def test_encryption_initialization_is_rejected_before_pssh_list_parsing(
    processor, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    import struct

    content = SAMPLE.read_bytes()
    offset = 0
    while offset < len(content):
        size = struct.unpack_from(">I", content, offset)[0]
        assert size >= 8
        if content[offset + 4 : offset + 8] == b"moov":
            boxes = struct.pack(">I4s", 32, b"pssh") + bytes(24)
            amended = (
                content[:offset]
                + struct.pack(">I", size + len(boxes))
                + content[offset + 4 : offset + size]
                + boxes
                + content[offset + size :]
            )
            source = tmp_path / "encrypted.mp4"
            source.write_bytes(amended)
            with pytest.raises(videos.VideoRejectedError):
                videos._probe(source)
            return
        offset += size
    raise AssertionError("Synthetic fixture must contain a moov box")
