"""Limits are parameters: value objects, command-line parsing and the writer's budgets."""

from __future__ import annotations

import argparse
import io
import logging
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from eimir_pro.portability import __main__ as cli
from eimir_pro.portability.archive import (
    DEFAULT_LIMITS,
    GIB,
    MIB,
    OPERATOR_LIMITS,
    BundleLimits,
    ExportWriter,
    manifest_bytes,
    validate_zip,
)

from eimir.core.errors import PayloadTooLargeError

MEDIA_ENTRY = "media/00000000-0000-0000-0000-000000000000/original"


def test_the_defaults_are_the_budgets_core_used_for_format_v1() -> None:
    assert (
        BundleLimits(
            max_compressed_bytes=512 * MIB,
            max_uncompressed_bytes=2 * GIB,
            max_entry_bytes=512 * MIB,
            max_entries=4096,
            max_compression_ratio=100,
            max_json_bytes=64 * MIB,
        )
        == DEFAULT_LIMITS
    )


def test_the_operator_defaults_hold_a_large_space_without_flags() -> None:
    assert OPERATOR_LIMITS.max_compressed_bytes >= 2 * GIB
    assert OPERATOR_LIMITS.max_compressed_bytes <= OPERATOR_LIMITS.max_uncompressed_bytes
    assert OPERATOR_LIMITS.max_entry_bytes == DEFAULT_LIMITS.max_entry_bytes


@pytest.mark.parametrize("value", [0, -1, True, 1.5, "10"])
def test_a_limit_must_be_a_positive_integer(value: object) -> None:
    with pytest.raises(ValueError):
        BundleLimits(max_entries=value)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("text", "expected"),
    [("512", 512), ("64KiB", 64 * 1024), ("512MiB", 512 * MIB), (" 2gib ", 2 * GIB), ("7 B", 7)],
)
def test_sizes_are_parsed_with_binary_units(text: str, expected: int) -> None:
    assert cli.parse_size(text) == expected


@pytest.mark.parametrize("text", ["", "GiB", "1.5GiB", "-1", "0", "5 TB", "ten"])
def test_a_malformed_size_is_refused(text: str) -> None:
    with pytest.raises(argparse.ArgumentTypeError):
        cli.parse_size(text)


def _args(*extra: str) -> argparse.Namespace:
    return cli.build_parser().parse_args(
        [
            "export",
            "--space",
            "01994da7-d368-7af0-8b72-568457cb3398",
            "--member",
            "01994da7-d369-7af0-8b72-568457cb3399",
            "--output",
            "bundle.zip",
            *extra,
        ]
    )


def test_without_flags_the_command_line_uses_the_operator_defaults() -> None:
    assert cli._limits(_args()) == OPERATOR_LIMITS


def test_each_flag_overrides_exactly_its_own_limit() -> None:
    limits = cli._limits(
        _args(
            "--max-bundle-size",
            "3GiB",
            "--max-unpacked-size",
            "9GiB",
            "--max-entry-size",
            "100MiB",
            "--max-entries",
            "77",
            "--max-json-size",
            "1MiB",
            "--max-compression-ratio",
            "5",
        )
    )
    assert limits == BundleLimits(
        max_compressed_bytes=3 * GIB,
        max_uncompressed_bytes=9 * GIB,
        max_entry_bytes=100 * MIB,
        max_entries=77,
        max_compression_ratio=5,
        max_json_bytes=MIB,
    )


def _write(limits: BundleLimits, payload: bytes, *, media: bool = False) -> None:
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        writer = ExportWriter(archive, output, limits)
        if media:
            writer.add_media(MEDIA_ENTRY, io.BytesIO(payload), {})
        else:
            writer.add_json("accounts.json", payload, {})


@pytest.mark.parametrize(
    ("limits", "payload", "media"),
    [
        (BundleLimits(max_json_bytes=4), b'{"a": 1}', False),
        (BundleLimits(max_entry_bytes=4), b"x" * 9, True),
        (BundleLimits(max_uncompressed_bytes=4), b"x" * 9, True),
        (BundleLimits(max_compressed_bytes=4), bytes(range(256)) * 4, True),
    ],
    ids=["json", "entry", "unpacked", "compressed"],
)
def test_the_writer_refuses_each_budget_it_was_given(
    limits: BundleLimits, payload: bytes, media: bool, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING), pytest.raises(PayloadTooLargeError):
        _write(limits, payload, media=media)
    if media:
        # The budget that failed is named in the log; no content is.
        assert "portability export exceeds a bundle limit" in caplog.text


def test_what_the_writer_accepts_the_reader_accepts_with_the_same_limits() -> None:
    limits = BundleLimits(max_entries=3, max_json_bytes=4096)
    output = io.BytesIO()
    checksums: dict[str, str] = {}
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        writer = ExportWriter(archive, output, limits)
        writer.add_json("accounts.json", b'{"members":[]}\n', checksums)
        writer.add_json(
            "manifest.json",
            manifest_bytes(
                exported_at="2026-11-23T00:00:00+00:00",
                application_version="0.1.0",
                scope="SHARED",
                source_space_id="01994da7-d368-7af0-8b72-568457cb3398",
                checksums=checksums,
                exported_by_source_id="01994da7-d369-7af0-8b72-568457cb3399",
                personal_owner_source_id=None,
                limits=limits,
            ),
            checksums,
        )
    output.seek(0)
    assert set(validate_zip(output, limits=limits).entries) == {"accounts.json", "manifest.json"}
