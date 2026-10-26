"""Validate, sanitize, and resize images.

This is the first place untrusted bytes are interpreted. It runs exclusively in
a background job, never in the request path, and assumes every file may be
malicious.

Three rules apply:

- Nothing declared by the file is trusted. Format, dimensions, and type come
  from the decoder rather than request headers or client declarations.
- Pixels are rewritten after validation. Readable EXIF and color profiles may
  survive in the primary image under the Product Owner's metadata decision;
  thumbnails carry no metadata and unknown container segments are not copied.
- Data that cannot be processed safely fails; it is never stored on a
  best-effort basis.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from datetime import datetime

import pillow_heif
from PIL import Image, ImageFile, ImageOps, UnidentifiedImageError
from PIL.ExifTags import GPS, IFD

from eimir.attachments.limits import MediaRule
from eimir.attachments.models import PhotoCoordinates

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
    photo_coordinates: PhotoCoordinates | None = None


def _gps_degrees(value: object, reference: object, *, latitude: bool) -> float:
    if not isinstance(value, (tuple, list)) or len(value) != 3:
        raise ValueError("Invalid GPS components")
    components = [float(part) for part in value]
    if not all(math.isfinite(part) and part >= 0 for part in components):
        raise ValueError("Invalid GPS component")
    degrees, minutes, seconds = components
    if minutes >= 60 or seconds >= 60:
        raise ValueError("Invalid GPS subdivision")
    positive, negative = ("N", "S") if latitude else ("E", "W")
    if reference not in (positive, negative):
        raise ValueError("Invalid GPS reference")
    result = degrees + minutes / 60 + seconds / 3600
    return -result if reference == negative else result


def _extract_photo_coordinates(image: Image.Image) -> PhotoCoordinates | None:
    """Pillow owns EXIF decoding; malformed optional GPS never rejects pixels."""
    try:
        gps = image.getexif().get_ifd(IFD.GPSInfo)
        if not gps:
            return None
        return PhotoCoordinates(
            latitude=_gps_degrees(gps[GPS.GPSLatitude], gps[GPS.GPSLatitudeRef], latitude=True),
            longitude=_gps_degrees(gps[GPS.GPSLongitude], gps[GPS.GPSLongitudeRef], latitude=False),
        )
    except Exception:
        # Optional metadata can be corrupt independently of a usable image.
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
    """Rewrite validated pixels, preserving readable metadata when possible.

    Metadata remains part of the authorized primary image; thumbnails are
    separate clean derivatives. Never copy raw unknown container segments.
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
    try:
        exif = image.getexif() if preserve_metadata else None
        if exif:
            metadata["exif"] = exif.tobytes()
    except Exception:
        # Broken optional metadata must not make usable pixels fail.
        pass
    profile = image.info.get("icc_profile")
    if preserve_metadata and isinstance(profile, bytes):
        metadata["icc_profile"] = profile
    try:
        clean.save(target, format=pillow_format, **options, **metadata)
    except (OSError, ValueError, TypeError):
        if not metadata:
            raise
        target = io.BytesIO()
        clean.save(target, format=pillow_format, **options)
    return target.getvalue()


def _thumbnail(image: Image.Image) -> bytes | None:
    """Create a thumbnail, or return none.

    Thumbnail failure is a presentation problem rather than a security failure
    under M2-D15 and must not reject the attachment itself.
    """
    try:
        thumbnail = ImageOps.exif_transpose(image)
        thumbnail.thumbnail((THUMBNAIL_EDGE, THUMBNAIL_EDGE))
        if thumbnail.mode not in ("RGB", "L"):
            thumbnail = thumbnail.convert("RGB")
        target = io.BytesIO()
        thumbnail.save(target, format="JPEG", quality=82)
        return target.getvalue()
    except Exception:  # See docstring: thumbnail generation is non-critical.
        return None


def process(
    data: bytes,
    rule: MediaRule,
    *,
    extract_photo_location: bool = False,
    preserve_metadata: bool = False,
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
    photo_coordinates = _extract_photo_coordinates(image) if extract_photo_location else None

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
        thumbnail=_thumbnail(image),
        photo_coordinates=photo_coordinates,
    )
