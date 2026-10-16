#!/usr/bin/env python3
"""Unit tests for the Development/CI source-image build boundary."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.build_self_hosted_source import SourceBuildError, plan, require_local_tag


class LocalImageTagTest(unittest.TestCase):
    def test_accepts_expected_local_repositories(self) -> None:
        self.assertEqual(
            require_local_tag(
                "eimir-backend:source-local",
                "backend",
                "eimir-backend",
            ),
            "eimir-backend:source-local",
        )
        self.assertEqual(
            require_local_tag(
                "eimir-web:verified-0123456789ab",
                "web",
                "eimir-web",
            ),
            "eimir-web:verified-0123456789ab",
        )

    def test_rejects_registry_digest_wrong_repository_and_option_like_values(
        self,
    ) -> None:
        invalid = (
            "ghcr.io/baerenmarke90/eimir-backend:v0.1.0",
            "eimir-backend:source@sha256:" + "a" * 64,
            "registry.example/eimir-backend:source-local",
            "eimir-web:source-local",
            "eimir-backend:--load",
            "eimir-backend:",
            "eimir-backend:bad/tag",
        )
        for reference in invalid:
            with self.subTest(reference=reference):
                with self.assertRaises(SourceBuildError):
                    require_local_tag(reference, "backend", "eimir-backend")


class SourceBuildPlanTest(unittest.TestCase):
    PRODUCTION_ERROR = (
        "source builds are not allowed when EIMIR_ENVIRONMENT=production is declared"
    )

    def write_env(self, *lines: str) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temporary = tempfile.TemporaryDirectory()
        env_file = Path(temporary.name) / ".env"
        env_file.write_text("\n".join((*lines, "")), encoding="utf-8")
        return temporary, env_file

    def test_env_plan_uses_explicit_local_images_and_source_contexts(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_BUILD_REVISION=0123456789abcdef0123456789abcdef01234567",
            "EIMIR_BACKEND_BUILD_CONTEXT=https://github.com/example/project.git#main:backend",
            "EIMIR_WEB_BUILD_CONTEXT=https://github.com/example/project.git#main:web",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-ci",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-ci",
            "EIMIR_DEMO_MODE=false",
        )
        with temporary, patch.dict(os.environ, {}, clear=True):
            build_plan = plan(env_file)

        self.assertEqual(build_plan["backendImage"], "eimir-backend:source-ci")
        self.assertEqual(build_plan["webImage"], "eimir-web:source-ci")
        self.assertEqual(
            build_plan["backendContext"],
            "https://github.com/example/project.git#main:backend",
        )
        self.assertEqual(
            build_plan["webContext"],
            "https://github.com/example/project.git#main:web",
        )

    def test_deprecated_env_names_build_the_canonical_plan(self) -> None:
        temporary, env_file = self.write_env(
            "SBS_ENVIRONMENT=development",
            "SBS_BUILD_REVISION=0123456789abcdef0123456789abcdef01234567",
            "SBS_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:legacy-config",
            "SBS_SELF_HOSTED_WEB_IMAGE=eimir-web:legacy-config",
        )
        with temporary, patch.dict(os.environ, {}, clear=True):
            build_plan = plan(env_file)

        self.assertEqual(
            build_plan["revision"], "0123456789abcdef0123456789abcdef01234567"
        )
        self.assertEqual(build_plan["backendImage"], "eimir-backend:legacy-config")
        self.assertEqual(build_plan["webImage"], "eimir-web:legacy-config")

    def test_canonical_env_name_wins_over_deprecated_alias(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "SBS_ENVIRONMENT=production",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:canonical",
            "SBS_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:legacy",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:canonical",
            "SBS_SELF_HOSTED_WEB_IMAGE=eimir-web:legacy",
        )
        with temporary, patch.dict(os.environ, {}, clear=True):
            build_plan = plan(env_file)

        self.assertEqual(build_plan["backendImage"], "eimir-backend:canonical")
        self.assertEqual(build_plan["webImage"], "eimir-web:canonical")

    def test_registry_target_in_env_is_rejected_before_docker_execution(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=ghcr.io/baerenmarke90/eimir-backend:v0.1.0",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaises(SourceBuildError),
        ):
            plan(env_file)

    def test_production_dotenv_is_rejected_before_source_build(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=production",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_export_prefixed_production_dotenv_is_rejected(self) -> None:
        temporary, env_file = self.write_env(
            "export EIMIR_ENVIRONMENT=production",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_last_duplicate_environment_assignment_wins(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_ENVIRONMENT=production",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_production_with_compose_inline_comment_is_rejected(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=production # deployed",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_quoted_production_with_trailing_comment_is_rejected(self) -> None:
        temporary, env_file = self.write_env(
            'EIMIR_ENVIRONMENT="production" # deployed',
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_process_environment_cannot_override_development_into_production(
        self,
    ) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {"EIMIR_ENVIRONMENT": "production"}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_process_development_cannot_mask_production_dotenv(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=production # deployed",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {"EIMIR_ENVIRONMENT": "development"}, clear=True),
            self.assertRaisesRegex(SourceBuildError, self.PRODUCTION_ERROR),
        ):
            plan(env_file)

    def test_ambiguous_interpolated_environment_is_rejected(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=${DEPLOYMENT_MODE:-production}",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                SourceBuildError, "explicit development, demo, or test"
            ),
        ):
            plan(env_file)

    def test_authenticated_git_urls_are_rejected_before_plan_output(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_BACKEND_BUILD_CONTEXT=https://user:token@example.invalid/project.git#main:backend",
            "EIMIR_WEB_BUILD_CONTEXT=https://example.invalid/project.git#main:web",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                SourceBuildError, "must not contain URL credentials"
            ),
        ):
            plan(env_file)

    def test_query_bearing_git_urls_are_rejected_before_plan_output(self) -> None:
        temporary, env_file = self.write_env(
            "EIMIR_ENVIRONMENT=development",
            "EIMIR_BACKEND_BUILD_CONTEXT=https://example.invalid/project.git?token=secret#main:backend",
            "EIMIR_WEB_BUILD_CONTEXT=https://example.invalid/project.git#main:web",
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local",
            "EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local",
        )
        with (
            temporary,
            patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                SourceBuildError, "must not contain URL query values"
            ),
        ):
            plan(env_file)


if __name__ == "__main__":
    unittest.main()
