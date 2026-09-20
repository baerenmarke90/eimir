#!/usr/bin/env python3
"""Contract checks for the Arcane-first Production workflow (#1108).

Arcane deploys the canonical ``compose.yaml`` with plain Compose and never reaches
``scripts/self_hosted_release.py``. These tests prove that

* every runtime service transitively waits for the ``release-guard`` one-shot, which
  reads the published release identity read-only and judges exactly the image
  references and pull policy Compose renders for the runtime services;
* an unset or unknown ``EIMIR_ENVIRONMENT`` is refused instead of degrading to
  Development;
* the guard and the launcher share one trust contract, checked against a fixed
  authoritative identity that is *not* built from the inputs under test;
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

PLACEHOLDER_IDENTITY = ROOT / "self-hosted-image-identity.json"
INSTANCE_ID = "11111111-2222-4333-8444-555555555555"
VERSION = "1.2.3"
DIGEST = {"backend": "sha256:" + "a" * 64, "web": "sha256:" + "b" * 64}
OTHER_DIGEST = "sha256:" + "d" * 64
RUNTIME_SERVICES = ("migrate", "api", "worker", "web")
GUARD_ENVIRONMENT_KEYS = {
    "EIMIR_ENVIRONMENT",
    "EIMIR_COMPOSE_PROFILES",
    "EIMIR_RELEASE_VERSION",
    "EIMIR_GUARD_BACKEND_IMAGE",
    "EIMIR_GUARD_WEB_IMAGE",
    "EIMIR_GUARD_PULL_POLICY",
    "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
}


def ref(role: str, version: str = VERSION, digest: str | None = None) -> str:
    return f"ghcr.io/baerenmarke90/eimir-{role}:v{version}@{digest or DIGEST[role]}"


def published_identity() -> dict:
    """The known published record of release 1.2.3: a literal, never derived from inputs."""

    return {
        "schemaVersion": 1,
        "kind": "eimir-self-hosted-image-identity",
        "product": {"version": "1.2.3", "tag": "v1.2.3"},
        "sourceRevision": "c" * 40,
        "images": {
            "backend": {
                "reference": (
                    "ghcr.io/baerenmarke90/eimir-backend:v1.2.3@sha256:" + "a" * 64
                ),
                "digest": "sha256:" + "a" * 64,
                "roles": ["api", "worker", "migrate"],
            },
            "web": {
                "reference": "ghcr.io/baerenmarke90/eimir-web:v1.2.3@sha256:" + "b" * 64,
                "digest": "sha256:" + "b" * 64,
                "roles": ["web"],
            },
        },
    }


class IdentityFixture:
    """Write an identity file in a temp directory that lives as long as the fixture."""

    def __init__(self) -> None:
        self._directory = tempfile.TemporaryDirectory()

    def write(self, identity: object, name: str = "identity.json") -> Path:
        path = Path(self._directory.name) / name
        path.write_text(json.dumps(identity), encoding="utf-8")
        return path

    def cleanup(self) -> None:
        self._directory.cleanup()


def _dependency_closure(services: dict[str, dict], name: str) -> set[str]:
    seen: set[str] = set()
    pending = [name]
    while pending:
        for dependency in topology._depends_on(services[pending.pop()]):
            if dependency not in seen:
                seen.add(dependency)
                pending.append(dependency)
    return seen


def _production_overrides(**extra: str) -> dict[str, str]:
    overrides = {
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_RELEASE_VERSION": VERSION,
        "EIMIR_SELF_HOSTED_BACKEND_IMAGE": ref("backend"),
        "EIMIR_SELF_HOSTED_WEB_IMAGE": ref("web"),
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
        "COMPOSE_PROFILES": "self-hosted",
    }
    overrides.update(extra)
    return overrides


class GuardTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.identities = IdentityFixture()
        self.addCleanup(self.identities.cleanup)
        self.identity_path = self.identities.write(published_identity())

    def verdict(self, rendered_guard_environment: dict[str, str], path: Path | None = None) -> int:
        return guard.verify(rendered_guard_environment, identity_path=path or self.identity_path)


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class RenderedReleaseGateTest(GuardTestCase):
    """The guard is wired into the rendered canonical topology."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = topology.render("self-hosted", overrides=_production_overrides())
        cls.services = cls.config["services"]

    def guard_env(self, **overrides: str) -> dict[str, str]:
        return topology.render("self-hosted", overrides=_production_overrides(**overrides))[
            "services"
        ]["release-guard"]["environment"]

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
        for absent in ("ports", "build", "depends_on"):
            self.assertNotIn(absent, release_guard)

    def test_guard_mounts_only_the_published_identity_read_only(self) -> None:
        for name in ("release-guard",):
            (mount,) = self.services[name]["volumes"]
            self.assertEqual(mount["type"], "bind")
            self.assertTrue(mount["read_only"])
            self.assertEqual(mount["target"], "/run/eimir/self-hosted-image-identity.json")
            self.assertEqual(mount["source"], str(PLACEHOLDER_IDENTITY))
            self.assertIs(mount["bind"]["create_host_path"], False)

    def test_guard_receives_only_release_identity_and_no_secrets(self) -> None:
        self.assertEqual(set(self.services["release-guard"]["environment"]), GUARD_ENVIRONMENT_KEYS)

    def test_guard_judges_exactly_what_the_runtime_services_render(self) -> None:
        environment = self.services["release-guard"]["environment"]
        for name in ("migrate", "api", "worker"):
            self.assertEqual(environment["EIMIR_GUARD_BACKEND_IMAGE"], self.services[name]["image"])
            self.assertEqual(
                environment["EIMIR_GUARD_PULL_POLICY"], self.services[name]["pull_policy"]
            )
        self.assertEqual(environment["EIMIR_GUARD_WEB_IMAGE"], self.services["web"]["image"])
        self.assertEqual(
            environment["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"],
            self.services["api"]["environment"]["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"],
        )

    def test_guard_accepts_the_rendered_published_release(self) -> None:
        self.assertEqual(self.verdict(self.services["release-guard"]["environment"]), 0)

    def test_the_source_checkout_placeholder_is_never_a_valid_release_identity(self) -> None:
        self.assertEqual(
            self.verdict(self.services["release-guard"]["environment"], PLACEHOLDER_IDENTITY), 1
        )

    def test_plain_compose_defaults_are_refused_by_the_guard(self) -> None:
        """The version-tag default that raw Compose resolves is not Production identity."""

        overrides = _production_overrides(
            EIMIR_SELF_HOSTED_BACKEND_IMAGE="", EIMIR_SELF_HOSTED_WEB_IMAGE=""
        )
        services = topology.render("self-hosted", overrides=overrides)["services"]
        self.assertEqual(services["api"]["image"], f"ghcr.io/baerenmarke90/eimir-backend:v{VERSION}")
        self.assertEqual(self.verdict(services["release-guard"]["environment"]), 1)

    def test_guard_refuses_unsafe_rendered_variants(self) -> None:
        unsafe = {
            "latest backend": {
                "EIMIR_SELF_HOSTED_BACKEND_IMAGE": "ghcr.io/baerenmarke90/eimir-backend:latest"
            },
            "local source web": {"EIMIR_SELF_HOSTED_WEB_IMAGE": "eimir-web:source-local"},
            "other published digest": {
                "EIMIR_SELF_HOSTED_BACKEND_IMAGE": ref("backend", digest=OTHER_DIGEST)
            },
            "version drift": {"EIMIR_RELEASE_VERSION": "0.2.0"},
            "pull disabled": {"EIMIR_SELF_HOSTED_PULL_POLICY": "never"},
            "missing authority": {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": ""},
            "bootstrap next to runtime": {"COMPOSE_PROFILES": "self-hosted,bootstrap"},
        }
        for label, override in unsafe.items():
            with self.subTest(label):
                self.assertEqual(self.verdict(self.guard_env(**override)), 1)

    def test_a_missing_environment_is_refused_and_no_longer_degrades_to_development(self) -> None:
        overrides = _production_overrides()
        overrides["EIMIR_ENVIRONMENT"] = ""
        services = topology.render("self-hosted", overrides=overrides)["services"]
        # The runtime services keep their own default; only the guard must not follow it.
        self.assertEqual(services["api"]["environment"]["EIMIR_ENVIRONMENT"], "development")
        self.assertEqual(services["release-guard"]["environment"]["EIMIR_ENVIRONMENT"], "")
        self.assertEqual(self.verdict(services["release-guard"]["environment"]), 1)

    def test_an_unknown_environment_is_refused(self) -> None:
        for value in ("Production", "prod", "staging"):
            with self.subTest(value):
                self.assertEqual(self.verdict(self.guard_env(EIMIR_ENVIRONMENT=value)), 1)

    def test_explicit_development_test_and_demo_identities_are_not_gated(self) -> None:
        for environment in ("development", "test", "demo"):
            with self.subTest(environment=environment):
                services = topology.render(
                    "self-hosted",
                    env_file=topology.DEVELOPMENT_ENV_EXAMPLE,
                    overrides={"EIMIR_ENVIRONMENT": environment},
                )["services"]
                self.assertEqual(self.verdict(services["release-guard"]["environment"]), 0)

    def test_the_development_env_example_declares_its_environment_explicitly(self) -> None:
        for path in (topology.DEVELOPMENT_ENV_EXAMPLE, ROOT / "deploy/persistent-development.env.example"):
            with self.subTest(path=path.name):
                self.assertEqual(topology._dotenv(path)["EIMIR_ENVIRONMENT"], "development")

    def test_launcher_and_arcane_mount_the_same_identity_file(self) -> None:
        custom = self.identity_path
        services = topology.render(
            "self-hosted",
            overrides={
                **_production_overrides(),
                "EIMIR_RELEASE_IDENTITY_FILE": str(custom),
            },
        )["services"]
        (mount,) = services["release-guard"]["volumes"]
        self.assertEqual(mount["source"], str(custom))
        environment = launcher.compose_environment(
            backend=ref("backend"), web=ref("web"), identity_file=custom
        )
        self.assertEqual(environment["EIMIR_RELEASE_IDENTITY_FILE"], str(custom.resolve()))


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class BootstrapProfileTest(GuardTestCase):
    """The one-time deletion-authority provisioning is explicit and isolated."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.services = topology.render("self-hosted", overrides=_production_overrides())["services"]
        cls.bootstrap_only = topology.render(
            "bootstrap",
            overrides=_production_overrides(
                EIMIR_ACCOUNT_DELETION_INSTANCE_ID="", COMPOSE_PROFILES="bootstrap"
            ),
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

    def test_bootstrap_uses_the_release_image_identity_and_the_runtime_journal_volume(self) -> None:
        bootstrap = self.bootstrap_only["deletion-authority-bootstrap"]
        self.assertEqual(bootstrap["image"], ref("backend"))
        api = self.services["api"]
        journal_volume = next(v for v in api["volumes"] if v.get("source") == "deletion_journal_data")
        mounts = {v["target"]: v for v in bootstrap["volumes"]}
        self.assertEqual(
            set(mounts), {"/run/eimir/self-hosted-image-identity.json", journal_volume["target"]}
        )
        self.assertTrue(mounts["/run/eimir/self-hosted-image-identity.json"]["read_only"])
        self.assertEqual(mounts[journal_volume["target"]]["source"], "deletion_journal_data")
        self.assertEqual(
            bootstrap["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"],
            api["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"],
        )
        self.assertTrue(
            api["environment"]["EIMIR_ACCOUNT_DELETION_JOURNAL_PATH"].startswith(
                journal_volume["target"] + "/"
            )
        )

    def test_bootstrap_environment_sees_profiles_and_the_instance_id_it_must_not_replace(self) -> None:
        services = topology.render(
            "bootstrap", overrides=_production_overrides(COMPOSE_PROFILES="bootstrap")
        )["services"]
        environment = services["deletion-authority-bootstrap"]["environment"]
        self.assertEqual(environment["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"], INSTANCE_ID)
        self.assertEqual(environment["EIMIR_COMPOSE_PROFILES"], "bootstrap")

    def test_mixed_profile_project_is_refused_by_both_halves(self) -> None:
        mixed = _production_overrides(
            EIMIR_ACCOUNT_DELETION_INSTANCE_ID="", COMPOSE_PROFILES="self-hosted,bootstrap"
        )
        services = topology.render("self-hosted", "bootstrap", overrides=mixed)["services"]
        self.assertEqual(self.verdict(services["release-guard"]["environment"]), 1)
        self.assertEqual(
            guard.bootstrap(
                services["deletion-authority-bootstrap"]["environment"],
                identity_path=self.identity_path,
            ),
            1,
        )


class GuardLauncherTrustContractTest(GuardTestCase):
    """Guard and launcher judge operator inputs against the same published identity."""

    def launcher_accepts(self, identity_path: Path, version: str, backend: str, web: str) -> bool:
        values = {
            "EIMIR_RELEASE_VERSION": version,
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE": backend,
            "EIMIR_SELF_HOSTED_WEB_IMAGE": web,
        }
        try:
            published_backend, published_web = launcher.load_release_identity(identity_path, values)
            launcher.reject_conflicting_image_overrides(
                values, backend=published_backend, web=published_web
            )
        except launcher.ReleaseOperationError:
            return False
        return True

    def guard_accepts(self, identity_path: Path, version: str, backend: str, web: str) -> bool:
        return not guard.release_problems(
            {
                "EIMIR_RELEASE_VERSION": version,
                "EIMIR_GUARD_BACKEND_IMAGE": backend,
                "EIMIR_GUARD_WEB_IMAGE": web,
                "EIMIR_GUARD_PULL_POLICY": "always",
            },
            identity_path=identity_path,
            require_deletion_authority=False,
        )

    def assert_same_verdict(self, identity_path: Path, *case: str, expected: bool) -> None:
        self.assertEqual(self.launcher_accepts(identity_path, *case), expected, "launcher")
        self.assertEqual(self.guard_accepts(identity_path, *case), expected, "guard")

    def test_the_published_identity_itself_is_accepted_by_both(self) -> None:
        self.assert_same_verdict(self.identity_path, VERSION, ref("backend"), ref("web"), expected=True)

    def test_a_valid_digest_pinned_reference_that_is_not_the_published_one_is_rejected_by_both(
        self,
    ) -> None:
        """Regression: syntactically valid, right version, wrong digest."""

        for label, backend, web in (
            ("backend digest", ref("backend", digest=OTHER_DIGEST), ref("web")),
            ("web digest", ref("backend"), ref("web", digest=OTHER_DIGEST)),
            ("swapped digests", ref("backend", digest=DIGEST["web"]), ref("web", digest=DIGEST["backend"])),
        ):
            with self.subTest(label):
                self.assert_same_verdict(self.identity_path, VERSION, backend, web, expected=False)

    def test_malformed_or_unrelated_references_are_rejected_by_both(self) -> None:
        cases = {
            "tag only": ("1.2.3", "ghcr.io/baerenmarke90/eimir-backend:v1.2.3", ref("web")),
            "latest": ("1.2.3", "ghcr.io/baerenmarke90/eimir-backend:latest", ref("web")),
            "local tag": ("1.2.3", "eimir-backend:source-local", ref("web")),
            "version drift": ("1.2.4", ref("backend", "1.2.4"), ref("web", "1.2.4")),
            "roles swapped": ("1.2.3", ref("web"), ref("backend")),
            "foreign namespace": (
                "1.2.3",
                "ghcr.io/other/eimir-backend:v1.2.3@" + DIGEST["backend"],
                ref("web"),
            ),
            "uppercase digest": (
                "1.2.3",
                "ghcr.io/baerenmarke90/eimir-backend:v1.2.3@sha256:" + "A" * 64,
                ref("web"),
            ),
        }
        for label, case in cases.items():
            with self.subTest(label):
                self.assert_same_verdict(self.identity_path, *case, expected=False)

    def test_tampered_or_placeholder_identities_are_rejected_by_both(self) -> None:
        def mutated(mutate) -> dict:  # type: ignore[no-untyped-def]
            identity = published_identity()
            mutate(identity)
            return identity

        tampered = {
            "wrong schema": mutated(lambda i: i.update(schemaVersion=2)),
            "wrong kind": mutated(lambda i: i.update(kind="other")),
            "tag/version mismatch": mutated(lambda i: i["product"].update(tag="v9.9.9")),
            "other release": mutated(lambda i: i["product"].update(version="9.9.9", tag="v9.9.9")),
            "digest field mismatch": mutated(
                lambda i: i["images"]["backend"].update(digest=DIGEST["web"])
            ),
            "roles": mutated(lambda i: i["images"]["backend"].update(roles=["api"])),
            "missing web": mutated(lambda i: i["images"].pop("web")),
            "source checkout placeholder": json.loads(PLACEHOLDER_IDENTITY.read_text(encoding="utf-8")),
        }
        for label, identity in tampered.items():
            with self.subTest(label):
                path = self.identities.write(identity, name="tampered.json")
                self.assert_same_verdict(
                    path, VERSION, ref("backend"), ref("web"), expected=False
                )

    def test_the_source_checkout_placeholder_is_rejected_by_both(self) -> None:
        self.assert_same_verdict(
            PLACEHOLDER_IDENTITY, VERSION, ref("backend"), ref("web"), expected=False
        )

    def test_the_guard_is_stricter_only_where_the_launcher_supplies_the_reference_itself(self) -> None:
        """An empty override is filled from the identity by the launcher; Arcane has no launcher."""

        self.assertTrue(self.launcher_accepts(self.identity_path, VERSION, "", ""))
        self.assertFalse(self.guard_accepts(self.identity_path, VERSION, "", ""))


if __name__ == "__main__":
    unittest.main()
