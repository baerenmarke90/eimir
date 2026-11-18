#!/usr/bin/env python3
"""Config-digest identity of Docker save archives from both image stores (#1449)."""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import image_archive_config  # noqa: E402

TAG = "eimir-backend:evidence-0123456789abcdef0123456789abcdef01234567"
CONFIG = b'{"architecture":"amd64","os":"linux","config":{"Labels":{"a":"b"}}}'
CONFIG_HEX = hashlib.sha256(CONFIG).hexdigest()


def write_archive(path: Path, members: dict[str, bytes]) -> None:
    with tarfile.open(path, mode="w") as archive:
        for name, content in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))


def legacy_members(config: bytes = CONFIG, tag: str = TAG) -> dict[str, bytes]:
    """The classic overlay2 `docker save` layout: `<config-hex>.json`."""
    name = hashlib.sha256(config).hexdigest()
    manifest = [{"Config": f"{name}.json", "RepoTags": [tag], "Layers": []}]
    return {f"{name}.json": config, "manifest.json": json.dumps(manifest).encode()}


def containerd_members(config: bytes = CONFIG, tag: str = TAG) -> dict[str, bytes]:
    """The containerd store layout: OCI layout with `blobs/sha256/<config-hex>`.

    The image index (with an extra attestation manifest) is what `docker image
    inspect` reports as the image ID there, so it must never be the identity.
    """
    name = hashlib.sha256(config).hexdigest()
    manifest = [{"Config": f"blobs/sha256/{name}", "RepoTags": [tag], "Layers": []}]
    return {
        "oci-layout": b'{"imageLayoutVersion":"1.0.0"}',
        "index.json": b'{"schemaVersion":2,"manifests":[{},{}]}',
        f"blobs/sha256/{name}": config,
        "manifest.json": json.dumps(manifest).encode(),
    }


class ArchiveConfigDigestTest(unittest.TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.path = Path(self._directory.name) / "image.tar"

    def test_legacy_and_containerd_archives_yield_the_same_config_digest(self) -> None:
        for name, members in (
            ("legacy", legacy_members()),
            ("containerd", containerd_members()),
        ):
            with self.subTest(store=name):
                write_archive(self.path, members)
                self.assertEqual(
                    image_archive_config.archive_config_digest(self.path, TAG),
                    "sha256:" + CONFIG_HEX,
                )

    def test_tag_is_optional_for_a_pulled_digest_archive(self) -> None:
        members = legacy_members(tag="ghcr.io/o/eimir-backend:publish-1")
        write_archive(self.path, members)
        self.assertEqual(
            image_archive_config.archive_config_digest(self.path), "sha256:" + CONFIG_HEX
        )
        with self.assertRaisesRegex(image_archive_config.ArchiveConfigError, "tag"):
            image_archive_config.archive_config_digest(self.path, TAG)

    def test_tampered_misnamed_ambiguous_or_extra_images_are_refused(self) -> None:
        name = hashlib.sha256(CONFIG).hexdigest()
        two = json.dumps(
            [{"Config": f"{name}.json", "RepoTags": [TAG]}] * 2
        ).encode()
        escaping = json.dumps([{"Config": "../escape.json", "RepoTags": [TAG]}]).encode()
        cases = {
            "tampered bytes": {**legacy_members(), f"{name}.json": CONFIG + b" "},
            "two images": {**legacy_members(), "manifest.json": two},
            "path escape": {**legacy_members(), "manifest.json": escaping},
            "no manifest": {f"{name}.json": CONFIG},
            "not json": {**legacy_members(), "manifest.json": b"not json"},
        }
        for label, members in cases.items():
            with self.subTest(case=label):
                write_archive(self.path, members)
                with self.assertRaises(image_archive_config.ArchiveConfigError):
                    image_archive_config.archive_config_digest(self.path, TAG)

    def test_duplicate_config_member_is_ambiguous(self) -> None:
        members = legacy_members()
        with tarfile.open(self.path, mode="w") as archive:
            for name, content in members.items():
                for _ in range(2 if name.endswith(".json") and name != "manifest.json" else 1):
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    archive.addfile(info, io.BytesIO(content))
        with self.assertRaisesRegex(image_archive_config.ArchiveConfigError, "ambiguous"):
            image_archive_config.archive_config_digest(self.path, TAG)

    def test_unreadable_archive_is_refused(self) -> None:
        self.path.write_bytes(b"not a tar archive")
        with self.assertRaises(image_archive_config.ArchiveConfigError):
            image_archive_config.archive_config_digest(self.path)
        with self.assertRaises(image_archive_config.ArchiveConfigError):
            image_archive_config.archive_config_digest(self.path.with_name("missing.tar"))

    def test_command_line_prints_the_digest_or_fails_closed(self) -> None:
        script = ROOT / "scripts/image_archive_config.py"
        write_archive(self.path, containerd_members())
        good = subprocess.run(
            [sys.executable, "-I", str(script), str(self.path), "--tag", TAG],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual((good.returncode, good.stdout.strip()), (0, "sha256:" + CONFIG_HEX))
        wrong = subprocess.run(
            [sys.executable, "-I", str(script), str(self.path), "--tag", "other:tag"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual((wrong.returncode, wrong.stdout), (1, ""))
        self.assertIn("tag", wrong.stderr)


if __name__ == "__main__":
    unittest.main()
