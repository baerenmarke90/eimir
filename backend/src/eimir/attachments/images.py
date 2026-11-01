"""Validate, sanitize, and resize images.

This is the first place untrusted bytes are interpreted. It runs exclusively in
a background job, never in the request path, and assumes every file may be
malicious.

Three rules apply:

- Nothing declared by the file is trusted. Format, dimensions, and type come
  from the decoder rather than request headers or client declarations.
- Server projections use an explicit allowlist. Selected moment primary files
  may retain readable EXIF/ICC under ADR 0014; unknown raw segments are discarded.
- Data that cannot be processed safely fails; it is never stored on a
  best-effort basis.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from datetime import datetime

import pillow_heif
from PIL import ExifTags, Image, ImageFile, ImageOps, UnidentifiedImageError

from eimir.attachments.limits import MediaRule

pillow_heif.register_heif_opener()

ImageFile.LOAD_TRUNCATED_IMAGES = False
"""A truncated file is an error, not a partial image.

Otherwise Pillow may silently return whatever bytes it could decode and the
stored result would appear valid despite incomplete input.
"""

THUMBNAIL_EDGE = 512
"""Longest thumbnail edge.

Large enough for dense-display list rendering and small enough that a timeline
does not fetch original-size content through an authorized read path.
"""

_PILLOW_FORMAT_BY_MIME = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "image/heic": "HEIF",
    "image/heif": "HEIF",
}

_MIME_BY_PILLOW_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "HEIF": "image/heic",
}

_EXIF_DATETIME_ORIGINAL = 0x9003
_EXIF_ORIENTATION = 0x0112


class ImageRejectedError(Exception):
    """The image cannot be processed safely.

    Carries a stable code and never parser text, which could contain file
    content and subsequently reach logs or error fields.
    """

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProcessedImage:
    mime_type: str
    width: int
    height: int
    captured_at: datetime | None
    orientation: int | None
    content: bytes
    thumbnail: bytes | None
    coordinates: tuple[float, float] | None = field(default=None, repr=False)


def _gps_coordinate(value: object, reference: object, positive: str, negative: str) -> float:
    if (
        reference not in (positive, negative)
        or not isinstance(value, (tuple, list))
        or len(value) != 3
    ):
        raise ValueError("Invalid GPS coordinate")
    degrees, minutes, seconds = (float(part) for part in value)
    if not all(math.isfinite(part) for part in (degrees, minutes, seconds)):
        raise ValueError("Invalid GPS coordinate")
    if degrees < 0 or not 0 <= minutes < 60 or not 0 <= seconds < 60:
        raise ValueError("Invalid GPS coordinate")
    coordinate = degrees + minutes / 60 + seconds / 3600
    return coordinate if reference == positive else -coordinate


def _extract_coordinates(image: Image.Image) -> tuple[float, float] | None:
    """Read a complete valid GPS pair through Pillow; malformed EXIF is ordinary absence."""
    try:
        gps = image.getexif().get_ifd(ExifTags.IFD.GPSInfo)
        latitude = _gps_coordinate(gps.get(2), gps.get(1), "N", "S")
        longitude = _gps_coordinate(gps.get(4), gps.get(3), "E", "W")
        if abs(latitude) > 90 or abs(longitude) > 180:
            return None
        return round(latitude, 6), round(longitude, 6)
    except Exception:
        # Never propagate parser text or reject otherwise valid pixels for optional GPS.
        return None


def _guard_decompression_bomb(rule: MediaRule) -> None:
    """Set Pillow's decompression-bomb threshold to our own pixel limit.

    Otherwise a library default would decide how much memory untrusted input
    may consume.
    """
    Image.MAX_IMAGE_PIXELS = rule.max_pixels


def _extract_allowlist(image: Image.Image) -> tuple[datetime | None, int | None]:
    """Extract exactly the fields allowed by M2-D14 and nothing else.

    Fields are read individually rather than filtered from a larger structure:
    a denylist would have to know every unwanted field, while this code knows
    only the values explicitly allowed.
    """
    captured_at: datetime | None = None
    orientation: int | None = None
    try:
        exif = image.getexif()
    except Exception:  # A broken EXIF block does not make the image itself invalid.
        return None, None

    raw_datetime = exif.get(_EXIF_DATETIME_ORIGINAL)
    if isinstance(raw_datetime, str):
        try:
            captured_at = datetime.strptime(raw_datetime.strip(), "%Y:%m:%d %H:%M:%S")
        except ValueError:
            captured_at = None

    raw_orientation = exif.get(_EXIF_ORIENTATION)
    if isinstance(raw_orientation, int) and 1 <= raw_orientation <= 8:
        orientation = raw_orientation

    return captured_at, orientation


def _rebuild_image(image: Image.Image, pillow_format: str, *, preserve_metadata: bool) -> bytes:
    """Rewrite pixels, optionally retaining readable EXIF and ICC.

    Never copy raw unknown container segments. Bad optional metadata may be
    omitted without rejecting usable pixels. Clean derivatives stay separate.
    """
    clean = Image.new(image.mode, image.size)
    # Use paste rather than putdata(list(...)): the latter would build a Python
    # list with forty million tuples for a 40 MP image before writing anything.
    # paste performs the pixel copy in C.
    clean.paste(image)

    target = io.BytesIO()
    options: dict[str, object] = {}
    if pillow_format == "JPEG":
        options["quality"] = 92
    metadata: dict[str, object] = {}
    if preserve_metadata:
        try:
            exif = image.getexif()
            if exif:
                metadata["exif"] = exif.tobytes()
        except Exception:
            pass
        profile = image.info.get("icc_profile")
        if isinstance(profile, bytes):
            metadata["icc_profile"] = profile
    try:
        clean.save(target, format=pillow_format, **options, **metadata)
    except (OSError, ValueError, TypeError):
        if not metadata:
            raise
        target = io.BytesIO()
        clean.save(target, format=pillow_format, **options)
    return target.getvalue()


def _thumbnail(image: Image.Image, *, apply_orientation: bool = False) -> bytes | None:
    """Create a thumbnail, or return none.

    Thumbnail failure is a presentation problem rather than a security failure
    under M2-D15 and must not reject the attachment itself.
    """
    try:
        thumbnail = ImageOps.exif_transpose(image) if apply_orientation else image.copy()
        thumbnail.thumbnail((THUMBNAIL_EDGE, THUMBNAIL_EDGE))
        if thumbnail.mode not in ("RGB", "L"):
            thumbnail = thumbnail.convert("RGB")
        target = io.BytesIO()
        thumbnail.save(target, format="JPEG", quality=82)
        return target.getvalue()
    except Exception:  # See docstring: thumbnail generation is non-critical.
        return None


def process(
    data: bytes, rule: MediaRule, *, extract_location: bool = False, preserve_metadata: bool = False
) -> ProcessedImage:
    """Validate, sanitize, and resize an uploaded image.

    The bytes are already fully available. Decoding necessarily materializes
    the image in memory, while the M2-D04 upload limit bounds input size. A
    streaming decoder would not materially reduce the risk here.
    """
    _guard_decompression_bomb(rule)

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Image.DecompressionBombError as error:
        raise ImageRejectedError("IMAGE_TOO_LARGE") from error
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ImageRejectedError("IMAGE_UNREADABLE") from error

    detected_format = (image.format or "").upper()
    detected_mime = _MIME_BY_PILLOW_FORMAT.get(detected_format)
    if detected_mime is None:
        raise ImageRejectedError("IMAGE_TYPE_NOT_ALLOWED")

    # The declared type must match the decoded type. HEIC and HEIF are the same
    # container format and may represent one another.
    expected_format = _PILLOW_FORMAT_BY_MIME.get(rule.mime_type)
    if expected_format != detected_format:
        raise ImageRejectedError("IMAGE_TYPE_MISMATCH")

    width, height = image.size
    if rule.max_edge is not None and max(width, height) > rule.max_edge:
        raise ImageRejectedError("IMAGE_TOO_LARGE")
    if rule.max_pixels is not None and width * height > rule.max_pixels:
        raise ImageRejectedError("IMAGE_TOO_LARGE")

    captured_at, orientation = _extract_allowlist(image)
    coordinates = _extract_coordinates(image) if extract_location else None

    try:
        content = _rebuild_image(image, detected_format, preserve_metadata=preserve_metadata)
    except (OSError, ValueError) as error:
        # If the image cannot be sanitized safely, fail it rather than storing
        # the original unsanitized data (M2-D14).
        raise ImageRejectedError("IMAGE_NOT_SANITIZABLE") from error

    return ProcessedImage(
        mime_type=detected_mime,
        width=width,
        height=height,
        captured_at=captured_at,
        orientation=orientation,
        content=content,
        thumbnail=_thumbnail(image, apply_orientation=True)
        if preserve_metadata
        else _thumbnail(image),
        coordinates=coordinates,
    )
