#!/usr/bin/env python3
"""Unit tests for the verified-checkout Compose wrapper's own safety checks.

These do not invoke Docker; they cover the pure precondition checks that run
before ``compose_checked.py`` ever shells out.
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from scripts.compose_checked import (
    CheckoutError,
    compose_project_name,
    dotenv_value,
    reject_production_environment,
    require_self_hosted_secrets,
)


class IdentityMigrationCompatibilityTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "eimir"
        self.root.mkdir()
        self.env_file = self.root / ".env"

    def test_dotenv_reads_deprecated_alias(self) -> None:
        self.env_file.write_text("SBS_ENVIRONMENT=development\n", encoding="utf-8")
        self.assertEqual(
            dotenv_value(self.env_file, "EIMIR_ENVIRONMENT"), "development"
        )

    def test_dotenv_canonical_name_wins_even_when_alias_follows(self) -> None:
        self.env_file.write_text(
            "EIMIR_ENVIRONMENT=test\nSBS_ENVIRONMENT=development\n",
            encoding="utf-8",
        )
        self.assertEqual(dotenv_value(self.env_file, "EIMIR_ENVIRONMENT"), "test")

    def test_explicit_compose_project_name_survives_checkout_rename(self) -> None:
        self.env_file.write_text(
            "COMPOSE_PROJECT_NAME=existing_install\n", encoding="utf-8"
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                compose_project_name(self.root, self.env_file),
                "existing_install",
            )

    def test_process_compose_project_name_wins_over_dotenv(self) -> None:
        self.env_file.write_text(
            "COMPOSE_PROJECT_NAME=dotenv_install\n", encoding="utf-8"
        )
        with mock.patch.dict(
            os.environ, {"COMPOSE_PROJECT_NAME": "existing_install"}, clear=True
        ):
            self.assertEqual(
                compose_project_name(self.root, self.env_file),
                "existing_install",
            )


class RequireSelfHostedSecretsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.env_file = Path(self._tmp.name) / ".env"

    def _write_env(self, contents: str) -> None:
        self.env_file.write_text(contents, encoding="utf-8")

    def test_refuses_when_env_file_is_missing(self) -> None:
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaises(CheckoutError),
        ):
            require_self_hosted_secrets(self.env_file)

    def test_refuses_a_blank_password(self) -> None:
        self._write_env("POSTGRES_USER=eimir\nPOSTGRES_PASSWORD=\n")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaises(CheckoutError) as ctx,
        ):
            require_self_hosted_secrets(self.env_file)
        self.assertIn("POSTGRES_PASSWORD", str(ctx.exception))

    def test_refuses_a_missing_password_line(self) -> None:
        self._write_env("POSTGRES_USER=eimir\n")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaises(CheckoutError),
        ):
            require_self_hosted_secrets(self.env_file)

    def test_accepts_credentials_from_the_env_file(self) -> None:
        self._write_env(
            "POSTGRES_USER=eimir\nPOSTGRES_PASSWORD=a-real-secret # local\n"
        )
        with mock.patch.dict(os.environ, {}, clear=True):
            require_self_hosted_secrets(self.env_file)

    def test_process_environment_can_supply_the_password_instead(self) -> None:
        self._write_env("POSTGRES_USER=eimir\n")
        with mock.patch.dict(
            os.environ, {"POSTGRES_PASSWORD": "a-real-secret"}, clear=True
        ):
            require_self_hosted_secrets(self.env_file)

    def test_process_environment_blank_value_does_not_fall_back_to_the_file(
        self,
    ) -> None:
        self._write_env("POSTGRES_USER=eimir\nPOSTGRES_PASSWORD=a-real-secret\n")
        with (
            mock.patch.dict(os.environ, {"POSTGRES_PASSWORD": ""}, clear=True),
            self.assertRaises(CheckoutError),
        ):
            require_self_hosted_secrets(self.env_file)


class RejectProductionEnvironmentTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.env_file = Path(self._tmp.name) / ".env"

    def _write_env(self, environment: str) -> None:
        self.env_file.write_text(f"EIMIR_ENVIRONMENT={environment}\n", encoding="utf-8")

    def test_accepts_development_only(self) -> None:
        self._write_env("development # local verification")
        with mock.patch.dict(os.environ, {}, clear=True):
            reject_production_environment(self.env_file)

    def test_rejects_production_dotenv(self) -> None:
        self._write_env("production")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_rejects_export_prefixed_production_dotenv(self) -> None:
        self.env_file.write_text(
            "export EIMIR_ENVIRONMENT=production\n", encoding="utf-8"
        )
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_last_duplicate_environment_assignment_wins(self) -> None:
        self.env_file.write_text(
            "EIMIR_ENVIRONMENT=development\nEIMIR_ENVIRONMENT=production\n",
            encoding="utf-8",
        )
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_rejects_production_with_inline_comment(self) -> None:
        self._write_env("production # deployed")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_rejects_quoted_production_with_trailing_comment(self) -> None:
        self._write_env('"production" # deployed')
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_rejects_production_process_environment(self) -> None:
        self._write_env("development")
        with (
            mock.patch.dict(
                os.environ, {"EIMIR_ENVIRONMENT": "production"}, clear=True
            ),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_development_process_override_cannot_mask_production_dotenv(self) -> None:
        self._write_env("production # deployed")
        with (
            mock.patch.dict(
                os.environ, {"EIMIR_ENVIRONMENT": "development"}, clear=True
            ),
            self.assertRaisesRegex(
                CheckoutError, "verified source builds are not allowed"
            ),
        ):
            reject_production_environment(self.env_file)

    def test_rejects_ambiguous_interpolated_environment(self) -> None:
        self._write_env("${DEPLOYMENT_MODE:-production}")
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                CheckoutError, "explicit development, demo, or test"
            ),
        ):
            reject_production_environment(self.env_file)


if __name__ == "__main__":
    unittest.main()
