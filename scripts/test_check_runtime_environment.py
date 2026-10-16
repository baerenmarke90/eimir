#!/usr/bin/env python3
"""Unit tests for runtime environment drift detection."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.check_runtime_environment import (
    check_dotenv_to_rendered,
    check_production_image_identity,
    check_published_release_image_identity,
    check_rendered_to_running,
    parse_container_environment,
    parse_dotenv,
)

INSTANCE_ID = "11111111-2222-4333-8444-555555555555"
SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567"
BACKEND = "ghcr.io/baerenmarke90/eimir-backend:v0.1.0"
WEB = "ghcr.io/baerenmarke90/eimir-web:v0.1.0"
BACKEND_DIGEST = "a" * 64
WEB_DIGEST = "b" * 64
BACKEND_PINNED = f"{BACKEND}@sha256:{BACKEND_DIGEST}"
WEB_PINNED = f"{WEB}@sha256:{WEB_DIGEST}"


def rendered(
    instance_id: str = INSTANCE_ID, environment: str = "production"
) -> dict[str, dict[str, str]]:
    common = {
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": instance_id,
        "EIMIR_ENVIRONMENT": environment,
        "EIMIR_DEPLOYMENT": "self_hosted",
        "EIMIR_PUBLIC_BASE_URL": "https://example.invalid",
        "EIMIR_CURSOR_SIGNING_KEY": "not-printed-secret",
    }
    return {"api": dict(common), "worker": dict(common)}


def image_config(
    *,
    backend: str = BACKEND,
    web: str = WEB,
    worker: str | None = None,
    migrate: str | None = None,
    pull_policy: str = "always",
    build: bool = False,
) -> dict[str, object]:
    def service(image: str) -> dict[str, object]:
        value: dict[str, object] = {"image": image, "pull_policy": pull_policy}
        if build:
            value["build"] = {"context": "./backend"}
        return value

    return {
        "services": {
            "migrate": service(migrate or backend),
            "api": service(backend),
            "worker": service(worker or backend),
            "web": service(web),
        }
    }


def release_identity(
    *,
    version: str = "0.1.0",
    backend: str = BACKEND_PINNED,
    web: str = WEB_PINNED,
) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "kind": "eimir-self-hosted-image-identity",
        "product": {"version": version, "tag": f"v{version}"},
        "sourceRevision": SOURCE_REVISION,
        "releaseManifest": "eimir-release-manifest.json",
        "images": {
            "backend": {
                "reference": backend,
                "digest": backend.split("@", 1)[1],
                "releaseArtifactSha256": "c" * 64,
                "roles": ["api", "worker", "migrate"],
            },
            "web": {
                "reference": web,
                "digest": web.split("@", 1)[1],
                "releaseArtifactSha256": "d" * 64,
                "roles": ["web"],
            },
        },
    }


class DotenvParsingTest(unittest.TestCase):
    def test_compose_inline_comments_are_removed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / ".env"
            path.write_text(
                "EIMIR_ENVIRONMENT=production # deployed\n"
                'EIMIR_RELEASE_VERSION="0.1.0" # selected\n'
                "TOKEN=value#literal\n",
                encoding="utf-8",
            )
            values = parse_dotenv(path)
        self.assertEqual(values["EIMIR_ENVIRONMENT"], "production")
        self.assertEqual(values["EIMIR_RELEASE_VERSION"], "0.1.0")
        self.assertEqual(values["TOKEN"], "value#literal")

    def test_deprecated_names_are_exposed_under_canonical_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / ".env"
            path.write_text(
                "SBS_ENVIRONMENT=production\n"
                f"SBS_ACCOUNT_DELETION_INSTANCE_ID={INSTANCE_ID}\n",
                encoding="utf-8",
            )
            values = parse_dotenv(path)
        self.assertEqual(values["EIMIR_ENVIRONMENT"], "production")
        self.assertEqual(values["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"], INSTANCE_ID)

    def test_canonical_name_wins_independent_of_assignment_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / ".env"
            path.write_text(
                "EIMIR_ENVIRONMENT=production\nSBS_ENVIRONMENT=development\n",
                encoding="utf-8",
            )
            values = parse_dotenv(path)
        self.assertEqual(values["EIMIR_ENVIRONMENT"], "production")


class DotenvToRenderedTest(unittest.TestCase):
    def test_accepts_matching_deletion_authority(self) -> None:
        dotenv = {
            "EIMIR_ENVIRONMENT": "production",
            "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
        }
        self.assertEqual(check_dotenv_to_rendered(dotenv, rendered()), [])

    def test_rejects_blank_compose_override_of_nonempty_dotenv_value(self) -> None:
        dotenv = {
            "EIMIR_ENVIRONMENT": "production",
            "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
        }
        problems = check_dotenv_to_rendered(dotenv, rendered(instance_id=""))
        self.assertEqual(len(problems), 3)
        self.assertTrue(
            all("EIMIR_ACCOUNT_DELETION_INSTANCE_ID" in p for p in problems)
        )
        self.assertTrue(all(INSTANCE_ID not in p for p in problems))

    def test_production_requires_deletion_authority_in_env_file_and_render(
        self,
    ) -> None:
        problems = check_dotenv_to_rendered(
            {
                "EIMIR_ENVIRONMENT": "production",
                "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "",
            },
            rendered(instance_id=""),
        )
        self.assertEqual(
            problems,
            [
                "production env file must set non-empty EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
                "rendered Production runtime must set non-empty EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
            ],
        )

    def test_development_may_omit_deletion_authority(self) -> None:
        problems = check_dotenv_to_rendered(
            {
                "EIMIR_ENVIRONMENT": "development",
                "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "",
            },
            rendered(instance_id="", environment="development"),
        )
        self.assertEqual(problems, [])

    def test_detects_process_override_of_environment_mode(self) -> None:
        dotenv = {
            "EIMIR_ENVIRONMENT": "development",
            "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "",
        }
        problems = check_dotenv_to_rendered(dotenv, rendered(instance_id=""))
        self.assertIn(
            "rendered Production runtime must set non-empty EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
            problems,
        )
        self.assertEqual(
            sum(
                "differs from env file for EIMIR_ENVIRONMENT" in problem
                for problem in problems
            ),
            2,
        )


class ProductionImageIdentityTest(unittest.TestCase):
    def test_accepts_one_versioned_release_for_production(self) -> None:
        self.assertEqual(
            check_production_image_identity(
                {"EIMIR_ENVIRONMENT": "production", "EIMIR_RELEASE_VERSION": "0.1.0"},
                image_config(),
                rendered(),
            ),
            [],
        )

    def test_accepts_digest_qualified_release_refs(self) -> None:
        self.assertEqual(
            check_production_image_identity(
                {"EIMIR_ENVIRONMENT": "production", "EIMIR_RELEASE_VERSION": "0.1.0"},
                image_config(backend=BACKEND_PINNED, web=WEB_PINNED),
                rendered(),
            ),
            [],
        )

    def test_development_may_use_local_source_images(self) -> None:
        problems = check_production_image_identity(
            {"EIMIR_ENVIRONMENT": "development"},
            image_config(
                backend="eimir-backend:source-local",
                web="eimir-web:source-local",
                pull_policy="never",
            ),
            rendered(environment="development"),
        )
        self.assertEqual(problems, [])

    def test_rejects_mutable_or_local_refs(self) -> None:
        for backend, web in (
            ("ghcr.io/baerenmarke90/eimir-backend:latest", WEB),
            ("ghcr.io/baerenmarke90/eimir-backend:main", WEB),
            ("eimir-backend:source-local", "eimir-web:source-local"),
        ):
            with self.subTest(backend=backend):
                self.assertGreater(
                    len(
                        check_production_image_identity(
                            {"EIMIR_ENVIRONMENT": "production"},
                            image_config(backend=backend, web=web),
                            rendered(),
                        )
                    ),
                    0,
                )

    def test_rejects_backend_role_divergence(self) -> None:
        problems = check_production_image_identity(
            {"EIMIR_ENVIRONMENT": "production"},
            image_config(worker="ghcr.io/baerenmarke90/eimir-backend:v0.1.1"),
            rendered(),
        )
        self.assertIn(
            "Production api/worker/migrate must use one exact backend image identity",
            problems,
        )

    def test_rejects_backend_web_version_divergence(self) -> None:
        problems = check_production_image_identity(
            {"EIMIR_ENVIRONMENT": "production"},
            image_config(web="ghcr.io/baerenmarke90/eimir-web:v0.1.1"),
            rendered(),
        )
        self.assertIn(
            "Production backend and Web images must use one product release version",
            problems,
        )

    def test_rejects_joint_image_override_that_disagrees_with_declared_release(
        self,
    ) -> None:
        problems = check_production_image_identity(
            {"EIMIR_ENVIRONMENT": "production", "EIMIR_RELEASE_VERSION": "0.1.0"},
            image_config(
                backend="ghcr.io/baerenmarke90/eimir-backend:v0.1.1",
                web="ghcr.io/baerenmarke90/eimir-web:v0.1.1",
            ),
            rendered(),
        )
        self.assertIn(
            "Production application images must match EIMIR_RELEASE_VERSION", problems
        )

    def test_rejects_build_fallback_or_never_pull(self) -> None:
        problems = check_production_image_identity(
            {"EIMIR_ENVIRONMENT": "production"},
            image_config(build=True, pull_policy="never"),
            rendered(),
        )
        self.assertTrue(
            any(
                "must not contain build configuration" in problem
                for problem in problems
            )
        )
        self.assertTrue(any("pull_policy=always" in problem for problem in problems))


class PublishedReleaseIdentityTest(unittest.TestCase):
    def test_accepts_exact_published_digest_identity(self) -> None:
        problems = check_published_release_image_identity(
            {"EIMIR_RELEASE_VERSION": "0.1.0"},
            image_config(backend=BACKEND_PINNED, web=WEB_PINNED),
            release_identity(),
        )
        self.assertEqual(problems, [])

    def test_rejects_same_version_with_unpublished_backend_digest(self) -> None:
        alternate = f"{BACKEND}@sha256:{'e' * 64}"
        problems = check_published_release_image_identity(
            {"EIMIR_RELEASE_VERSION": "0.1.0"},
            image_config(backend=alternate, web=WEB_PINNED),
            release_identity(),
        )
        self.assertIn(
            "Production service migrate does not match published backend image identity",
            problems,
        )
        self.assertIn(
            "Production service api does not match published backend image identity",
            problems,
        )
        self.assertIn(
            "Production service worker does not match published backend image identity",
            problems,
        )

    def test_rejects_identity_from_another_release_version(self) -> None:
        other_backend = (
            f"ghcr.io/baerenmarke90/eimir-backend:v0.1.1@sha256:{BACKEND_DIGEST}"
        )
        other_web = f"ghcr.io/baerenmarke90/eimir-web:v0.1.1@sha256:{WEB_DIGEST}"
        problems = check_published_release_image_identity(
            {"EIMIR_RELEASE_VERSION": "0.1.0"},
            image_config(backend=other_backend, web=other_web),
            release_identity(version="0.1.1", backend=other_backend, web=other_web),
        )
        self.assertIn(
            "Self-Hosted release image identity does not match EIMIR_RELEASE_VERSION",
            problems,
        )


class RenderedToRunningTest(unittest.TestCase):
    def test_accepts_matching_running_containers(self) -> None:
        expected = rendered()
        running = {name: dict(environment) for name, environment in expected.items()}
        self.assertEqual(check_rendered_to_running(expected, running), [])

    def test_detects_stale_or_empty_runtime_value(self) -> None:
        expected = rendered()
        running = {name: dict(environment) for name, environment in expected.items()}
        running["api"]["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"] = ""
        problems = check_rendered_to_running(expected, running)
        self.assertEqual(
            problems,
            [
                "running service api differs from rendered Compose for EIMIR_ACCOUNT_DELETION_INSTANCE_ID"
            ],
        )
        self.assertNotIn(INSTANCE_ID, problems[0])

    def test_detects_missing_container(self) -> None:
        expected = rendered()
        running = {name: dict(environment) for name, environment in expected.items()}
        running["worker"] = None
        self.assertIn(
            "service worker has no inspectable Compose container",
            check_rendered_to_running(expected, running),
        )

    def test_parser_keeps_empty_environment_values(self) -> None:
        self.assertEqual(
            parse_container_environment(["A=one", "B=", "C=three=four"]),
            {"A": "one", "B": "", "C": "three=four"},
        )


if __name__ == "__main__":
    unittest.main()
