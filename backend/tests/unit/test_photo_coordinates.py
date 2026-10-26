"""Encoded GPS is optional; primary metadata and clean previews stay distinct."""

import io

import pytest
from PIL import Image

from eimir.attachments import images
from eimir.attachments.limits import rule_for


def gps_image(gps: dict[int, object] | None = None) -> bytes:
    exif = Image.Exif()
    exif[0x8825] = (
        gps if gps is not None else {1: "N", 2: (52.0, 30.0, 0.0), 3: "E", 4: (13.0, 24.0, 0.0)}
    )
    output = io.BytesIO()
    Image.new("RGB", (32, 24)).save(output, "JPEG", exif=exif)
    return output.getvalue()


def test_real_gps_is_read_only_when_requested_and_preserved_in_primary_image() -> None:
    rule = rule_for("image/jpeg")
    assert rule is not None
    raw = gps_image()
    assert images.process(raw, rule).photo_coordinates is None
    processed = images.process(raw, rule, extract_photo_location=True, preserve_metadata=True)
    assert processed.photo_coordinates is not None
    assert processed.photo_coordinates.latitude == 52.5
    assert processed.photo_coordinates.longitude == 13.4
    assert Image.open(io.BytesIO(processed.content)).getexif().get_ifd(0x8825)[1] == "N"
    assert processed.thumbnail is not None
    assert Image.open(io.BytesIO(processed.thumbnail)).getexif() == {}


def test_metadata_retention_is_independent_of_automatic_place_extraction() -> None:
    rule = rule_for("image/jpeg")
    assert rule is not None
    processed = images.process(gps_image(), rule, preserve_metadata=True)
    assert processed.photo_coordinates is None
    assert Image.open(io.BytesIO(processed.content)).getexif().get_ifd(0x8825)[1] == "N"


@pytest.mark.parametrize(
    "latitude,longitude,expected",
    [
        ((52, 30, 0), (13, 24, 0), (-52.5, -13.4)),
        ((0, 0, 0), (0, 0, 0), (0, 0)),
        ((90, 0, 0), (180, 0, 0), (-90, -180)),
    ],
)
def test_south_west_zero_and_boundary_coordinates(latitude, longitude, expected):  # type: ignore[no-untyped-def]
    rule = rule_for("image/jpeg")
    assert rule is not None
    processed = images.process(
        gps_image({1: "S", 2: latitude, 3: "W", 4: longitude}), rule, extract_photo_location=True
    )
    assert processed.photo_coordinates is not None
    assert (processed.photo_coordinates.latitude, processed.photo_coordinates.longitude) == expected


@pytest.mark.parametrize(
    "gps",
    [
        {1: "N", 2: (91, 0, 0), 3: "E", 4: (13, 0, 0)},
        {1: "N", 2: (52, 60, 0), 3: "E", 4: (13, 0, 0)},
        {1: "N", 2: (52, 0, 60), 3: "E", 4: (13, 0, 0)},
        {1: "X", 2: (52, 0, 0), 3: "E", 4: (13, 0, 0)},
        {1: "N", 2: (52, 0, 0), 3: "E"},
    ],
)
def test_bad_optional_gps_does_not_reject_a_valid_photo(gps):  # type: ignore[no-untyped-def]
    rule = rule_for("image/jpeg")
    assert rule is not None
    result = images.process(gps_image(gps), rule, extract_photo_location=True)
    assert result.photo_coordinates is None
    assert Image.open(io.BytesIO(result.content)).size == (32, 24)


def test_disabled_extraction_never_enters_gps_reader(monkeypatch):  # type: ignore[no-untyped-def]
    def unexpected(_image):  # type: ignore[no-untyped-def]
        raise AssertionError("GPS extraction must stay disabled")

    monkeypatch.setattr(images, "_extract_photo_coordinates", unexpected)
    rule = rule_for("image/jpeg")
    assert rule is not None
    assert images.process(gps_image(), rule).photo_coordinates is None
