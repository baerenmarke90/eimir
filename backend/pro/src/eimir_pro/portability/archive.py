"""Bundle v1 ZIP construction and hostile-archive validation of the operator tool.

The resource limits are a parameter (``BundleLimits``): the writer and the reader of one
run use the same object, so a file the tool writes is a file the tool accepts.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import stat
import zlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import IO, Any
from zipfile import ZIP_DEFLATED, ZIP_STORED, BadZipFile, ZipFile, ZipInfo

from eimir.core.errors import BadRequestError, ErrorCode, PayloadTooLargeError

log = logging.getLogger(__name__)

FORMAT_VERSION = 1
STREAM_CHUNK = 64 * 1024
MIB = 1024 * 1024
GIB = 1024 * MIB


@dataclass(frozen=True)
class BundleLimits:
    """Resource budgets of one bundle. The defaults are the budgets of format v1 so far."""

    max_compressed_bytes: int = 512 * MIB
    max_uncompressed_bytes: int = 2 * GIB
    max_entry_bytes: int = 512 * MIB
    max_entries: int = 4096
    max_compression_ratio: int = 100
    max_json_bytes: int = 64 * MIB

    def __post_init__(self) -> None:
        for name, value in vars(self).items():
            if type(value) is not int or value <= 0:
                raise ValueError(f"Bundle limit {name} must be a positive integer.")


DEFAULT_LIMITS = BundleLimits()
OPERATOR_LIMITS = BundleLimits(
    max_compressed_bytes=4 * GIB,
    max_uncompressed_bytes=8 * GIB,
    max_entries=16384,
)
"""Defaults of the command line: an operator moves a whole Space, not a browser upload."""

_DRIVE = re.compile(r"^[A-Za-z]:")
_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
_ALLOWED_ROOT_FILES = {
    "accounts.json",
    "space.json",
    "profiles.json",
    "people.json",
    "memories.json",
    "heart-moments.json",
    "milestones.json",
    "comments.json",
    "wishes.json",
    "plans.json",
    "places.json",
    "chapters.json",
    "collections.json",
    "shared-notes.json",
    "reminders.json",
    "rules.json",
    "recaps.json",
    "media/index.json",
    "private/notes.json",
    "private/gift-ideas.json",
    "private/collections.json",
    "garden.json",
    # Written by exports before #2210; accepted and ignored on import.
    "private/weekly-insight-feedback.json",
}
_MEDIA_ENTRY = re.compile(
    r"^media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(original|thumbnail)$"
)


class TransferArchiveError(BadRequestError):
    """Stable, content-free validation failure for an untrusted bundle."""


def _archive_error(code: str, detail: str = "Transfer archive is invalid.") -> TransferArchiveError:
    return TransferArchiveError(detail, code)


def _too_large() -> PayloadTooLargeError:
    return PayloadTooLargeError(
        "Transfer archive exceeds the configured resource limits.", ErrorCode.TRANSFER_TOO_LARGE
    )


def canonical_name(name: str) -> str:
    """Return an exact canonical POSIX entry path or reject it fail-closed."""
    if not name or "\\" in name or name.startswith("/") or _DRIVE.match(name):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    path = PurePosixPath(name)
    parts = path.parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    if any(part.rstrip(" .").split(".", 1)[0].upper() in _RESERVED for part in parts):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    normalized = path.as_posix()
    if normalized != name or normalized.endswith("/"):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    return normalized


def _is_regular(info: ZipInfo) -> bool:
    mode = info.external_attr >> 16
    if mode == 0:
        return True
    file_type = stat.S_IFMT(mode)
    return file_type in {0, stat.S_IFREG}


def _object_no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        result[key] = value
    return result


def json_bytes(value: object, limits: BundleLimits = DEFAULT_LIMITS) -> bytes:
    encoder = json.JSONEncoder(ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    output = bytearray()
    for token in encoder.iterencode(value):
        piece = token.encode("utf-8")
        if len(output) + len(piece) + 1 > limits.max_json_bytes:
            raise _too_large()
        output.extend(piece)
    output.extend(b"\n")
    return bytes(output)


def parse_json_bytes(
    data: bytes, *, manifest: bool = False, limits: BundleLimits = DEFAULT_LIMITS
) -> Any:
    if len(data) > limits.max_json_bytes:
        raise _too_large()
    try:
        text = data.decode("utf-8", errors="strict")
        return json.loads(text, object_pairs_hook=_object_no_duplicates)
    except UnicodeDecodeError:
        raise _archive_error(
            ErrorCode.TRANSFER_MANIFEST_INVALID if manifest else ErrorCode.TRANSFER_RELATION_INVALID
        ) from None
    except json.JSONDecodeError:
        raise _archive_error(
            ErrorCode.TRANSFER_MANIFEST_INVALID if manifest else ErrorCode.TRANSFER_RELATION_INVALID
        ) from None


@dataclass(frozen=True)
class ValidatedBundle:
    manifest: dict[str, Any]
    entries: dict[str, ZipInfo]


def _validate_entry_shape(info: ZipInfo, seen: set[str], limits: BundleLimits) -> str:
    name = canonical_name(info.orig_filename)
    if name in seen:
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    seen.add(name)
    if info.flag_bits & 0x1:
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    if not _is_regular(info):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    if info.file_size < 0 or info.compress_size < 0 or info.file_size > limits.max_entry_bytes:
        raise _too_large()
    if name.endswith(".json") and info.file_size > limits.max_json_bytes:
        raise _too_large()
    denominator = max(info.compress_size, 1)
    if info.file_size > denominator * limits.max_compression_ratio:
        raise _too_large()
    if (
        name != "manifest.json"
        and name not in _ALLOWED_ROOT_FILES
        and not _MEDIA_ENTRY.fullmatch(name)
    ):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    return name


def validate_zip(
    fileobj: IO[bytes],
    *,
    compressed_size: int | None = None,
    limits: BundleLimits = DEFAULT_LIMITS,
) -> ValidatedBundle:
    """Validate paths/resource limits and integrity without extracting to disk."""
    if compressed_size is not None and compressed_size > limits.max_compressed_bytes:
        raise _too_large()
    try:
        archive = ZipFile(fileobj, mode="r")
    except (BadZipFile, OSError):
        raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID) from None

    with archive:
        infos = archive.infolist()
        if len(infos) > limits.max_entries:
            raise _too_large()
        seen: set[str] = set()
        entries: dict[str, ZipInfo] = {}
        total = 0
        for info in infos:
            name = _validate_entry_shape(info, seen, limits)
            entries[name] = info
            total += info.file_size
            if total > limits.max_uncompressed_bytes:
                raise _too_large()
        manifest_info = entries.get("manifest.json")
        if manifest_info is None:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        manifest_raw = archive.read(manifest_info)
        manifest_value = parse_json_bytes(manifest_raw, manifest=True, limits=limits)
        if not isinstance(manifest_value, dict):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        manifest = manifest_value
        version = manifest.get("formatVersion")
        if not isinstance(version, int):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        if version != FORMAT_VERSION:
            raise _archive_error(ErrorCode.TRANSFER_FORMAT_UNSUPPORTED)
        scope = manifest.get("scope")
        if scope not in {"SHARED", "PERSONAL"}:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        source_space = manifest.get("sourceSpaceId")
        if not isinstance(source_space, str) or not source_space:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        exported_by = manifest.get("exportedBySourceId")
        if exported_by is not None and (not isinstance(exported_by, str) or not exported_by):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        if not isinstance(manifest.get("exportedAt"), str) or not isinstance(
            manifest.get("applicationVersion"), str
        ):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        # Additive field (Decision 0020): the Alembic revision the exporting database was at.
        schema_revision = manifest.get("schemaRevision")
        if schema_revision is not None and (
            not isinstance(schema_revision, str) or not schema_revision
        ):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        checksums = manifest.get("checksums")
        if not isinstance(checksums, dict):
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        expected_names = set(entries) - {"manifest.json"}
        if set(checksums) != expected_names:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        for name in sorted(expected_names):
            expected = checksums.get(name)
            if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
                raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
            digest = hashlib.sha256()
            with archive.open(entries[name], "r") as source:
                while chunk := source.read(STREAM_CHUNK):
                    digest.update(chunk)
            if digest.hexdigest() != expected:
                raise _archive_error(ErrorCode.TRANSFER_CHECKSUM_MISMATCH)
        if scope == "SHARED" and any(name.startswith("private/") for name in expected_names):
            raise _archive_error(ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID)
        return ValidatedBundle(manifest=manifest, entries=entries)


def read_json_entry(
    fileobj: IO[bytes], entry: ZipInfo, limits: BundleLimits = DEFAULT_LIMITS
) -> Any:
    fileobj.seek(0)
    with ZipFile(fileobj, mode="r") as archive:
        return parse_json_bytes(archive.read(entry), limits=limits)


class ExportWriter:
    """Apply the v1 reader's budgets while producing each entry."""

    def __init__(
        self, archive: ZipFile, output: IO[bytes], limits: BundleLimits = DEFAULT_LIMITS
    ) -> None:
        self.archive = archive
        self.output = output
        self.limits = limits
        self.total = 0

    def _begin(self, name: str) -> None:
        canonical_name(name)
        if len(self.archive.filelist) >= self.limits.max_entries:
            raise _too_large()

    def _refuse(self, limit: str, maximum: int, observed: int) -> PayloadTooLargeError:
        # Content-free diagnostics: which budget was hit and by how much.
        log.warning(
            "portability export exceeds a bundle limit",
            extra={"limit": limit, "maximum_bytes": maximum, "observed_bytes": observed},
        )
        return _too_large()

    def _reserve(self, count: int, entry_size: int) -> None:
        self.total += count
        limits = self.limits
        if entry_size > limits.max_entry_bytes:
            raise self._refuse("entry", limits.max_entry_bytes, entry_size)
        if self.total > limits.max_uncompressed_bytes:
            raise self._refuse("uncompressed", limits.max_uncompressed_bytes, self.total)
        written = self.output.tell()
        if written > limits.max_compressed_bytes:
            raise self._refuse("compressed", limits.max_compressed_bytes, written)

    def add_json(self, name: str, data: bytes, checksums: dict[str, str]) -> None:
        self._begin(name)
        if len(data) > self.limits.max_json_bytes:
            raise _too_large()
        self._reserve(len(data), len(data))
        # Legitimately repetitive documents must remain importable. ZIP deflate
        # uses raw DEFLATE without the zlib header or checksum.
        compressed = len(zlib.compress(data, wbits=-15))
        method = (
            ZIP_STORED
            if len(data) > max(1, compressed) * self.limits.max_compression_ratio
            else ZIP_DEFLATED
        )
        self.archive.writestr(name, data, compress_type=method)
        if name != "manifest.json":
            checksums[name] = hashlib.sha256(data).hexdigest()

    def add_media(self, name: str, source: IO[bytes], checksums: dict[str, str]) -> None:
        self._begin(name)
        digest = hashlib.sha256()
        size = 0
        # Media objects are already encoded. Storing them also bounds the
        # compression ratio independently of their contents.
        with self.archive.open(ZipInfo(name), mode="w", force_zip64=True) as target:
            while chunk := source.read(STREAM_CHUNK):
                size += len(chunk)
                self._reserve(len(chunk), size)
                digest.update(chunk)
                target.write(chunk)
        checksums[name] = digest.hexdigest()


def manifest_bytes(
    *,
    exported_at: str,
    application_version: str,
    scope: str,
    source_space_id: str,
    checksums: Mapping[str, str],
    exported_by_source_id: str,
    personal_owner_source_id: str | None,
    schema_revision: str | None = None,
    limits: BundleLimits = DEFAULT_LIMITS,
) -> bytes:
    manifest: dict[str, object] = {
        "formatVersion": FORMAT_VERSION,
        "exportedAt": exported_at,
        "applicationVersion": application_version,
        "scope": scope,
        "sourceSpaceId": source_space_id,
        "exportedBySourceId": exported_by_source_id,
        "checksums": dict(sorted(checksums.items())),
    }
    if personal_owner_source_id is not None:
        manifest["personalOwnerSourceId"] = personal_owner_source_id
    if schema_revision is not None:
        manifest["schemaRevision"] = schema_revision
    return json_bytes(manifest, limits)
