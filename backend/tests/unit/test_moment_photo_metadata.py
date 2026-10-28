"""Readable metadata retention is independent of place extraction and previews."""

import io

import pytest
from PIL import Image, ImageCms

from eimir.attachments import images
from eimir.attachments.limits import rule_for
from tests.unit.test_attachment_images import _with_metadata


@pytest.mark.parametrize(
    "format,mime",
    [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp"), ("HEIF", "image/heic")],
)
def test_moment_primary_retains_exif_while_preview_stays_clean(format, mime):  # type: ignore[no-untyped-def]
    rule = rule_for(mime)
    assert rule is not None
    raw = _with_metadata(format=format)
    result = images.process(raw, rule, preserve_metadata=True)
    assert result.coordinates is None  # Retention is not permission to create a Place.
    saved = Image.open(io.BytesIO(result.content)).getexif()
    assert saved.get_ifd(0x8825)[1] == "N"
    assert saved[0x9003] == "2025:06:13 21:15:00"
    assert result.thumbnail is not None
    assert Image.open(io.BytesIO(result.thumbnail)).getexif() == {}


def test_preserving_metadata_does_not_change_gps_extraction_result() -> None:
    rule = rule_for("image/jpeg")
    assert rule is not None
    raw = _with_metadata()
    stripped = images.process(raw, rule, extract_location=True)
    preserved = images.process(raw, rule, extract_location=True, preserve_metadata=True)
    assert stripped.coordinates == preserved.coordinates == (52.516667, 13.4)


def test_readable_color_profile_is_retained_only_in_selected_primary() -> None:
    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    raw = io.BytesIO()
    Image.new("RGB", (16, 12)).save(raw, "JPEG", icc_profile=profile)
    rule = rule_for("image/jpeg")
    assert rule is not None
    result = images.process(raw.getvalue(), rule, preserve_metadata=True)
    assert Image.open(io.BytesIO(result.content)).info["icc_profile"] == profile
    assert result.thumbnail is not None
    assert "icc_profile" not in Image.open(io.BytesIO(result.thumbnail)).info
    stripped = images.process(raw.getvalue(), rule)
    assert "icc_profile" not in Image.open(io.BytesIO(stripped.content)).info


def test_unencodable_optional_exif_falls_back_to_validated_pixels() -> None:
    image = Image.new("RGB", (16, 12))
    exif = Image.Exif()
    exif[0x9286] = "x" * 70_000
    image.info["exif"] = exif.tobytes()
    result = images._rebuild_image(image, "JPEG", preserve_metadata=True)
    saved = Image.open(io.BytesIO(result))
    assert saved.size == (16, 12)
    assert saved.getexif() == {}


def test_preview_uses_orientation_without_copying_it_as_metadata() -> None:
    image = Image.new("RGB", (32, 16))
    exif = Image.Exif()
    exif[0x0112] = 6
    raw = io.BytesIO()
    image.save(raw, "JPEG", exif=exif)
    rule = rule_for("image/jpeg")
    assert rule is not None
    result = images.process(raw.getvalue(), rule, preserve_metadata=True)
    assert result.thumbnail is not None
    preview = Image.open(io.BytesIO(result.thumbnail))
    assert preview.size == (16, 32)
    assert preview.getexif() == {}
