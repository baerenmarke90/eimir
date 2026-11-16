"""Media rules from M2-D04 and the delivery state from M2-D23."""

from __future__ import annotations

from eimir.attachments.limits import (
    DOCUMENT_MAX_SIZE,
    IMAGE_MAX_EDGE,
    IMAGE_MAX_PIXELS,
    IMAGE_MAX_SIZE,
    VIDEO_MAX_DURATION_SECONDS,
    VIDEO_MAX_SIZE,
    contracted_mime_types,
    rule_for,
    supported_mime_types,
)
from eimir.attachments.models import MediaType


def test_the_contract_allowlist_includes_supported_attachment_formats() -> None:
    assert contracted_mime_types() == {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "video/mp4",
        "video/quicktime",
        "audio/ogg",
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/aac",
        "application/pdf",
    }


def test_default_formats_include_images_and_plan_pdfs() -> None:
    """M2-D23: video remains in the contract but not in this delivery state."""
    assert supported_mime_types() == {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "application/pdf",
    }
    for video in ("video/mp4", "video/quicktime"):
        rule = rule_for(video)
        assert rule is not None
        assert rule.supported is False


def test_the_documented_numbers_are_the_enforced_ones() -> None:
    assert IMAGE_MAX_SIZE == 25 * 1024 * 1024
    assert IMAGE_MAX_PIXELS == 40_000_000
    assert IMAGE_MAX_EDGE == 12_000
    assert VIDEO_MAX_SIZE == 250 * 1024 * 1024
    assert VIDEO_MAX_DURATION_SECONDS == 180
    assert DOCUMENT_MAX_SIZE == 25 * 1024 * 1024
    pdf = rule_for("application/pdf")
    assert pdf is not None and pdf.media_type is MediaType.DOCUMENT
    assert pdf.max_size == DOCUMENT_MAX_SIZE


def test_unknown_types_have_no_default_rule() -> None:
    for unknown in (
        "image/gif",
        "application/zip",
        "text/plain",
        "",
        "image/svg+xml",
    ):
        assert rule_for(unknown) is None


def test_lookup_is_case_insensitive_and_trimmed() -> None:
    rule = rule_for("  IMAGE/JPEG ")
    assert rule is not None
    assert rule.media_type is MediaType.IMAGE
