#!/usr/bin/env python3
"""Fail-closed contract checks for the #521 Cloud/Managed v1 Compose profile.

Cloud/Managed, Self-Hosted, Arcane and the development database now share the
repository-root compose.yaml. These tests prove that the ``cloud`` profile keeps
its intentionally different topology and immutable-image contract without a
second deployment manifest.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "compose.yaml"
CLOUD_ENV_EXAMPLE = ROOT / "deploy/cloud-managed.env.example"
DEV_ENV_EXAMPLE = ROOT / "deploy/persistent-development.env.example"
LEGACY_COMPOSE_REFERENCES = (
    "compose." + "arcane.yaml",
    "deploy/" + "compose.cloud.yml",
    "deploy/" + "docker-compose.dev.yml",
)

sys.path.insert(0, str(ROOT / "scripts"))
import check_environment_isolation as isolation  # noqa: E402
import release_manifest  # noqa: E402


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _service_block(compose: str, name: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|^networks:|^volumes:|\Z)",
        compose,
    )
    if match is None:
        raise AssertionError(f"Compose service {name!r} is missing")
    return match.group(1)


def _tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / raw.decode("utf-8") for raw in result.stdout.split(b"\0") if raw]


def _digest_ref(name: str, digit: str) -> str:
    return f"registry.example/{name}@sha256:{digit * 64}"


class CanonicalComposeRepositoryContractTest(unittest.TestCase):
    """Prevent deployment topology from splitting into parallel manifests again."""

    def test_exactly_one_compose_manifest_is_tracked(self) -> None:
        manifests: list[str] = []
        for path in _tracked_files():
            relative = path.relative_to(ROOT)
            name = relative.name.lower()
            if relative.suffix.lower() not in {".yaml", ".yml"}:
                continue
            if name in {"compose.yaml", "compose.yml"} or name.startswith(
                ("compose.", "docker-compose")
            ):
                manifests.append(relative.as_posix())
        self.assertEqual(sorted(manifests), ["compose.yaml"])

    def test_removed_manifest_names_are_not_referenced(self) -> None:
        findings: list[str] = []
        for path in _tracked_files():
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            relative = path.relative_to(ROOT).as_posix()
            for legacy in LEGACY_COMPOSE_REFERENCES:
                if legacy in text:
                    findings.append(f"{relative}: {legacy}")
        self.assertEqual(findings, [])

    def test_no_other_tracked_file_defines_compose_services(self) -> None:
        """Catch a differently-named orchestration file, not just known filenames.

        A file matching neither the ``compose.*``/``docker-compose*`` naming
        convention nor any of ``LEGACY_COMPOSE_REFERENCES`` (for example
        ``stack.yaml`` or ``infra/orchestration.yml``) would slip past both of
        the checks above. This looks at content instead: a top-level
        ``services:`` mapping is what makes a YAML file a Compose manifest, so
        no tracked file except the canonical one may define one (#746 review).
        """
        offenders: list[str] = []
        for path in _tracked_files():
            relative = path.relative_to(ROOT)
            if relative.suffix.lower() not in {".yaml", ".yml"}:
                continue
            if relative == COMPOSE.relative_to(ROOT):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            if re.search(r"(?m)^services:\s*$", text):
                offenders.append(relative.as_posix())
        self.assertEqual(offenders, [])


class CloudComposeTextContractTest(unittest.TestCase):
    """Structural checks on the canonical recipe text (no Docker required)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.compose = _read(COMPOSE)

    def test_cloud_is_a_profile_in_the_canonical_manifest(self) -> None:
        self.assertIn('profiles: ["cloud"]', self.compose)
        for service in ("cloud-api", "cloud-worker", "cloud-migrate", "cloud-web"):
            self.assertIn('profiles: ["cloud"]', _service_block(self.compose, service))

    def test_cloud_processes_use_images_not_source_builds(self) -> None:
        for service in ("cloud-api", "cloud-worker", "cloud-migrate"):
            block = _service_block(self.compose, service)
            self.assertIn("*cloud-backend-image", block)
            self.assertNotIn("build:", block)
        web = _service_block(self.compose, "cloud-web")
        self.assertIn("<<: *cloud-web-image", web)
        self.assertNotIn("build:", web)

    def test_cloud_has_no_runtime_dependency_on_bundled_postgres_or_demo_init(self) -> None:
        for service in ("cloud-api", "cloud-worker", "cloud-migrate", "cloud-web"):
            block = _service_block(self.compose, service)
            self.assertNotIn("postgres:", block)
            self.assertNotIn("demo-init:", block)
            self.assertNotIn("scripts.demo_space", block)

    def test_media_store_defaults_to_local(self) -> None:
        self.assertIn(
            'EIMIR_MEDIA_STORE: "${EIMIR_MEDIA_STORE:-${SBS_MEDIA_STORE:-local}}"',
            self.compose,
        )
        for service in ("cloud-api", "cloud-worker"):
            self.assertIn(
                "cloud_media_data:/var/lib/eimir/media",
                _service_block(self.compose, service),
            )
        self.assertRegex(self.compose, r"(?m)^  cloud_media_data:\s*$")

    def test_s3_variables_remain_optional(self) -> None:
        for var in (
            "EIMIR_S3_ENDPOINT",
            "EIMIR_S3_BUCKET",
            "EIMIR_S3_ACCESS_KEY_ID",
            "EIMIR_S3_SECRET_ACCESS_KEY",
        ):
            self.assertIn(f"${{{var}:-", self.compose)

    def test_missing_cloud_images_use_non_runnable_sentinels(self) -> None:
        # ``.invalid`` is an IANA-reserved special-use TLD (RFC 2606) that is
        # guaranteed to never resolve, so a deployment that forgets to set the
        # real image still fails closed at pull time even though `docker
        # compose config` itself must keep succeeding for every profile.
        for var, image in (
            ("EIMIR_BACKEND_IMAGE", "eimir-backend"),
            ("EIMIR_WEB_IMAGE", "eimir-web"),
        ):
            sentinel = f"invalid.invalid/{image}:configuration-required"
            legacy_var = var.replace("EIMIR_", "SBS_", 1)
            self.assertIn(f"${{{var}:-${{{legacy_var}:-{sentinel}}}}}", self.compose)
            self.assertTrue(sentinel.split("/", 1)[0].endswith(".invalid"))
            with self.assertRaises(release_manifest.ManifestError):
                release_manifest.require_digest_image_reference(sentinel, label=var)

    def test_migrate_never_restarts_automatically(self) -> None:
        self.assertIn('restart: "no"', _service_block(self.compose, "cloud-migrate"))

    def test_deletion_journal_uses_a_dedicated_named_volume(self) -> None:
        self.assertIn(
            "cloud_deletion_journal_data:/var/lib/eimir/deletion-journal",
            _service_block(self.compose, "cloud-api"),
        )
        self.assertRegex(self.compose, r"(?m)^  cloud_deletion_journal_data:\s*$")

    def test_cloud_volumes_are_disjoint_from_self_hosted_volumes(self) -> None:
        """Cloud and Self-Hosted must never be able to share local storage.

        Both profiles live in one file now, so nothing prevents an operator
        mistake like ``COMPOSE_PROFILES=self-hosted,cloud`` from starting both
        at once (#746 review). Distinct volume names are what actually makes
        that mistake harmless instead of a cross-instance data collision.
        """
        self_hosted_volumes = {
            volume
            for service in ("api", "worker")
            for volume in re.findall(
                r"^\s+- (\w+):", _service_block(self.compose, service), re.MULTILINE
            )
        }
        cloud_volumes = {
            volume
            for service in ("cloud-api", "cloud-worker")
            for volume in re.findall(
                r"^\s+- (\w+):", _service_block(self.compose, service), re.MULTILINE
            )
        }
        self.assertTrue(self_hosted_volumes, "expected self-hosted services to mount volumes")
        self.assertTrue(cloud_volumes, "expected cloud services to mount volumes")
        self.assertEqual(self_hosted_volumes & cloud_volumes, set())

    def test_production_mail_default_is_not_log(self) -> None:
        cloud_anchor = self.compose.split("x-cloud-runtime-environment:", 1)[1].split(
            "x-self-hosted-backend-build:", 1
        )[0]
        self.assertIn(
            "EIMIR_MAIL_TRANSPORT:-${SBS_MAIL_TRANSPORT:-none}", cloud_anchor
        )
        self.assertNotIn("EIMIR_MAIL_TRANSPORT:-log", cloud_anchor)


class CloudRuntimeImageIdentityContractTest(unittest.TestCase):
    """#668: tag-only Production identities are never considered immutable."""

    def _config(self, backend: str, web: str) -> dict:
        return {
            "services": {
                "cloud-api": {"image": backend},
                "cloud-worker": {"image": backend},
                "cloud-migrate": {"image": backend},
                "cloud-web": {"image": web},
            }
        }

    def test_tag_only_references_are_rejected(self) -> None:
        valid_backend = _digest_ref("eimir-backend", "1")
        valid_web = _digest_ref("eimir-web", "2")
        for tag in ("latest", "main", "v1.0.0", "some-tag"):
            with self.subTest(tag=tag, role="backend"):
                with self.assertRaises(release_manifest.ManifestError):
                    release_manifest.cloud_images_from_compose(
                        self._config(f"registry.example/eimir-backend:{tag}", valid_web)
                    )
            with self.subTest(tag=tag, role="web"):
                with self.assertRaises(release_manifest.ManifestError):
                    release_manifest.cloud_images_from_compose(
                        self._config(valid_backend, f"registry.example/eimir-web:{tag}")
                    )

    def test_digest_references_are_accepted(self) -> None:
        backend = _digest_ref("eimir-backend", "1")
        web = _digest_ref("eimir-web", "2")
        self.assertEqual(
            release_manifest.cloud_images_from_compose(self._config(backend, web)),
            (backend, web),
        )

    def test_backend_services_must_resolve_to_the_same_digest_identity(self) -> None:
        config = self._config(
            _digest_ref("eimir-backend", "1"),
            _digest_ref("eimir-web", "2"),
        )
        config["services"]["cloud-worker"]["image"] = _digest_ref(
            "eimir-backend", "3"
        )
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(config)

    def test_missing_identity_and_source_build_fail_closed(self) -> None:
        config = self._config(
            _digest_ref("eimir-backend", "1"),
            _digest_ref("eimir-web", "2"),
        )
        config["services"]["cloud-web"].pop("image")
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(config)

        config = self._config(
            _digest_ref("eimir-backend", "1"),
            _digest_ref("eimir-web", "2"),
        )
        config["services"]["cloud-api"]["build"] = {"context": "backend"}
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(config)


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class CloudComposeResolvedConfigTest(unittest.TestCase):
    """Validates that the cloud profile resolves to the managed topology."""

    def _resolve(self, env_overrides: dict[str, str]) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / "cloud.env"
            merged: dict[str, str] = dict(_pairs(_read(CLOUD_ENV_EXAMPLE).splitlines()))
            merged.update(env_overrides)
            env_path.write_text(
                "\n".join(f"{key}={value}" for key, value in merged.items()) + "\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "--profile",
                    "cloud",
                    "--env-file",
                    str(env_path),
                    "config",
                    "--format",
                    "json",
                ],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise AssertionError(result.stderr)
            return json.loads(result.stdout)

    def _valid_overrides(self) -> dict[str, str]:
        return {
            "EIMIR_BACKEND_IMAGE": _digest_ref("eimir-backend", "1"),
            "EIMIR_WEB_IMAGE": _digest_ref("eimir-web", "2"),
            "EIMIR_DATABASE_URL": "postgresql+psycopg://user:pass@db.private:5432/eimir",
            "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "00000000-0000-0000-0000-000000000000",
        }

    def test_resolved_recipe_has_only_cloud_process_services(self) -> None:
        config = self._resolve(self._valid_overrides())
        self.assertEqual(
            sorted(config["services"]),
            ["cloud-api", "cloud-migrate", "cloud-web", "cloud-worker"],
        )

    def test_resolved_services_reference_images_not_builds(self) -> None:
        config = self._resolve(self._valid_overrides())
        expected_backend = _digest_ref("eimir-backend", "1")
        expected_web = _digest_ref("eimir-web", "2")
        for name in ("cloud-api", "cloud-migrate", "cloud-worker"):
            self.assertEqual(config["services"][name]["image"], expected_backend)
            self.assertNotIn("build", config["services"][name])
        self.assertEqual(config["services"]["cloud-web"]["image"], expected_web)
        self.assertNotIn("build", config["services"]["cloud-web"])
        self.assertEqual(
            release_manifest.cloud_images_from_compose(config),
            (expected_backend, expected_web),
        )

    def test_resolved_media_store_defaults_to_local_without_s3(self) -> None:
        config = self._resolve(self._valid_overrides())
        self.assertEqual(
            config["services"]["cloud-api"]["environment"]["EIMIR_MEDIA_STORE"], "local"
        )
        api_volume_sources = [
            volume["source"] for volume in config["services"]["cloud-api"]["volumes"]
        ]
        self.assertIn("cloud_media_data", api_volume_sources)

    def test_resolved_media_store_can_opt_into_s3(self) -> None:
        overrides = self._valid_overrides()
        overrides.update(
            {
                "EIMIR_MEDIA_STORE": "s3",
                "EIMIR_S3_ENDPOINT": "https://s3.example.com",
                "EIMIR_S3_BUCKET": "eimir-prod",
                "EIMIR_S3_ACCESS_KEY_ID": "test-access-key",
                "EIMIR_S3_SECRET_ACCESS_KEY": "test-secret-key",
            }
        )
        config = self._resolve(overrides)
        self.assertEqual(
            config["services"]["cloud-api"]["environment"]["EIMIR_MEDIA_STORE"], "s3"
        )
        endpoint = config["services"]["cloud-api"]["environment"]["EIMIR_S3_ENDPOINT"]
        self.assertEqual(endpoint, "https://s3.example.com")
        self.assertEqual(
            config["services"]["cloud-web"]["environment"]["EIMIR_WEB_CSP_CONNECT_ORIGINS"],
            endpoint,
        )

    def test_missing_backend_image_cannot_fall_back_to_source_build(self) -> None:
        overrides = self._valid_overrides()
        del overrides["EIMIR_BACKEND_IMAGE"]
        config = self._resolve(overrides)
        for name in ("cloud-api", "cloud-migrate", "cloud-worker"):
            self.assertEqual(
                config["services"][name]["image"],
                "invalid.invalid/eimir-backend:configuration-required",
            )
            self.assertNotIn("build", config["services"][name])
        with self.assertRaises(release_manifest.ManifestError):
            release_manifest.cloud_images_from_compose(config)


def _pairs(lines: list[str]):
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        yield key.strip(), value.strip()


class CloudEnvironmentTemplateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = _read(CLOUD_ENV_EXAMPLE)
        cls.values = dict(_pairs(cls.text.splitlines()))

    def test_selects_canonical_cloud_profile(self) -> None:
        self.assertEqual(self.values["COMPOSE_PROFILES"], "cloud")
        self.assertEqual(self.values["EIMIR_ENVIRONMENT"], "production")
        self.assertEqual(self.values["EIMIR_DEPLOYMENT"], "cloud")

    def test_declares_local_media_store_as_supported_default(self) -> None:
        self.assertEqual(self.values["EIMIR_MEDIA_STORE"], "local")
        self.assertIn("# EIMIR_MEDIA_STORE=s3", self.text)

    def test_image_placeholders_require_digest_identity(self) -> None:
        for var in ("EIMIR_BACKEND_IMAGE", "EIMIR_WEB_IMAGE"):
            self.assertEqual(self.values[var], "")
        self.assertIn("@sha256:<digest>", self.text)
        self.assertIn("tag-only", self.text)

    def test_isolated_from_persistent_development_template(self) -> None:
        development = isolation.parse_dotenv(DEV_ENV_EXAMPLE)
        production = isolation.parse_dotenv(CLOUD_ENV_EXAMPLE)
        problems = isolation.check_isolation(development, production)
        self.assertEqual(problems, [])

    def test_reused_development_signing_key_is_rejected(self) -> None:
        development = isolation.parse_dotenv(DEV_ENV_EXAMPLE)
        production = dict(isolation.parse_dotenv(CLOUD_ENV_EXAMPLE))
        production["EIMIR_CURSOR_SIGNING_KEY"] = development["EIMIR_CURSOR_SIGNING_KEY"]
        problems = isolation.check_isolation(development, production)
        self.assertIn(
            "Development and Production must not reuse EIMIR_CURSOR_SIGNING_KEY", problems
        )


if __name__ == "__main__":
    unittest.main()
