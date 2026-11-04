"""Real restricted-codec acceptance plus deterministic limit/metadata negatives."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from eimir.attachments import videos
from eimir.config import get_settings

SAMPLE = Path(__file__).parents[1] / "fixtures/media/video-with-metadata.mp4"


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


@pytest.fixture
def processor(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    executable = os.environ.get("EIMIR_TEST_FFMPEG")
    probe = os.environ.get("EIMIR_TEST_FFPROBE")
    if not executable or not probe:
        pytest.skip("The dedicated restricted-codec job supplies verified binaries.")
    monkeypatch.setenv("EIMIR_FFMPEG_PATH", executable)
    monkeypatch.setenv("EIMIR_FFPROBE_PATH", probe)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


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
        ({"codec_name": "hevc"}, "VIDEO_CODEC_UNSUPPORTED"),
        ({"color_transfer": "smpte2084"}, "VIDEO_CODEC_UNSUPPORTED"),
        ({"pix_fmt": "yuv420p10le"}, "VIDEO_CODEC_UNSUPPORTED"),
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
