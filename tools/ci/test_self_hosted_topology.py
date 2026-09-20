#!/usr/bin/env python3
"""Contract checks for the released Self-Hosted runtime topology (#827).

The tests resolve the real canonical ``compose.yaml`` with Docker Compose and
assert behavior of the *rendered* topology rather than strings in the YAML:

* released Self-Hosted consumes externally built OCI images and needs no
  application source build context in any profile;
* API, worker and migrate share exactly one backend image but remain separate
  processes with their own lifecycle;
* normal startup order is ``postgres -> migrate -> api/worker -> web`` and never
  depends on ``demo-init``;
* Demo initialization exists only behind the additive ``demo`` profile;
* every service has one explicit keep/demo-only decision that the Self-Hosting
  runbook documents.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "compose.yaml"
RELEASE_ENV_EXAMPLE = ROOT / "deploy/self-hosted-release.env.example"
DEVELOPMENT_ENV_EXAMPLE = ROOT / ".env.example"
SELF_HOSTING_DOC = ROOT / "docs/SELF-HOSTING.md"

# One explicit decision per Self-Hosted service. The Self-Hosting runbook must
# carry the same table; ``DocumentedDecisionTest`` keeps both in sync.
TOPOLOGY_DECISIONS = {
    "postgres": "KEEP",
    "migrate": "KEEP",
    "demo-init": "DEMO-ONLY",
    "api": "KEEP",
    "worker": "KEEP",
    "web": "KEEP",
}
RELEASE_SERVICES = {"postgres", "migrate", "api", "worker", "web"}
BACKEND_ROLES = ("api", "worker", "migrate")
DEPLOYMENT_ENVIRONMENT_PREFIXES = ("EIMIR_", "SBS_", "COMPOSE_", "POSTGRES_", "API_", "WEB_")


def _dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _clean_environment() -> dict[str, str]:
    """Host deployment variables must not leak into the rendered contract."""

    return {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(DEPLOYMENT_ENVIRONMENT_PREFIXES)
        and key not in {"TRUSTED_PROXY_IPS"}
    }


def render(
    *profiles: str,
    env_file: Path = RELEASE_ENV_EXAMPLE,
    overrides: dict[str, str] | None = None,
) -> dict:
    """Return ``docker compose config`` as JSON for the given profiles."""

    with tempfile.TemporaryDirectory() as tmp:
        merged = _dotenv(env_file)
        # The templates deliberately pin COMPOSE_PROFILES themselves; the test
        # selects profiles explicitly through the CLI instead.
        merged.pop("COMPOSE_PROFILES", None)
        merged.update(overrides or {})
        rendered_env = Path(tmp) / "test.env"
        rendered_env.write_text(
            "".join(f"{key}={value}\n" for key, value in merged.items()),
            encoding="utf-8",
        )
        command = ["docker", "compose"]
        for profile in profiles:
            command += ["--profile", profile]
        command += [
            "--env-file",
            str(rendered_env),
            "--file",
            str(COMPOSE),
            "config",
            "--format",
            "json",
        ]
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=_clean_environment(),
            capture_output=True,
            text=True,
        )
    if result.returncode != 0:
        raise AssertionError(f"compose config failed for {profiles}: {result.stderr}")
    return json.loads(result.stdout)


def _command(service: dict) -> list[str]:
    """Compose renders an absent command as ``null``."""

    return service.get("command") or []


def _depends_on(service: dict) -> dict[str, str]:
    return {name: spec["condition"] for name, spec in service.get("depends_on", {}).items()}


def _startup_order(services: dict[str, dict]) -> list[set[str]]:
    """Group services into dependency waves; fail on cycles or unknown targets."""

    remaining = {name: set(_depends_on(spec)) for name, spec in services.items()}
    unknown = {dep for deps in remaining.values() for dep in deps} - set(services)
    if unknown:
        raise AssertionError(f"dependencies on services outside the profile: {sorted(unknown)}")
    waves: list[set[str]] = []
    done: set[str] = set()
    while remaining:
        wave = {name for name, deps in remaining.items() if deps <= done}
        if not wave:
            raise AssertionError(f"dependency cycle among {sorted(remaining)}")
        waves.append(wave)
        done |= wave
        for name in wave:
            del remaining[name]
    return waves


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class ReleasedSelfHostedImageContractTest(unittest.TestCase):
    """Released Self-Hosted consumes prebuilt images; nothing builds on the host."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = render("self-hosted")
        cls.services = cls.config["services"]
        cls.version = _dotenv(RELEASE_ENV_EXAMPLE)["EIMIR_RELEASE_VERSION"]

    def test_release_topology_contains_exactly_the_runtime_services(self) -> None:
        self.assertEqual(set(self.services), RELEASE_SERVICES)

    def test_no_application_service_in_any_profile_has_a_source_build(self) -> None:
        every_profile = render("*")
        for name, service in every_profile["services"].items():
            with self.subTest(service=name):
                self.assertNotIn("build", service)
        text = COMPOSE.read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"(?m)^\s+(build|context|dockerfile):", text))

    def test_backend_roles_share_one_published_backend_image(self) -> None:
        images = {self.services[role]["image"] for role in BACKEND_ROLES}
        self.assertEqual(
            images, {f"ghcr.io/baerenmarke90/eimir-backend:v{self.version}"}
        )

    def test_web_uses_its_own_published_web_image(self) -> None:
        self.assertEqual(
            self.services["web"]["image"],
            f"ghcr.io/baerenmarke90/eimir-web:v{self.version}",
        )

    def test_released_application_images_are_always_pulled(self) -> None:
        for name in (*BACKEND_ROLES, "web"):
            with self.subTest(service=name):
                self.assertEqual(self.services[name]["pull_policy"], "always")

    def test_digest_qualified_identity_reaches_every_role(self) -> None:
        backend = (
            f"ghcr.io/baerenmarke90/eimir-backend:v{self.version}@sha256:" + "a" * 64
        )
        web = f"ghcr.io/baerenmarke90/eimir-web:v{self.version}@sha256:" + "b" * 64
        config = render(
            "self-hosted",
            overrides={
                "EIMIR_SELF_HOSTED_BACKEND_IMAGE": backend,
                "EIMIR_SELF_HOSTED_WEB_IMAGE": web,
            },
        )
        for role in BACKEND_ROLES:
            self.assertEqual(config["services"][role]["image"], backend)
        self.assertEqual(config["services"]["web"]["image"], web)

    def test_development_source_images_use_the_same_topology(self) -> None:
        """Development differs by image tag and pull policy, never by services."""

        development = render("self-hosted", env_file=DEVELOPMENT_ENV_EXAMPLE)
        self.assertEqual(set(development["services"]), RELEASE_SERVICES)
        for role in BACKEND_ROLES:
            spec = development["services"][role]
            self.assertEqual(spec["image"], "eimir-backend:source-local")
            self.assertEqual(spec["pull_policy"], "never")
        for name, service in self.services.items():
            self.assertEqual(
                _depends_on(development["services"][name]),
                _depends_on(service),
                name,
            )


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class RuntimeLifecycleContractTest(unittest.TestCase):
    """Startup order, restart semantics and process isolation."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.services = render("self-hosted")["services"]

    def test_startup_order_is_database_migration_runtime_web(self) -> None:
        self.assertEqual(
            _startup_order(self.services),
            [{"postgres"}, {"migrate"}, {"api", "worker"}, {"web"}],
        )

    def test_dependency_conditions_are_strict(self) -> None:
        self.assertEqual(_depends_on(self.services["postgres"]), {})
        self.assertEqual(
            _depends_on(self.services["migrate"]), {"postgres": "service_healthy"}
        )
        for role in ("api", "worker"):
            self.assertEqual(
                _depends_on(self.services[role]), {"migrate": "service_completed_successfully"}
            )
        self.assertEqual(_depends_on(self.services["web"]), {"api": "service_healthy"})

    def test_migration_is_a_one_shot_that_never_restarts_itself(self) -> None:
        migrate = self.services["migrate"]
        self.assertEqual(migrate["restart"], "no")
        self.assertEqual(migrate["command"], ["alembic", "upgrade", "head"])

    def test_only_migrate_runs_migrations(self) -> None:
        """Folding migrations into API/worker would race across instances."""

        for name in ("api", "worker", "web"):
            with self.subTest(service=name):
                command = " ".join(_command(self.services[name]))
                self.assertNotIn("alembic", command)

    def test_migrate_receives_only_the_database_connection(self) -> None:
        self.assertEqual(
            set(self.services["migrate"]["environment"]), {"EIMIR_DATABASE_URL"}
        )

    def test_long_running_services_restart_and_migration_does_not(self) -> None:
        for name in ("postgres", "api", "worker", "web"):
            with self.subTest(service=name):
                self.assertEqual(self.services[name]["restart"], "unless-stopped")

    def test_api_and_worker_are_distinct_processes_of_one_image(self) -> None:
        api, worker = self.services["api"], self.services["worker"]
        self.assertEqual(api["image"], worker["image"])
        self.assertEqual(_command(api), [])  # image CMD: uvicorn
        self.assertEqual(_command(worker), ["python", "-m", "eimir.jobs.runner"])
        self.assertNotIn("ports", worker)
        self.assertIn("healthcheck", api)

    def test_web_stays_a_separate_runtime_that_waits_for_api_readiness(self) -> None:
        web = self.services["web"]
        self.assertNotEqual(web["image"], self.services["api"]["image"])
        self.assertEqual(_depends_on(web), {"api": "service_healthy"})

    def test_only_api_and_web_publish_host_ports_on_loopback_by_default(self) -> None:
        for name, service in self.services.items():
            ports = service.get("ports", [])
            if name in {"api", "web"}:
                self.assertTrue(ports, name)
                self.assertTrue(all(p["host_ip"] == "127.0.0.1" for p in ports), name)
            else:
                self.assertEqual(ports, [], name)


@unittest.skipUnless(shutil.which("docker"), "docker is required to resolve compose config")
class DemoInitializationContractTest(unittest.TestCase):
    """Demo initialization is explicit and never part of normal startup."""

    def test_normal_selfhosted_profile_has_no_demo_initialization(self) -> None:
        services = render("self-hosted")["services"]
        self.assertNotIn("demo-init", services)
        for name, service in services.items():
            self.assertNotIn("demo-init", _depends_on(service), name)
            self.assertNotIn("scripts.demo_space", " ".join(_command(service)), name)

    def test_demo_profile_is_additive_and_adds_only_the_one_shot(self) -> None:
        normal = render("self-hosted")["services"]
        demo = render("self-hosted", "demo")["services"]
        self.assertEqual(set(demo) - set(normal), {"demo-init"})
        init = demo["demo-init"]
        self.assertEqual(init["image"], demo["api"]["image"])
        self.assertEqual(init["command"], ["python", "-m", "scripts.demo_space", "ensure"])
        self.assertEqual(init["restart"], "no")
        self.assertEqual(_depends_on(init), {"migrate": "service_completed_successfully"})

    def test_no_runtime_service_waits_for_demo_initialization(self) -> None:
        for name, service in render("self-hosted", "demo")["services"].items():
            self.assertNotIn("demo-init", _depends_on(service), name)

    def test_demo_initialization_reuses_the_demo_environment_contract(self) -> None:
        """``ensure`` only acts when the runtime is an enabled Demo deployment."""

        env = render(
            "self-hosted",
            "demo",
            overrides={"EIMIR_ENVIRONMENT": "demo", "EIMIR_DEMO_MODE": "true"},
        )["services"]["demo-init"]["environment"]
        self.assertEqual(env["EIMIR_ENVIRONMENT"], "demo")
        self.assertEqual(env["EIMIR_DEMO_MODE"], "true")

    def test_cloud_profile_never_carries_demo_initialization(self) -> None:
        self.assertNotIn("demo-init", render("cloud")["services"])


class DocumentedDecisionTest(unittest.TestCase):
    """The runbook records the same keep/demo-only decision as this contract."""

    def test_every_service_has_a_documented_decision_and_reason(self) -> None:
        text = SELF_HOSTING_DOC.read_text(encoding="utf-8")
        rows = dict(
            (match.group(1), (match.group(2), match.group(3).strip()))
            for match in re.finditer(
                r"(?m)^\| `([a-z-]+)` \| (KEEP|REMOVE|DEMO-ONLY|INTEGRATE) \| (.+?) \|\s*$",
                text,
            )
        )
        self.assertEqual({name: rows[name][0] for name in rows}, TOPOLOGY_DECISIONS)
        for name, (_, reason) in rows.items():
            self.assertGreater(len(reason.split()), 5, f"{name} needs a real rationale")

    def test_decisions_cover_every_self_hosted_service_in_compose(self) -> None:
        text = COMPOSE.read_text(encoding="utf-8")
        declared = set()
        for name, decision in TOPOLOGY_DECISIONS.items():
            profile = "demo" if decision == "DEMO-ONLY" else "self-hosted"
            block = re.search(
                rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|^networks:)", text
            )
            self.assertIsNotNone(block, name)
            self.assertIn(f'profiles: ["{profile}"]', block.group(1), name)
            declared.add(name)
        every_self_hosted = {
            match.group(1)
            for match in re.finditer(
                r'(?ms)^  ([a-z-]+):\n    profiles: \["(?:self-hosted|demo)"\]', text
            )
        }
        self.assertEqual(every_self_hosted, declared)


if __name__ == "__main__":
    unittest.main()
