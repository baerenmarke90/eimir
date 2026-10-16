#!/usr/bin/env python3
"""Unit tests for the released Self-Hosted launcher boundary."""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts import self_hosted_release
from scripts.self_hosted_release import (
    DEPLOY_SEQUENCE,
    ReleaseOperationError,
    load_release_identity,
    read_dotenv,
    require_release_environment,
)


class ReleaseEnvironmentTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.env_file = Path(self._tmp.name) / ".env"

    def _write(self, environment: str) -> None:
        self.env_file.write_text(
            f"EIMIR_ENVIRONMENT={environment}\nEIMIR_RELEASE_VERSION=0.1.0\n",
            encoding="utf-8",
        )

    def _require_release_environment(self) -> None:
        require_release_environment(read_dotenv(self.env_file))

    def test_accepts_production_with_no_process_override(self) -> None:
        self._write("production")
        with mock.patch.dict(os.environ, {}, clear=True):
            self._require_release_environment()

    def test_rejects_development_dotenv(self) -> None:
        self._write("development")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                ReleaseOperationError, "requires exact EIMIR_ENVIRONMENT=production"
            ),
        ):
            self._require_release_environment()

    def test_rejects_process_override_away_from_production(self) -> None:
        self._write("production")
        with (
            mock.patch.dict(
                os.environ, {"EIMIR_ENVIRONMENT": "development"}, clear=True
            ),
            self.assertRaisesRegex(
                ReleaseOperationError, "must be unset or exactly production"
            ),
        ):
            self._require_release_environment()

    def test_accepts_explicit_production_process_environment(self) -> None:
        self._write("production")
        with mock.patch.dict(
            os.environ, {"EIMIR_ENVIRONMENT": "production"}, clear=True
        ):
            self._require_release_environment()

    def test_accepts_deprecated_dotenv_names_for_an_in_place_upgrade(self) -> None:
        self.env_file.write_text(
            "SBS_ENVIRONMENT=production\nSBS_RELEASE_VERSION=0.1.0\n",
            encoding="utf-8",
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            values = read_dotenv(self.env_file)
            require_release_environment(values)
        self.assertEqual(values["EIMIR_ENVIRONMENT"], "production")
        self.assertEqual(values["EIMIR_RELEASE_VERSION"], "0.1.0")

    def test_canonical_dotenv_name_wins_over_deprecated_alias(self) -> None:
        self.env_file.write_text(
            "EIMIR_ENVIRONMENT=production\nSBS_ENVIRONMENT=development\n"
            "EIMIR_RELEASE_VERSION=0.1.0\n",
            encoding="utf-8",
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            self._require_release_environment()

    def test_deprecated_process_name_is_checked(self) -> None:
        self._write("production")
        with (
            mock.patch.dict(os.environ, {"SBS_ENVIRONMENT": "development"}, clear=True),
            self.assertRaisesRegex(
                ReleaseOperationError, "must be unset or exactly production"
            ),
        ):
            self._require_release_environment()

    def test_rejects_missing_env_file(self) -> None:
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(ReleaseOperationError, "does not exist"),
        ):
            self._require_release_environment()


class ReleaseIdentityTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.identity_file = Path(self._tmp.name) / "self-hosted-image-identity.json"
        self.values = {"EIMIR_RELEASE_VERSION": "0.1.0"}

    def _write_identity(self, *, reference_version: str = "0.1.0") -> None:
        backend_digest = "sha256:" + "a" * 64
        web_digest = "sha256:" + "b" * 64
        identity = {
            "schemaVersion": 1,
            "kind": "eimir-self-hosted-image-identity",
            "product": {"version": "0.1.0", "tag": "v0.1.0"},
            "sourceRevision": "c" * 40,
            "images": {
                "backend": {
                    "reference": (
                        "ghcr.io/baerenmarke90/eimir-backend:"
                        f"v{reference_version}@{backend_digest}"
                    ),
                    "digest": backend_digest,
                    "roles": ["api", "worker", "migrate"],
                },
                "web": {
                    "reference": (
                        "ghcr.io/baerenmarke90/eimir-web:"
                        f"v{reference_version}@{web_digest}"
                    ),
                    "digest": web_digest,
                    "roles": ["web"],
                },
            },
        }
        self.identity_file.write_text(
            json.dumps(identity),
            encoding="utf-8",
        )

    def test_accepts_full_semver_digest_qualified_identity(self) -> None:
        self._write_identity()
        backend, web = load_release_identity(self.identity_file, self.values)
        self.assertIn(":v0.1.0@sha256:", backend)
        self.assertIn(":v0.1.0@sha256:", web)

    def test_rejects_reference_version_different_from_product(self) -> None:
        self._write_identity(reference_version="0.2.0")
        with self.assertRaisesRegex(
            ReleaseOperationError, "not the selected digest-qualified release"
        ):
            load_release_identity(self.identity_file, self.values)


class DeploySequenceTest(unittest.TestCase):
    """``deploy`` must migrate before it replaces any running service (#827)."""

    ENV_FILE = Path("release.env")
    IDENTITY = Path("identity.json")
    BACKEND = "ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:" + "a" * 64
    WEB = "ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:" + "b" * 64

    def _deploy(self, *, fail_on: str | None = None) -> list[list[str]]:
        commands: list[list[str]] = []

        def fake_run(command: list[str], *, action: str, environment: dict[str, str]) -> None:
            commands.append(command)
            if action == fail_on:
                raise ReleaseOperationError(f"{action} failed")

        with (
            mock.patch.object(self_hosted_release, "validate_release"),
            mock.patch.object(self_hosted_release, "run_checked", side_effect=fake_run),
        ):
            self_hosted_release.deploy_release(
                self.ENV_FILE, self.IDENTITY, backend=self.BACKEND, web=self.WEB
            )
        return commands

    @staticmethod
    def _compose_arguments(command: list[str]) -> tuple[str, ...]:
        return tuple(command[command.index("--file") + 2 :])

    def test_pull_then_database_then_migration_then_runtime(self) -> None:
        arguments = [self._compose_arguments(c) for c in self._deploy()]
        verbs = [a[0] for a in arguments]
        self.assertEqual(verbs, ["pull", "up", "run", "up"])
        self.assertEqual(arguments[1][-1], "postgres")
        self.assertEqual(arguments[2], ("run", "--rm", "--no-deps", "migrate"))
        self.assertIn("--force-recreate", arguments[3])
        self.assertNotIn("postgres", arguments[3])

    def test_a_failed_migration_never_reaches_runtime_replacement(self) -> None:
        commands: list[list[str]] = []

        def fake_run(command: list[str], *, action: str, environment: dict[str, str]) -> None:
            commands.append(command)
            if action == "Self-Hosted release migration":
                raise ReleaseOperationError("migration refused")

        with (
            mock.patch.object(self_hosted_release, "validate_release"),
            mock.patch.object(self_hosted_release, "run_checked", side_effect=fake_run),
            self.assertRaises(ReleaseOperationError),
        ):
            self_hosted_release.deploy_release(
                self.ENV_FILE, self.IDENTITY, backend=self.BACKEND, web=self.WEB
            )
        verbs = [self._compose_arguments(c)[0] for c in commands]
        self.assertEqual(verbs, ["pull", "up", "run"])
        self.assertFalse(
            any("--force-recreate" in self._compose_arguments(c) for c in commands)
        )

    def test_sequence_never_builds_and_always_uses_the_self_hosted_profile(self) -> None:
        for command in self._deploy():
            self.assertNotIn("build", command)
            self.assertEqual(command[command.index("--profile") + 1], "self-hosted")
        for _, arguments in DEPLOY_SEQUENCE:
            self.assertNotIn("build", arguments)
            self.assertNotIn("demo-init", arguments)


if __name__ == "__main__":
    unittest.main()
