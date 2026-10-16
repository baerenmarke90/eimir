"""Media rules from M2-D04 and delivery support from M2-D23.

Kept separate from lifecycle logic so every limit has one authoritative home.
Changing a number means changing it here rather than wherever it happens to be
inconvenient.
"""

from __future__ import annotations

from dataclasses import dataclass

from eimir.attachments.models import MediaType

MEBIBYTE = 1024 * 1024


@dataclass(frozen=True)
class MediaRule:
    mime_type: str
    media_type: MediaType
    max_size: int
    max_pixels: int | None = None
    max_edge: int | None = None
    max_duration_seconds: int | None = None
    supported: bool = True
    """Whether this type can actually be processed by the current release.

    M2-D04 permits video while M2-D23 defers implementation to a later slice.
    The rule therefore remains in the catalog rather than changing the
    contract. Unsupported types fail closed.
    """


IMAGE_MAX_SIZE = 25 * MEBIBYTE
IMAGE_MAX_PIXELS = 40_000_000
IMAGE_MAX_EDGE = 12_000

VIDEO_MAX_SIZE = 250 * MEBIBYTE
VIDEO_MAX_DURATION_SECONDS = 180
VIDEO_MAX_EDGE = 3840


def _image(mime_type: str) -> MediaRule:
    return MediaRule(
        mime_type=mime_type,
        media_type=MediaType.IMAGE,
        max_size=IMAGE_MAX_SIZE,
        max_pixels=IMAGE_MAX_PIXELS,
        max_edge=IMAGE_MAX_EDGE,
    )


def _video(mime_type: str) -> MediaRule:
    return MediaRule(
        mime_type=mime_type,
        media_type=MediaType.VIDEO,
        max_size=VIDEO_MAX_SIZE,
        max_edge=VIDEO_MAX_EDGE,
        max_duration_seconds=VIDEO_MAX_DURATION_SECONDS,
        supported=False,
    )


RULES: dict[str, MediaRule] = {
    rule.mime_type: rule
    for rule in (
        _image("image/jpeg"),
        _image("image/png"),
        _image("image/webp"),
        _image("image/heic"),
        _image("image/heif"),
        _video("video/mp4"),
        _video("video/quicktime"),
    )
}


def rule_for(mime_type: str) -> MediaRule | None:
    """Return the rule for a MIME type, or none.

    None means reject fail-closed. There is deliberately no default rule for
    unknown types; such a default would be the path through which an unplanned
    format entered the system.
    """
    return RULES.get(mime_type.strip().lower())


def supported_mime_types() -> frozenset[str]:
    """MIME types the current server release actually accepts."""
    return frozenset(mime for mime, rule in RULES.items() if rule.supported)


def contracted_mime_types() -> frozenset[str]:
    """MIME types permitted by the contract, including deferred video."""
    return frozenset(RULES)
