"""Curated local stock-photo assets for the canonical demo Space.

This module validates the complete manifest before demo mutation and imports
bytes only through the normal attachment/media pipeline. It intentionally has
no network access and no demo-specific storage implementation.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext

SCHEMA_VERSION = 1
MIN_CURATED_ASSETS = 12
MAX_CURATED_ASSETS = 20
ALLOWED_PROVIDERS = frozenset({"pexels", "pixabay"})
PIXABAY_CC0_CUTOFF = date(2019, 1, 9)
PIXABAY_TERMS_URL = "https://pixabay.com/service/terms/"
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MIME_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
SOURCE_HOSTS = {
    "pexels": frozenset({"pexels.com", "www.pexels.com"}),
    "pixabay": frozenset({"pixabay.com", "www.pixabay.com"}),
}


class DemoAssetError(RuntimeError):
    """Raised when curated demo media cannot be trusted as declared."""


@dataclass(frozen=True)
class DemoAsset:
    id: str
    filename: str
    source_provider: str
    source_asset_id: str
    source_page_url: str
    creator: str
    source_published_at: date
    license_name: str
    license_url: str
    license_basis_url: str
    license_checked_at: date
    attribution_required: bool
    attribution_text: str | None
    sha256: str
    mime_type: str
    alt_text_de: str
    usage_context: tuple[str, ...]
    path: Path

    def read_bytes(self) -> bytes:
        """Read the pinned file and re-check its digest immediately before upload."""
        content = self.path.read_bytes()
        actual = hashlib.sha256(content).hexdigest()
        if actual != self.sha256:
            raise DemoAssetError(
                f"Demo asset {self.id!r} changed after validation: expected "
                f"{self.sha256}, got {actual}."
            )
        return content


@dataclass(frozen=True)
class DemoAssetCatalog:
    root: Path
    assets: tuple[DemoAsset, ...]

    def require(self, asset_id: str) -> DemoAsset:
        for asset in self.assets:
            if asset.id == asset_id:
                return asset
        raise DemoAssetError(f"Unknown demo asset id: {asset_id}")


def resolve_asset_root(root: Path | None = None) -> Path:
    """Resolve assets in backend checkout, repository checkout, or runtime image."""
    if root is not None:
        return root
    candidates = (
        Path.cwd() / "demo_assets",
        Path.cwd() / "backend" / "demo_assets",
        Path(__file__).resolve().parents[3] / "demo_assets",
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return candidates[0]


def _required_text(record: dict[str, object], key: str, *, asset_id: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        raise DemoAssetError(f"Demo asset {asset_id!r} requires non-empty {key}.")
    return value.strip()


def _required_date(record: dict[str, object], key: str, *, asset_id: str) -> date:
    raw = _required_text(record, key, asset_id=asset_id)
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise DemoAssetError(f"Demo asset {asset_id!r} has invalid ISO date in {key}.") from error


def _source_url(provider: str, value: str, *, asset_id: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in SOURCE_HOSTS[provider]:
        raise DemoAssetError(
            f"Demo asset {asset_id!r} must point to a concrete HTTPS {provider} source page."
        )
    if not parsed.path or parsed.path == "/":
        raise DemoAssetError(f"Demo asset {asset_id!r} source page URL has no asset path.")
    return value


def _https_url(value: str, *, asset_id: str, field: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise DemoAssetError(f"Demo asset {asset_id!r} requires an HTTPS URL in {field}.")
    return value


def _actual_mime(path: Path, *, asset_id: str) -> str:
    try:
        with Image.open(path) as image:
            image.verify()
            image_format = image.format
    except (OSError, UnidentifiedImageError) as error:
        raise DemoAssetError(f"Demo asset {asset_id!r} is not a decodable image.") from error
    actual = MIME_BY_FORMAT.get(image_format or "")
    if actual is None:
        raise DemoAssetError(
            f"Demo asset {asset_id!r} uses unsupported image format {image_format!r}."
        )
    return actual


def _parse_asset(record: object, *, images_dir: Path) -> DemoAsset:
    if not isinstance(record, dict):
        raise DemoAssetError("Every demo asset manifest entry must be an object.")
    typed: dict[str, object] = record
    asset_id = _required_text(typed, "id", asset_id="<unknown>")
    if ID_PATTERN.fullmatch(asset_id) is None:
        raise DemoAssetError(f"Demo asset id {asset_id!r} is not a canonical slug.")

    filename = _required_text(typed, "filename", asset_id=asset_id)
    if Path(filename).name != filename or filename.startswith("."):
        raise DemoAssetError(f"Demo asset {asset_id!r} has an unsafe filename.")

    provider = _required_text(typed, "source_provider", asset_id=asset_id).lower()
    if provider not in ALLOWED_PROVIDERS:
        raise DemoAssetError(f"Demo asset {asset_id!r} uses unsupported provider {provider!r}.")

    source_page_url = _source_url(
        provider,
        _required_text(typed, "source_page_url", asset_id=asset_id),
        asset_id=asset_id,
    )
    source_published_at = _required_date(typed, "source_published_at", asset_id=asset_id)
    license_name = _required_text(typed, "license_name", asset_id=asset_id)
    license_url = _https_url(
        _required_text(typed, "license_url", asset_id=asset_id),
        asset_id=asset_id,
        field="license_url",
    )
    license_basis_url = _https_url(
        _required_text(typed, "license_basis_url", asset_id=asset_id),
        asset_id=asset_id,
        field="license_basis_url",
    )
    license_checked_at = _required_date(typed, "license_checked_at", asset_id=asset_id)

    attribution_required = typed.get("attribution_required")
    if not isinstance(attribution_required, bool):
        raise DemoAssetError(f"Demo asset {asset_id!r} requires boolean attribution_required.")
    attribution_text = typed.get("attribution_text")
    if attribution_text is not None and not isinstance(attribution_text, str):
        raise DemoAssetError(f"Demo asset {asset_id!r} has invalid attribution_text.")
    if attribution_required and (not attribution_text or not attribution_text.strip()):
        raise DemoAssetError(f"Demo asset {asset_id!r} requires attribution text.")

    sha256 = _required_text(typed, "sha256", asset_id=asset_id).lower()
    if SHA256_PATTERN.fullmatch(sha256) is None:
        raise DemoAssetError(f"Demo asset {asset_id!r} has invalid SHA-256.")
    mime_type = _required_text(typed, "mime_type", asset_id=asset_id).lower()
    alt_text_de = _required_text(typed, "alt_text_de", asset_id=asset_id)

    usage = typed.get("usage_context")
    if (
        not isinstance(usage, list)
        or not usage
        or any(not isinstance(item, str) or not item.strip() for item in usage)
    ):
        raise DemoAssetError(f"Demo asset {asset_id!r} requires non-empty usage_context entries.")
    usage_context = tuple(item.strip() for item in usage if isinstance(item, str))

    path = images_dir / filename
    if not path.is_file():
        raise DemoAssetError(f"Demo asset {asset_id!r} is missing local file {filename!r}.")
    actual_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual_sha256 != sha256:
        raise DemoAssetError(
            f"Demo asset {asset_id!r} SHA-256 mismatch: expected {sha256}, got {actual_sha256}."
        )
    actual_mime = _actual_mime(path, asset_id=asset_id)
    if actual_mime != mime_type:
        raise DemoAssetError(
            f"Demo asset {asset_id!r} MIME mismatch: manifest {mime_type}, file {actual_mime}."
        )

    if provider == "pixabay" and license_name == "CC0 1.0 Universal":
        if source_published_at >= PIXABAY_CC0_CUTOFF:
            raise DemoAssetError(
                f"Demo asset {asset_id!r} claims historical Pixabay CC0 "
                "after the 2019-01-09 cutoff."
            )
        if license_basis_url != PIXABAY_TERMS_URL:
            raise DemoAssetError(
                f"Demo asset {asset_id!r} must document the Pixabay terms as its CC0 basis."
            )

    return DemoAsset(
        id=asset_id,
        filename=filename,
        source_provider=provider,
        source_asset_id=_required_text(typed, "source_asset_id", asset_id=asset_id),
        source_page_url=source_page_url,
        creator=_required_text(typed, "creator", asset_id=asset_id),
        source_published_at=source_published_at,
        license_name=license_name,
        license_url=license_url,
        license_basis_url=license_basis_url,
        license_checked_at=license_checked_at,
        attribution_required=attribution_required,
        attribution_text=attribution_text.strip() if isinstance(attribution_text, str) else None,
        sha256=sha256,
        mime_type=mime_type,
        alt_text_de=alt_text_de,
        usage_context=usage_context,
        path=path,
    )


def load_and_validate_assets(root: Path | None = None) -> DemoAssetCatalog:
    """Validate the complete curated asset set before any demo mutation begins."""
    asset_root = resolve_asset_root(root)
    manifest_path = asset_root / "manifest.json"
    images_dir = asset_root / "images"
    if not manifest_path.is_file():
        raise DemoAssetError(f"Demo asset manifest is missing: {manifest_path}")
    if not images_dir.is_dir():
        raise DemoAssetError(f"Demo asset image directory is missing: {images_dir}")

    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise DemoAssetError("Demo asset manifest is not valid JSON.") from error
    if not isinstance(document, dict) or document.get("schema_version") != SCHEMA_VERSION:
        raise DemoAssetError(f"Demo asset manifest must use schema_version {SCHEMA_VERSION}.")
    records = document.get("assets")
    if not isinstance(records, list):
        raise DemoAssetError("Demo asset manifest requires an assets array.")
    if not MIN_CURATED_ASSETS <= len(records) <= MAX_CURATED_ASSETS:
        raise DemoAssetError(
            f"Canonical demo must contain {MIN_CURATED_ASSETS}-{MAX_CURATED_ASSETS} curated assets."
        )

    assets = tuple(_parse_asset(record, images_dir=images_dir) for record in records)
    ids = [asset.id for asset in assets]
    filenames = [asset.filename for asset in assets]
    if len(ids) != len(set(ids)):
        raise DemoAssetError("Demo asset ids must be unique.")
    if len(filenames) != len(set(filenames)):
        raise DemoAssetError("Demo asset filenames must be unique.")

    local_files = {path.name for path in images_dir.iterdir() if path.is_file()}
    referenced_files = set(filenames)
    if local_files != referenced_files:
        missing = sorted(referenced_files - local_files)
        unreferenced = sorted(local_files - referenced_files)
        raise DemoAssetError(
            "Demo asset directory differs from manifest; "
            f"missing={missing}, unreferenced={unreferenced}."
        )
    if any(path.is_dir() for path in images_dir.iterdir()):
        raise DemoAssetError("Demo asset image directory must not contain subdirectories.")

    return DemoAssetCatalog(root=asset_root, assets=assets)


def import_demo_asset(
    session: Session,
    context: AuthorizationContext,
    asset: DemoAsset,
) -> Attachment:
    """Import one already-validated local asset through the product media pipeline."""
    content = asset.read_bytes()
    attachment = attachment_service.create_upload(
        session,
        context,
        media_type=MediaType.IMAGE,
        original_name=asset.filename,
        expected_mime_type=asset.mime_type,
        expected_size=len(content),
    )
    attachment, rule = attachment_service.open_upload(session, context, attachment.id)
    attachment_service.complete_upload(session, attachment, rule, content)
    attachment_service.finalize_upload(session, context, attachment.id)
    attachment_service.validate(session, attachment.id)
    session.flush()
    if attachment.status != AttachmentStatus.READY.value:
        raise DemoAssetError(
            f"Demo asset {asset.id!r} did not become READY through media validation."
        )
    return attachment
