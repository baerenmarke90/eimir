#!/usr/bin/env python3
"""Tests for complete GitHub Release asset-set verification."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/verify_release_asset_set.py"
SPEC = importlib.util.spec_from_file_location("verify_release_asset_set", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

AssetVerificationError = MODULE.AssetVerificationError
verify_asset_set = MODULE.verify_asset_set


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class VerifyReleaseAssetSetTest(unittest.TestCase):
    def write_fixture(
        self,
        root: Path,
        files: dict[str, bytes],
        *,
        mutate: dict[str, object] | None = None,
    ) -> tuple[Path, Path]:
        expected = root / "release-evidence"
        expected.mkdir()
        assets: list[dict[str, object]] = []
        for relative, content in files.items():
            path = expected / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            assets.append(
                {
                    "name": path.name,
                    "size": len(content),
                    "digest": f"sha256:{digest(content)}",
                }
            )
        if mutate:
            for asset in assets:
                if asset["name"] == mutate.get("name"):
                    asset.update(mutate)
        metadata = root / "assets.json"
        metadata.write_text(json.dumps(assets), encoding="utf-8")
        return expected, metadata

    def test_accepts_exact_name_size_and_digest_set(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            expected, metadata = self.write_fixture(
                Path(temporary),
                {
                    "android/app.apk": b"apk",
                    "sbom/app.spdx.json": b"sbom",
                    "eimir-release-manifest.json": b"manifest",
                },
            )
            self.assertEqual(verify_asset_set(expected, metadata), 3)

    def test_rejects_missing_asset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected, metadata = self.write_fixture(
                root,
                {"one.txt": b"one", "two.txt": b"two"},
            )
            assets = json.loads(metadata.read_text(encoding="utf-8"))
            metadata.write_text(json.dumps(assets[:1]), encoding="utf-8")
            with self.assertRaisesRegex(AssetVerificationError, "name set"):
                verify_asset_set(expected, metadata)

    def test_rejects_digest_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            expected, metadata = self.write_fixture(
                Path(temporary),
                {"one.txt": b"one"},
                mutate={"name": "one.txt", "digest": "sha256:" + "0" * 64},
            )
            with self.assertRaisesRegex(AssetVerificationError, "digest mismatch"):
                verify_asset_set(expected, metadata)

    def test_rejects_flat_asset_name_collision(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = root / "release-evidence"
            (expected / "one").mkdir(parents=True)
            (expected / "two").mkdir(parents=True)
            (expected / "one/same.json").write_text("one", encoding="utf-8")
            (expected / "two/same.json").write_text("two", encoding="utf-8")
            metadata = root / "assets.json"
            metadata.write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(AssetVerificationError, "duplicate asset basename"):
                verify_asset_set(expected, metadata)

    def test_accepts_slurped_paginated_asset_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            expected, metadata = self.write_fixture(
                Path(temporary),
                {"one.txt": b"one", "two.txt": b"two"},
            )
            assets = json.loads(metadata.read_text(encoding="utf-8"))
            metadata.write_text(json.dumps([[assets[0]], [assets[1]]]), encoding="utf-8")
            self.assertEqual(verify_asset_set(expected, metadata), 2)


if __name__ == "__main__":
    unittest.main()
