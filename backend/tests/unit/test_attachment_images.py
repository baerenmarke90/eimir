"""What happens to an image during ingest - and what does not."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from eimir.attachments import images
from eimir.attachments.limits import MediaRule, rule_for

MANUFACTURER = "GeheimKamera GmbH"
COMMENT = "privater Kommentar"
SOFTWARE = "SpionageApp 1.0"


def _rule(mime: str = "image/jpeg"):  # type: ignore[no-untyped-def]
    rule = rule_for(mime)
    assert rule is not None
    return rule


def _with_metadata(
    format: str = "JPEG",
    size: tuple[int, int] = (32, 24),
) -> bytes:
    image = Image.new("RGB", size, (10, 20, 30))
    exif = Image.Exif()
    exif[0x9003] = "2025:06:13 21:15:00"
    exif[0x0112] = 3
    exif[0x010F] = MANUFACTURER
    exif[0x0131] = SOFTWARE
    exif[0x9286] = COMMENT
    exif[0x8825] = {1: "N", 2: (52.0, 31.0, 0.0), 3: "E", 4: (13.0, 24.0, 0.0)}
    buffer = io.BytesIO()
    image.save(buffer, format, exif=exif.tobytes())
    return buffer.getvalue()


def test_location_and_device_metadata_do_not_survive() -> None:
    raw = _with_metadata()
    assert MANUFACTURER.encode() in raw

    result = images.process(raw, _rule())

    assert MANUFACTURER.encode() not in result.content
    assert SOFTWARE.encode() not in result.content
    assert COMMENT.encode() not in result.content
    assert Image.open(io.BytesIO(result.content)).getexif() == {}


def test_the_allowlist_is_extracted_before_stripping() -> None:
    result = images.process(_with_metadata(), _rule())
    assert result.captured_at is not None
    assert result.captured_at.year == 2025
    assert result.orientation == 3


def test_unknown_segments_do_not_survive_either() -> None:
    """Allowlist, not blacklist: an unknown field is removed as well."""
    image = Image.new("RGB", (16, 16))
    exif = Image.Exif()
    exif[0x9C9E] = "unbekanntes Feld"  # XPAuthor - not on the allowlist
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif.tobytes())

    result = images.process(buffer.getvalue(), _rule())
    assert "unbekanntes Feld".encode("utf-16-le") not in result.content
    assert Image.open(io.BytesIO(result.content)).getexif() == {}


def test_dimensions_come_from_the_decoder() -> None:
    result = images.process(_with_metadata(size=(40, 25)), _rule())
    assert (result.width, result.height) == (40, 25)


def test_declared_type_must_match_the_decoded_one() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, "PNG")
    with pytest.raises(images.ImageRejectedError) as error:
        images.process(buffer.getvalue(), _rule("image/jpeg"))
    assert error.value.code == "IMAGE_TYPE_MISMATCH"


def test_garbage_is_rejected() -> None:
    with pytest.raises(images.ImageRejectedError) as error:
        images.process(b"das ist kein bild", _rule())
    assert error.value.code == "IMAGE_UNREADABLE"


def test_truncated_data_is_rejected_instead_of_half_decoded() -> None:
    full = _with_metadata(size=(64, 64))
    with pytest.raises(images.ImageRejectedError):
        images.process(full[: len(full) // 3], _rule())


def test_oversized_dimensions_are_rejected() -> None:
    rule = _rule()
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64)).save(buffer, "JPEG")
    constrained_rule = MediaRule(
        mime_type=rule.mime_type,
        media_type=rule.media_type,
        max_size=rule.max_size,
        max_pixels=100,
        max_edge=10,
    )
    with pytest.raises(images.ImageRejectedError) as error:
        images.process(buffer.getvalue(), constrained_rule)
    assert error.value.code == "IMAGE_TOO_LARGE"


def test_heif_goes_through_the_same_path() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (24, 18)).save(buffer, "HEIF")
    result = images.process(buffer.getvalue(), _rule("image/heic"))
    assert result.width == 24
    assert result.height == 18


def test_a_thumbnail_is_produced_and_bounded() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (2000, 1000)).save(buffer, "JPEG")
    result = images.process(buffer.getvalue(), _rule())
    assert result.thumbnail is not None
    thumbnail = Image.open(io.BytesIO(result.thumbnail))
    assert max(thumbnail.size) <= images.THUMBNAIL_EDGE


def test_the_thumbnail_carries_no_metadata_either() -> None:
    result = images.process(_with_metadata(size=(200, 200)), _rule())
    assert result.thumbnail is not None
    assert MANUFACTURER.encode() not in result.thumbnail
    assert Image.open(io.BytesIO(result.thumbnail)).getexif() == {}
