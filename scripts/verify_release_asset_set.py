#!/usr/bin/env python3
"""Verify one GitHub Release asset set against locally validated release files."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


class AssetVerificationError(ValueError):
    """Raised when the staged/published Release asset set is not exact."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def expected_assets(root: Path) -> dict[str, tuple[int, str]]:
    if not root.is_dir():
        raise AssetVerificationError(f"Expected release root does not exist: {root}")

    result: dict[str, tuple[int, str]] = {}
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        name = path.name
        if name in result:
            raise AssetVerificationError(
                f"Release files contain duplicate asset basename {name!r}; "
                "GitHub Release assets are flat"
            )
        result[name] = (path.stat().st_size, sha256(path))
    if not result:
        raise AssetVerificationError("Expected release asset set is empty")
    return result


def _flatten_asset_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise AssetVerificationError("GitHub Release asset metadata must be a JSON array")
    if payload and all(isinstance(item, list) for item in payload):
        flattened: list[dict[str, Any]] = []
        for page in payload:
            for item in page:
                if not isinstance(item, dict):
                    raise AssetVerificationError("GitHub Release asset entry is not an object")
                flattened.append(item)
        return flattened
    if not all(isinstance(item, dict) for item in payload):
        raise AssetVerificationError("GitHub Release asset entry is not an object")
    return payload


def actual_assets(metadata_path: Path) -> dict[str, tuple[int, str]]:
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AssetVerificationError(
            f"Unable to read GitHub Release asset metadata: {metadata_path}"
        ) from exc

    result: dict[str, tuple[int, str]] = {}
    for item in _flatten_asset_payload(payload):
        name = item.get("name")
        size = item.get("size")
        digest = item.get("digest")
        if not isinstance(name, str) or not name:
            raise AssetVerificationError("GitHub Release asset has no valid name")
        if name in result:
            raise AssetVerificationError(f"GitHub Release contains duplicate asset {name!r}")
        if not isinstance(size, int) or size < 0:
            raise AssetVerificationError(f"GitHub Release asset {name!r} has no valid size")
        if not isinstance(digest, str) or not digest.startswith("sha256:"):
            raise AssetVerificationError(
                f"GitHub Release asset {name!r} has no authoritative sha256 digest"
            )
        digest_value = digest.removeprefix("sha256:")
        if len(digest_value) != 64 or any(
            character not in "0123456789abcdef" for character in digest_value
        ):
            raise AssetVerificationError(
                f"GitHub Release asset {name!r} has an invalid sha256 digest"
            )
        result[name] = (size, digest_value)
    return result


def verify_asset_set(expected_root: Path, metadata_path: Path) -> int:
    expected = expected_assets(expected_root)
    actual = actual_assets(metadata_path)

    expected_names = set(expected)
    actual_names = set(actual)
    if expected_names != actual_names:
        missing = sorted(expected_names - actual_names)
        unexpected = sorted(actual_names - expected_names)
        details: list[str] = []
        if missing:
            details.append("missing=" + ",".join(missing))
        if unexpected:
            details.append("unexpected=" + ",".join(unexpected))
        raise AssetVerificationError(
            "GitHub Release asset name set does not match local release evidence: "
            + "; ".join(details)
        )

    mismatches: list[str] = []
    for name in sorted(expected):
        expected_size, expected_digest = expected[name]
        actual_size, actual_digest = actual[name]
        if actual_size != expected_size:
            mismatches.append(
                f"{name}: size {actual_size} != expected {expected_size}"
            )
        if actual_digest != expected_digest:
            mismatches.append(f"{name}: sha256 digest mismatch")
    if mismatches:
        raise AssetVerificationError(
            "GitHub Release asset bytes do not match local release evidence: "
            + "; ".join(mismatches)
        )
    return len(expected)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-root", type=Path, required=True)
    parser.add_argument("--assets-json", type=Path, required=True)
    args = parser.parse_args()

    try:
        count = verify_asset_set(args.expected_root, args.assets_json)
    except AssetVerificationError as exc:
        parser.error(str(exc))
    print(f"Verified exact GitHub Release asset set: {count} assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
