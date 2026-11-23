"""Security-focused tests for the portability tool's ZIP boundary (hostile archives)."""

from __future__ import annotations

import hashlib
import io
import json
import stat
import warnings
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

import pytest
from eimir_pro.portability import archive as transfer_archive
from eimir_pro.portability.archive import BundleLimits, TransferArchiveError, validate_zip

from eimir.core.errors import ErrorCode


def _json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _bundle(
    entries: dict[str, bytes] | None = None,
    *,
    scope: str = "SHARED",
    format_version: int = 1,
    checksum_override: dict[str, str] | None = None,
    extra_manifest: dict[str, object] | None = None,
) -> io.BytesIO:
    content = entries or {"accounts.json": _json({"members": []})}
    checksums = {name: hashlib.sha256(data).hexdigest() for name, data in content.items()}
    checksums.update(checksum_override or {})
    manifest = {
        "formatVersion": format_version,
        "exportedAt": "2026-08-31T10:00:00+00:00",
        "applicationVersion": "0.1.0",
        "scope": scope,
        "sourceSpaceId": "01994da7-d368-7af0-8b72-568457cb3398",
        "checksums": checksums,
        **(extra_manifest or {}),
    }
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as bundle:
        for name, data in content.items():
            bundle.writestr(name, data)
        bundle.writestr("manifest.json", _json(manifest))
    output.seek(0)
    return output


def _assert_code(bundle: io.BytesIO, code: str) -> None:
    with pytest.raises(TransferArchiveError) as caught:
        validate_zip(bundle, compressed_size=len(bundle.getvalue()))
    assert caught.value.code == code


def test_entry_names_require_portable_separators() -> None:
    # ZipInfo may normalize filenames written on Windows before serialization.
    with pytest.raises(TransferArchiveError) as caught:
        transfer_archive.canonical_name("private\\notes.json")
    assert caught.value.code == ErrorCode.TRANSFER_ARCHIVE_UNSAFE


def test_valid_bundle_is_accepted() -> None:
    validated = validate_zip(_bundle())
    assert validated.manifest["formatVersion"] == 1
    assert set(validated.entries) == {"accounts.json", "manifest.json"}


@pytest.mark.parametrize(
    "name",
    [
        "../accounts.json",
        "/accounts.json",
        "C:/accounts.json",
        "CON",
        "media/../accounts.json",
    ],
)
def test_unsafe_paths_are_rejected(name: str) -> None:
    _assert_code(_bundle({name: b"x"}), ErrorCode.TRANSFER_ARCHIVE_UNSAFE)


@pytest.mark.parametrize(
    "name",
    [
        "credentials.json",
        "sessions.json",
        "jobs.json",
        "outbox.json",
        "entitlements.json",
        "cache.json",
    ],
)
def test_security_runtime_entitlement_and_cache_entries_are_not_portable(name: str) -> None:
    entries = {
        "accounts.json": _json({"members": []}),
        name: _json({"forbidden": True}),
    }
    _assert_code(_bundle(entries), ErrorCode.TRANSFER_ARCHIVE_UNSAFE)


def test_duplicate_entry_is_rejected() -> None:
    accounts = _json({"members": []})
    manifest = {
        "formatVersion": 1,
        "exportedAt": "2026-08-31T10:00:00+00:00",
        "applicationVersion": "0.1.0",
        "scope": "SHARED",
        "sourceSpaceId": "01994da7-d368-7af0-8b72-568457cb3398",
        "checksums": {"accounts.json": hashlib.sha256(accounts).hexdigest()},
    }
    output = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as bundle:
            bundle.writestr("accounts.json", accounts)
            bundle.writestr("accounts.json", accounts)
            bundle.writestr("manifest.json", _json(manifest))
    output.seek(0)
    _assert_code(output, ErrorCode.TRANSFER_ARCHIVE_UNSAFE)


def test_symlink_entry_is_rejected() -> None:
    output = _bundle()
    entries: list[tuple[ZipInfo, bytes]] = []
    with ZipFile(output, "r") as source:
        for info in source.infolist():
            entries.append((info, source.read(info)))
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as bundle:
        for info, data in entries:
            if info.filename == "accounts.json":
                link = ZipInfo("accounts.json")
                link.create_system = 3
                link.external_attr = (stat.S_IFLNK | 0o777) << 16
                bundle.writestr(link, data)
            else:
                bundle.writestr(info, data)
    output.seek(0)
    _assert_code(output, ErrorCode.TRANSFER_ARCHIVE_UNSAFE)


