"""Real voice decoders, sanitized output and authoritative decoded duration."""

from pathlib import Path

import pytest

from eimir.attachments import audios
from tests.support.video import processor as processor

FIXTURES = Path(__file__).parents[1] / "fixtures/media/voice"


@pytest.mark.parametrize("name", ["short.ogg", "short.webm", "short.m4a", "short.mp3", "short.wav"])
def test_supported_voice_is_decoded_sanitized_and_playable(
    processor, tmp_path: Path, name: str
) -> None:  # type: ignore[no-untyped-def]
    result = audios.process(FIXTURES / name, tmp_path)
    assert 0 < result.size < 100_000
    assert result.duration_seconds == 1
    assert result.thumbnail is None
    raw = result.path.read_bytes()
    assert b"private-voice-title" not in raw
    assert b"private-voice-comment" not in raw
    assert raw[4:8] == b"ftyp"


def test_live_webm_duration_comes_from_decoded_frames(processor, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(audios.AudioRejectedError, match="AUDIO_DURATION_EXCEEDED"):
        audios.process(FIXTURES / "long-live.webm", tmp_path)


@pytest.mark.parametrize(
    "content", [b"<html>not audio</html>", b"OggS" + b"x" * 100, b"RIFFxxxxWAVEbad"]
)
def test_unreadable_or_forged_voice_never_becomes_ready(
    processor, tmp_path: Path, content: bytes
) -> None:  # type: ignore[no-untyped-def]
    source = tmp_path / "forged.ogg"
    source.write_bytes(content)
    with pytest.raises(audios.AudioRejectedError):
        audios.process(source, tmp_path)


def test_voice_byte_limit_precedes_any_decoder(tmp_path: Path) -> None:
    source = tmp_path / "oversized.wav"
    with source.open("wb") as target:
        target.truncate(audios.AUDIO_MAX_SIZE + 1)
    with pytest.raises(audios.AudioRejectedError, match="ATTACHMENT_TOO_LARGE"):
        audios.process(source, tmp_path)
