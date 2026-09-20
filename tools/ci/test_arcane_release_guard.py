#!/usr/bin/env python3
"""Contract checks for the Arcane-first Production workflow (#1108).

Arcane deploys the canonical ``compose.yaml`` with plain Compose and never reaches
``scripts/self_hosted_release.py``. These tests prove that

* every runtime service transitively waits for the ``release-guard`` one-shot, which
  judges exactly the image references and pull policy Compose renders for them;
* the guard and the launcher accept and reject the same release references, so the
  Compose-resident gate cannot drift from the launcher contract;
* the one-time deletion-authority bootstrap is isolated behind its own profile.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import self_hosted_release as launcher  # noqa: E402
import test_self_hosted_topology as topology  # noqa: E402


def _load_guard():  # type: ignore[no-untyped-def]
    """Load the stdlib-only guard by path; the backend package is not importable here."""

    path = ROOT / "backend/src/eimir/deployment/release_guard.py"
    spec = importlib.util.spec_from_file_location("eimir_release_guard_under_test", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_guard()

INSTANCE_ID = "11111111-2222-4333-8444-555555555555"
DIGEST_A = "sha256:" + "a" * 64
DIGEST_B = "sha256:" + "b" * 64
RUNTIME_SERVICES = ("migrate", "api", "worker", "web")
GUARD_ENVIRONMENT_KEYS = {
    "EIMIR_ENVIRONMENT",
    "EIMIR_RELEASE_VERSION",
    "EIMIR_GUARD_BACKEND_IMAGE",
    "EIMIR_GUARD_WEB_IMAGE",
    "EIMIR_GUARD_PULL_POLICY",
    "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
}


def _ref(role: str, version: str, digest: str = DIGEST_A) -> str:
    return f"ghcr.io/baerenmarke90/eimir-{role}:v{version}@{digest}"


def _dependency_closure(services: dict[str, dict], name: str) -> set[str]:
    seen: set[str] = set()
    pending = [name]
    while pending:
        for dependency in topology._depends_on(services[pending.pop()]):
            if dependency not in seen:
                seen.add(dependency)
                pending.append(dependency)
    return seen


def _production_overrides(version: str = "0.1.0", **extra: str) -> dict[str, str]:
    overrides = {
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_RELEASE_VERSION": version,
        "EIMIR_SELF_HOSTED_BACKEND_IMAGE": _ref("backend", version),
        "EIMIR_SELF_HOSTED_WEB_IMAGE": _ref("web", version, DIGEST_B),
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
    }
    overrides.update(extra)
    return overrides


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class RenderedReleaseGateTest(unittest.TestCase):
    """The guard is wired into the rendered canonical topology."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = topology.render("self-hosted", overrides=_production_overrides())
        cls.services = cls.config["services"]

    def test_every_runtime_service_transitively_waits_for_the_guard(self) -> None:
        for name in RUNTIME_SERVICES:
            with self.subTest(service=name):
                self.assertIn("release-guard", _dependency_closure(self.services, name))
        self.assertEqual(
            topology._depends_on(self.services["migrate"])["release-guard"],
            "service_completed_successfully",
        )

    def test_guard_is_an_isolated_one_shot_of_the_release_backend_image(self) -> None:
        release_guard = self.services["release-guard"]
        self.assertEqual(release_guard["image"], self.services["api"]["image"])
        self.assertEqual(release_guard["pull_policy"], "always")
        self.assertEqual(release_guard["restart"], "no")
        self.assertEqual(release_guard["network_mode"], "none")
        self.assertEqual(
            release_guard["command"],
            ["python", "-m", "eimir.deployment.release_guard", "verify"],
        )
        for absent in ("volumes", "ports", "build", "depends_on"):
            self.assertNotIn(absent, release_guard)

    def test_guard_receives_only_release_identity_and_no_secrets(self) -> None:
        self.assertEqual(set(self.services["release-guard"]["environment"]), GUARD_ENVIRONMENT_KEYS)

    def test_guard_judges_exactly_what_the_runtime_services_render(self) -> None:
        environment = self.services["release-guard"]["environment"]
        for name in ("migrate", "api", "worker"):
            self.assertEqual(environment["EIMIR_GUARD_BACKEND_IMAGE"], self.services[name]["image"])
            self.assertEqual(environment["EIMIR_GUARD_PULL_POLICY"], self.services[name]["pull_policy"])
        self.assertEqual(environment["EIMIR_GUARD_WEB_IMAGE"], self.services["web"]["image"])
        self.assertEqual(
            environment["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"],
            self.services["api"]["environment"]["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"],
        )

    def test_guard_accepts_the_rendered_digest_pinned_release(self) -> None:
        self.assertEqual(guard.verify(self.services["release-guard"]["environment"]), 0)

    def test_plain_compose_defaults_are_refused_by_the_guard(self) -> None:
        """The version-tag default that raw Compose resolves is not Production identity."""

        overrides = _production_overrides()
        for key in ("EIMIR_SELF_HOSTED_BACKEND_IMAGE", "EIMIR_SELF_HOSTED_WEB_IMAGE"):
            overrides[key] = ""
        services = topology.render("self-hosted", overrides=overrides)["services"]
        self.assertEqual(services["api"]["image"], "ghcr.io/baerenmarke90/eimir-backend:v0.1.0")
        self.assertEqual(guard.verify(services["release-guard"]["environment"]), 1)

    def test_guard_refuses_unsafe_rendered_variants(self) -> None:
        unsafe = {
            "latest backend": {
                "EIMIR_SELF_HOSTED_BACKEND_IMAGE": "ghcr.io/baerenmarke90/eimir-backend:latest"
            },
            "local source web": {"EIMIR_SELF_HOSTED_WEB_IMAGE": "eimir-web:source-local"},
            "version drift": {"EIMIR_RELEASE_VERSION": "0.2.0"},
            "pull disabled": {"EIMIR_SELF_HOSTED_PULL_POLICY": "never"},
            "missing authority": {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": ""},
        }
        for label, override in unsafe.items():
            with self.subTest(label):
                services = topology.render(
                    "self-hosted", overrides=_production_overrides(**override)
                )["services"]
                self.assertEqual(guard.verify(services["release-guard"]["environment"]), 1)

    def test_development_and_demo_identities_are_not_gated(self) -> None:
        for environment in ("development", "demo"):
            with self.subTest(environment=environment):
                services = topology.render(
                    "self-hosted",
                    env_file=topology.DEVELOPMENT_ENV_EXAMPLE,
                    overrides={"EIMIR_ENVIRONMENT": environment},
                )["services"]
                self.assertEqual(guard.verify(services["release-guard"]["environment"]), 0)


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class BootstrapProfileTest(unittest.TestCase):
    """The one-time deletion-authority provisioning is explicit and isolated."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.services = topology.render("self-hosted")["services"]
        cls.bootstrap_only = topology.render(
            "bootstrap", overrides=_production_overrides(EIMIR_ACCOUNT_DELETION_INSTANCE_ID="")
        )["services"]

    def test_normal_deploy_never_includes_or_waits_for_the_bootstrap(self) -> None:
        self.assertNotIn("deletion-authority-bootstrap", self.services)
        for name, service in self.services.items():
            self.assertNotIn("deletion-authority-bootstrap", topology._depends_on(service), name)

    def test_bootstrap_profile_contains_only_the_bootstrap_one_shot(self) -> None:
        self.assertEqual(set(self.bootstrap_only), {"deletion-authority-bootstrap"})
        bootstrap = self.bootstrap_only["deletion-authority-bootstrap"]
        self.assertNotIn("depends_on", bootstrap)
        self.assertEqual(bootstrap["restart"], "no")
        self.assertEqual(bootstrap["network_mode"], "none")
        self.assertEqual(bootstrap["pull_policy"], "always")
        self.assertEqual(
            bootstrap["command"], ["python", "-m", "eimir.deployment.release_guard", "bootstrap"]
        )

    def test_bootstrap_uses_the_release_image_and_the_runtime_journal_volume(self) -> None:
        bootstrap = self.bootstrap_only["deletion-authority-bootstrap"]
        self.assertEqual(
            bootstrap["image"], _ref("backend", "0.1.0")
        )
        api = self.services["api"]
        journal_volume = next(v for v in api["volumes"] if v["source"] == "deletion_journal_data")
        self.assertEqual(
            [(v["source"], v["target"]) for v in bootstrap["volumes"]],
            [("deletion_journal_data", journal_volume["target"])],
        )
        self.assertEqual(
            bootstrap["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"],
            api["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"],
        )
        self.assertTrue(
            api["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"].startswith(
                journal_volume["target"] + "/"
            )
        )

    def test_bootstrap_environment_carries_the_instance_id_it_must_refuse_to_replace(self) -> None:
        services = topology.render("bootstrap", overrides=_production_overrides())["services"]
        environment = services["deletion-authority-bootstrap"]["environment"]
        self.assertEqual(environment["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"], INSTANCE_ID)


class GuardLauncherParityTest(unittest.TestCase):
    """The Compose-resident guard and the launcher agree on release references."""

    CASES = {
        "valid": ("1.2.3", _ref("backend", "1.2.3"), _ref("web", "1.2.3", DIGEST_B)),
        "prerelease": ("1.2.3-rc.1", _ref("backend", "1.2.3-rc.1"), _ref("web", "1.2.3-rc.1")),
        "build metadata": ("1.2.3+7", _ref("backend", "1.2.3+7"), _ref("web", "1.2.3+7")),
        "tag only": ("1.2.3", "ghcr.io/baerenmarke90/eimir-backend:v1.2.3", _ref("web", "1.2.3")),
        "latest": ("1.2.3", "ghcr.io/baerenmarke90/eimir-backend:latest", _ref("web", "1.2.3")),
        "local tag": ("1.2.3", "eimir-backend:source-local", _ref("web", "1.2.3")),
        "backend version drift": ("1.2.3", _ref("backend", "1.2.4"), _ref("web", "1.2.3")),
        "web version drift": ("1.2.3", _ref("backend", "1.2.3"), _ref("web", "1.2.4")),
        "roles swapped": ("1.2.3", _ref("web", "1.2.3"), _ref("backend", "1.2.3")),
        "foreign namespace": (
            "1.2.3",
            "ghcr.io/other/eimir-backend:v1.2.3@" + DIGEST_A,
            _ref("web", "1.2.3"),
        ),
        "short digest": (
            "1.2.3",
            "ghcr.io/baerenmarke90/eimir-backend:v1.2.3@sha256:abc",
            _ref("web", "1.2.3"),
        ),
        "uppercase digest": (
            "1.2.3",
            "ghcr.io/baerenmarke90/eimir-backend:v1.2.3@sha256:" + "A" * 64,
            _ref("web", "1.2.3"),
        ),
        "leading zero version": ("01.2.3", _ref("backend", "01.2.3"), _ref("web", "01.2.3")),
    }

    def _launcher_accepts(self, version: str, backend: str, web: str) -> bool:
        def record(reference: str, roles: list[str]) -> dict[str, object]:
            return {
                "reference": reference,
                "digest": reference.split("@", 1)[1] if "@" in reference else "",
                "roles": roles,
            }

        identity = {
            "schemaVersion": 1,
            "kind": "eimir-self-hosted-image-identity",
            "product": {"version": version, "tag": f"v{version}"},
            "sourceRevision": "c" * 40,
            "images": {
                "backend": record(backend, ["api", "worker", "migrate"]),
                "web": record(web, ["web"]),
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "identity.json"
            path.write_text(json.dumps(identity), encoding="utf-8")
            try:
                launcher.load_release_identity(path, {"EIMIR_RELEASE_VERSION": version})
            except launcher.ReleaseOperationError:
                return False
        return True

    def _guard_accepts(self, version: str, backend: str, web: str) -> bool:
        problems = guard.release_problems(
            {
                "EIMIR_RELEASE_VERSION": version,
                "EIMIR_GUARD_BACKEND_IMAGE": backend,
                "EIMIR_GUARD_WEB_IMAGE": web,
                "EIMIR_GUARD_PULL_POLICY": "always",
            },
            require_deletion_authority=False,
        )
        return not problems

    def test_guard_and_launcher_reach_the_same_verdict_for_every_case(self) -> None:
        for label, (version, backend, web) in self.CASES.items():
            with self.subTest(label):
                self.assertEqual(
                    self._guard_accepts(version, backend, web),
                    self._launcher_accepts(version, backend, web),
                )

    def test_the_matrix_exercises_both_verdicts(self) -> None:
        verdicts = {self._launcher_accepts(*case) for case in self.CASES.values()}
        self.assertEqual(verdicts, {True, False})


if __name__ == "__main__":
    unittest.main()