def test_checksum_mismatch_is_rejected() -> None:
    _assert_code(
        _bundle(checksum_override={"accounts.json": "0" * 64}),
        ErrorCode.TRANSFER_CHECKSUM_MISMATCH,
    )


def test_unsupported_format_is_rejected() -> None:
    _assert_code(_bundle(format_version=2), ErrorCode.TRANSFER_FORMAT_UNSUPPORTED)


def test_shared_bundle_cannot_contain_private_entries() -> None:
    entries = {
        "accounts.json": _json({"members": []}),
        "private/notes.json": _json({"tables": []}),
    }
    _assert_code(_bundle(entries, scope="SHARED"), ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID)


def test_json_entry_limit_is_checked_before_read() -> None:
    with pytest.raises(Exception) as caught:
        validate_zip(
            _bundle({"accounts.json": b"{" + b" " * 32 + b"}"}),
            limits=BundleLimits(max_json_bytes=16),
        )
    assert getattr(caught.value, "code", None) == ErrorCode.TRANSFER_TOO_LARGE


def test_compression_ratio_is_bounded() -> None:
    with pytest.raises(Exception) as caught:
        validate_zip(_bundle({"accounts.json": b"A" * 100_000}))
    assert getattr(caught.value, "code", None) == ErrorCode.TRANSFER_TOO_LARGE


def test_legacy_weekly_feedback_entry_is_accepted_and_never_imported() -> None:
    """Exports before #2210 carried retired ratings: still valid, but ignored on import."""
    from eimir_pro.portability import allowlist

    assert "private/weekly-insight-feedback.json" not in allowlist.FILE_TABLES
    entries = {
        "accounts.json": _json({"members": []}),
        "private/weekly-insight-feedback.json": _json({"tables": []}),
    }
    validated = validate_zip(_bundle(entries, scope="PERSONAL"))
    assert "private/weekly-insight-feedback.json" in validated.entries
    _assert_code(_bundle(entries, scope="SHARED"), ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID)


def test_the_schema_revision_of_a_bundle_is_optional_and_must_be_text() -> None:
    assert validate_zip(_bundle()).manifest.get("schemaRevision") is None
    assert (
        validate_zip(_bundle(extra_manifest={"schemaRevision": "0174"})).manifest["schemaRevision"]
        == "0174"
    )
    for bad in (174, "", ["0174"]):
        _assert_code(
            _bundle(extra_manifest={"schemaRevision": bad}), ErrorCode.TRANSFER_MANIFEST_INVALID
        )


@pytest.mark.parametrize(
    ("limits", "bundle"),
    [
        (BundleLimits(max_entries=1), _bundle),
        (BundleLimits(max_entry_bytes=8), _bundle),
        (BundleLimits(max_uncompressed_bytes=8), _bundle),
        (
            BundleLimits(max_compression_ratio=1),
            lambda: _bundle({"accounts.json": bytes(range(256)) * 2}),
        ),
    ],
    ids=["entries", "entry-bytes", "unpacked-bytes", "ratio"],
)
def test_every_limit_is_a_parameter_of_the_reader(limits: BundleLimits, bundle) -> None:  # type: ignore[no-untyped-def]
    source = bundle()
    with pytest.raises(Exception) as caught:
        validate_zip(source, limits=limits)
    assert getattr(caught.value, "code", None) == ErrorCode.TRANSFER_TOO_LARGE
    # The same file passes under the default limits: the parameter alone decided.
    source.seek(0)
    assert validate_zip(source).manifest["formatVersion"] == 1


def test_the_compressed_size_limit_is_a_parameter_of_the_reader() -> None:
    source = _bundle()
    size = len(source.getvalue())
    validate_zip(source, compressed_size=size, limits=BundleLimits(max_compressed_bytes=size))
    with pytest.raises(Exception) as caught:
        validate_zip(
            source, compressed_size=size, limits=BundleLimits(max_compressed_bytes=size - 1)
        )
    assert getattr(caught.value, "code", None) == ErrorCode.TRANSFER_TOO_LARGE
