"""Focused regression tests for the Self-Hosted recovery archive contract."""

from __future__ import annotations

import hashlib
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import self_hosted_recovery

SPACE_ID = "01990000-0000-7000-8000-000000000101"
ATTACHMENT_ID = "01990000-0000-7000-8000-000000000301"
MEDIA_PATH = f"spaces/{SPACE_ID}/attachments/{ATTACHMENT_ID}/original"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tar_bytes(members: list[tuple[tarfile.TarInfo, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as archive:
        for info, content in members:
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))
    return buffer.getvalue()


def regular_member(name: str, content: bytes) -> tuple[tarfile.TarInfo, bytes]:
    return tarfile.TarInfo(name), content


class RecoveryArchiveValidationTest(unittest.TestCase):
    def write_backup(
        self,
        directory: Path,
        *,
        database_dump: bytes = b"synthetic-pg-custom-dump",
        media_archive: bytes | None = None,
        database_checksum: str | None = None,
        durable_object_count: int = 1,
        archive_format: str = self_hosted_recovery.ARCHIVE_FORMAT,
    ) -> Path:
        if media_archive is None:
            media_archive = tar_bytes([regular_member(MEDIA_PATH, b"durable-media")])
        manifest = {
            "format": archive_format,
            "formatVersion": self_hosted_recovery.ARCHIVE_VERSION,
            "createdAt": "2026-09-01T00:00:00Z",
            "sourceSchemaRevision": "0035_account_version",
            "database": {
                "file": "database.dump",
                "format": "postgresql-custom",
                "sha256": database_checksum or sha256(database_dump),
            },
            "media": {
                "file": "media.tar",
                "store": "local",
                "durableObjectCount": durable_object_count,
                "sha256": sha256(media_archive),
            },
            "excluded": ["configuration", "secrets", "temporary-or-unbound-media"],
        }
        archive_path = directory / "backup.tar"
        archive_path.write_bytes(
            tar_bytes(
                [
                    regular_member(
                        "manifest.json",
                        (json.dumps(manifest) + "\n").encode("utf-8"),
                    ),
                    regular_member("database.dump", database_dump),
                    regular_member("media.tar", media_archive),
                ]
            )
        )
        return archive_path

    def test_valid_archive_preserves_exact_durable_media_member_set(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = self.write_backup(temp)
            extraction = temp / "validated"
            extraction.mkdir()

            validated = self_hosted_recovery.validate_archive(archive_path, extraction)

            self.assertEqual(validated.media_paths, (MEDIA_PATH,))
            self.assertEqual(validated.manifest["sourceSchemaRevision"], "0035_account_version")

    def test_legacy_archive_format_remains_restorable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = self.write_backup(
                temp,
                archive_format=self_hosted_recovery.LEGACY_ARCHIVE_FORMAT,
            )
            extraction = temp / "validated"
            extraction.mkdir()

            validated = self_hosted_recovery.validate_archive(archive_path, extraction)

            self.assertEqual(
                validated.manifest["format"],
                self_hosted_recovery.LEGACY_ARCHIVE_FORMAT,
            )

    def test_modified_database_dump_is_rejected_by_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = self.write_backup(
                temp,
                database_checksum=sha256(b"different-dump"),
            )
            extraction = temp / "validated"
            extraction.mkdir()

            with self.assertRaisesRegex(
                self_hosted_recovery.RecoveryError,
                "database dump checksum",
            ):
                self_hosted_recovery.validate_archive(archive_path, extraction)

    def test_media_path_traversal_is_rejected(self) -> None:
        media_archive = tar_bytes([regular_member(f"../{MEDIA_PATH}", b"outside-target")])
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = self.write_backup(temp, media_archive=media_archive)
            extraction = temp / "validated"
            extraction.mkdir()

            with self.assertRaisesRegex(
                self_hosted_recovery.RecoveryError,
                "unsafe member",
            ):
                self_hosted_recovery.validate_archive(archive_path, extraction)

    def test_media_link_is_rejected_even_with_a_valid_path(self) -> None:
        link = tarfile.TarInfo(MEDIA_PATH)
        link.type = tarfile.SYMTYPE
        link.linkname = "/etc/passwd"
        media_archive = tar_bytes([(link, b"")])
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = self.write_backup(temp, media_archive=media_archive)
            extraction = temp / "validated"
            extraction.mkdir()

            with self.assertRaisesRegex(
                self_hosted_recovery.RecoveryError,
                "unsafe member",
            ):
                self_hosted_recovery.validate_archive(archive_path, extraction)

    def test_unexpected_outer_member_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            temp = Path(temp_name)
            archive_path = temp / "backup.tar"
            archive_path.write_bytes(
                tar_bytes(
                    [
                        regular_member("manifest.json", b"{}"),
                        regular_member("database.dump", b"dump"),
                        regular_member("media.tar", b"media"),
                        regular_member("extra", b"unexpected"),
                    ]
                )
            )
            extraction = temp / "validated"
            extraction.mkdir()

            with self.assertRaisesRegex(
                self_hosted_recovery.RecoveryError,
                "member set",
            ):
                self_hosted_recovery.validate_archive(archive_path, extraction)


class ComposeSubprocessEnvironmentTest(unittest.TestCase):
    """An operator-supplied environment must not widen the active profile.

    Docker Compose's active profile set is the union of ``--profile`` and
    ``COMPOSE_PROFILES``, not an override. Without pinning ``COMPOSE_PROFILES``
    in the subprocess environment, a ``--env-file`` that sets
    ``COMPOSE_PROFILES=cloud`` would silently add cloud services alongside
    self-hosted recovery instead of being excluded (#746 review).
    """

    def test_forces_self_hosted_regardless_of_ambient_profiles(self) -> None:
        with mock.patch.dict("os.environ", {"COMPOSE_PROFILES": "cloud,dev-db"}, clear=False):
            env = self_hosted_recovery._compose_subprocess_env()
        self.assertEqual(env["COMPOSE_PROFILES"], "self-hosted")

    def test_every_compose_invocation_uses_the_forced_environment(self) -> None:
        with (
            mock.patch.dict("os.environ", {"COMPOSE_PROFILES": "cloud"}, clear=False),
            mock.patch(
                "subprocess.run",
                return_value=mock.Mock(returncode=0, stdout=b"", stderr=b""),
            ) as mock_run,
        ):
            self_hosted_recovery._run(["docker", "volume", "inspect", "x"], check=False)
        self.assertEqual(mock_run.call_args.kwargs["env"]["COMPOSE_PROFILES"], "self-hosted")


if __name__ == "__main__":
    unittest.main()
