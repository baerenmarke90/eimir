"""Transfer Bundle v1 ZIP construction and hostile-archive validation."""

from __future__ import annotations

import hashlib
import json
import re
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import IO, Any
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile, ZipInfo

from eimir.core.errors import BadRequestError, ErrorCode, PayloadTooLargeError

FORMAT_VERSION = 1
MAX_COMPRESSED_BYTES = 512 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
MAX_ENTRY_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 4096
MAX_COMPRESSION_RATIO = 100
MAX_JSON_BYTES = 64 * 1024 * 1024
STREAM_CHUNK = 64 * 1024

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
    "reminders.json",
    "rules.json",
    "media/index.json",
    "private/notes.json",
    "private/gift-ideas.json",
    "private/collections.json",
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
        "Transfer archive exceeds the supported resource limits.", ErrorCode.TRANSFER_TOO_LARGE
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


def json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def parse_json_bytes(data: bytes, *, manifest: bool = False) -> Any:
    if len(data) > MAX_JSON_BYTES:
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


def _validate_entry_shape(info: ZipInfo, seen: set[str]) -> str:
    name = canonical_name(info.filename)
    if name in seen:
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    seen.add(name)
    if info.flag_bits & 0x1:
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    if not _is_regular(info):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    if info.file_size < 0 or info.compress_size < 0 or info.file_size > MAX_ENTRY_BYTES:
        raise _too_large()
    if name.endswith(".json") and info.file_size > MAX_JSON_BYTES:
        raise _too_large()
    denominator = max(info.compress_size, 1)
    if info.file_size > denominator * MAX_COMPRESSION_RATIO:
        raise _too_large()
    if (
        name != "manifest.json"
        and name not in _ALLOWED_ROOT_FILES
        and not _MEDIA_ENTRY.fullmatch(name)
    ):
        raise _archive_error(ErrorCode.TRANSFER_ARCHIVE_UNSAFE)
    return name


def validate_zip(fileobj: IO[bytes], *, compressed_size: int | None = None) -> ValidatedBundle:
    """Validate paths/resource limits and integrity without extracting to disk."""
    if compressed_size is not None and compressed_size > MAX_COMPRESSED_BYTES:
        raise _too_large()
    try:
        archive = ZipFile(fileobj, mode="r")
    except (BadZipFile, OSError):
        raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID) from None

    with archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            raise _too_large()
        seen: set[str] = set()
        entries: dict[str, ZipInfo] = {}
        total = 0
        for info in infos:
            name = _validate_entry_shape(info, seen)
            entries[name] = info
            total += info.file_size
            if total > MAX_UNCOMPRESSED_BYTES:
                raise _too_large()
        manifest_info = entries.get("manifest.json")
        if manifest_info is None:
            raise _archive_error(ErrorCode.TRANSFER_MANIFEST_INVALID)
        manifest_raw = archive.read(manifest_info)
        manifest_value = parse_json_bytes(manifest_raw, manifest=True)
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


def read_json_entry(fileobj: IO[bytes], entry: ZipInfo) -> Any:
    fileobj.seek(0)
    with ZipFile(fileobj, mode="r") as archive:
        return parse_json_bytes(archive.read(entry))


def add_bytes(archive: ZipFile, name: str, data: bytes, checksums: dict[str, str]) -> None:
    canonical_name(name)
    if name == "manifest.json":
        raise ValueError("manifest is written after checksums are complete")
    archive.writestr(name, data, compress_type=ZIP_DEFLATED)
    checksums[name] = hashlib.sha256(data).hexdigest()


def add_stream(
    archive: ZipFile,
    name: str,
    source: IO[bytes],
    checksums: dict[str, str],
) -> int:
    canonical_name(name)
    digest = hashlib.sha256()
    size = 0
    with archive.open(name, mode="w", force_zip64=True) as target:
        while chunk := source.read(STREAM_CHUNK):
            size += len(chunk)
            if size > MAX_ENTRY_BYTES:
                raise _too_large()
            digest.update(chunk)
            target.write(chunk)
    checksums[name] = digest.hexdigest()
    return size


def manifest_bytes(
    *,
    exported_at: str,
    application_version: str,
    scope: str,
    source_space_id: str,
    checksums: Mapping[str, str],
    exported_by_source_id: str,
    personal_owner_source_id: str | None,
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
    return json_bytes(manifest)
