#!/usr/bin/env python3
"""Rehearse Self-Hosted install, upgrade, rollback and Demo lifecycle (#827).

Runs the canonical ``compose.yaml`` (profile ``self-hosted``) against two local
backend "releases" derived from one prebuilt backend image and proves the
deployment semantics that ``docs/SELF-HOSTING.md`` promises:

1. fresh installation: ``postgres -> migrate -> api/worker -> web`` with no
   ``demo-init`` container;
2. upgrade to a release without schema change, and rollback to the previous
   release (allowed: the schema is compatible);
3. upgrade to a release with a new migration (the one-shot ``migrate`` service
   applies it exactly once) and refusal of a rollback to the previous release
   while the database is ahead of it: the deployment fails closed, data and
   schema are untouched, and re-selecting the newer release recovers;
4. Demo lifecycle: normal startup never initializes Demo data; the explicit
   ``demo-init`` command (profile ``demo``) creates it idempotently.

The rehearsal uses local image tags (the same boundary as source-built
Development/CI). Registry pulls and the digest-qualified release identity are
covered by ``scripts/self_hosted_release.py`` and the protected publication
workflow, not here. Refuses registry references and Production.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import textwrap
import time
from pathlib import Path

try:
    from scripts.build_self_hosted_source import SourceBuildError, require_local_tag
    from scripts.self_hosted_release import DEPLOY_SEQUENCE
except ModuleNotFoundError:  # Direct ``python scripts/...`` execution.
    from build_self_hosted_source import SourceBuildError, require_local_tag
    from self_hosted_release import DEPLOY_SEQUENCE

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "compose.yaml"
DEPLOYMENT_ENVIRONMENT_PREFIXES = ("EIMIR_", "SBS_", "COMPOSE_", "POSTGRES_")
REHEARSAL_REVISION = "zz9001"
DATABASE_USER = "eimir"
DATABASE_NAME = "eimir"


class RehearsalError(RuntimeError):
    """A deployment semantic promised by the runbook did not hold."""


def render_release_migration(revision: str, down_revision: str) -> str:
    """Return a minimal schema-changing Alembic revision for the newer release."""

    if not re.fullmatch(r"[A-Za-z0-9_]+", revision) or not re.fullmatch(
        r"[A-Za-z0-9_]+", down_revision
    ):
        raise RehearsalError("Alembic revision ids must be simple identifiers")
    return textwrap.dedent(
        f'''\
        """Rehearsal-only schema change carried by the newer release."""

        import sqlalchemy as sa
        from alembic import op

        revision = "{revision}"
        down_revision = "{down_revision}"
        branch_labels = None
        depends_on = None


        def upgrade() -> None:
            op.create_table(
                "rehearsal_release_marker",
                sa.Column("id", sa.Integer(), primary_key=True),
            )


        def downgrade() -> None:
            op.drop_table("rehearsal_release_marker")
        '''
    )


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def clean_environment() -> dict[str, str]:
    return {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(DEPLOYMENT_ENVIRONMENT_PREFIXES)
    }


class Stack:
    """One isolated Compose project for a single rehearsal scenario."""

    def __init__(self, name: str, work: Path, overrides: dict[str, str]) -> None:
        self.project = name
        self.api_port = free_port()
        self.web_port = free_port()
        self.env: dict[str, str] = {
            "COMPOSE_PROJECT_NAME": name,
            "EIMIR_ENVIRONMENT": "development",
            "EIMIR_SELF_HOSTED_PULL_POLICY": "never",
            "POSTGRES_USER": DATABASE_USER,
            "POSTGRES_DB": DATABASE_NAME,
            "POSTGRES_PASSWORD": secrets.token_urlsafe(24),
            "API_PORT": str(self.api_port),
            "WEB_PORT": str(self.web_port),
            "EIMIR_BIND_IP": "127.0.0.1",
            "EIMIR_MAIL_TRANSPORT": "log",
            **overrides,
        }
        self.env_file = work / f"{name}.env"
        self.write_env()

    def write_env(self) -> None:
        self.env_file.write_text(
            "".join(f"{key}={value}\n" for key, value in self.env.items()),
            encoding="utf-8",
        )
        self.env_file.chmod(0o600)

    def select_images(self, backend: str, web: str) -> None:
        self.env["EIMIR_SELF_HOSTED_BACKEND_IMAGE"] = backend
        self.env["EIMIR_SELF_HOSTED_WEB_IMAGE"] = web
        self.write_env()

    def compose(
        self, *args: str, profiles: tuple[str, ...] = ("self-hosted",), check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        command = ["docker", "compose"]
        for profile in profiles:
            command += ["--profile", profile]
        command += ["--env-file", str(self.env_file), "--file", str(COMPOSE_FILE), *args]
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=clean_environment(),
            capture_output=True,
            text=True,
        )
        if check and result.returncode != 0:
            raise RehearsalError(
                f"docker compose {' '.join(args)} failed ({result.returncode}):\n"
                f"{result.stdout}\n{result.stderr}"
            )
        return result

    def deploy(
        self, profiles: tuple[str, ...] = ("self-hosted",), *, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        """Run the launcher's deploy sequence; stop at the first failing step.

        The registry pull is skipped: rehearsal images are local tags with
        ``pull_policy=never``.
        """

        result = subprocess.CompletedProcess([], 0, "", "")
        for action, arguments in DEPLOY_SEQUENCE:
            if arguments[0] == "pull":
                continue
            result = self.compose(*arguments, profiles=profiles, check=False)
            if result.returncode != 0:
                if check:
                    raise RehearsalError(
                        f"{action} failed ({result.returncode}):\n{result.stdout}\n{result.stderr}"
                    )
                return result
        return result

    def containers(self, *, profiles: tuple[str, ...] = ("self-hosted",)) -> dict[str, dict]:
        """Map service -> {state, exit_code, image_id} for all containers, running or not."""

        listing = self.compose("ps", "-a", "--format", "json", profiles=profiles).stdout
        rows = [json.loads(line) for line in listing.splitlines() if line.strip()]
        result: dict[str, dict] = {}
        for row in rows:
            inspected = json.loads(
                subprocess.run(
                    ["docker", "inspect", row["ID"]],
                    check=True, capture_output=True, text=True,
                ).stdout
            )[0]
            result[row["Service"]] = {
                "state": inspected["State"]["Status"],
                "exit_code": inspected["State"]["ExitCode"],
                "image_id": inspected["Image"],
            }
        return result

    def sql(self, statement: str) -> str:
        return self.compose(
            "exec", "-T", "postgres", "psql", "-U", DATABASE_USER, "-d", DATABASE_NAME,
            "-tAc", statement,
        ).stdout.strip()

    def schema_revision(self) -> str:
        return self.sql("SELECT version_num FROM alembic_version")

    def api(self, path: str, *, method: str = "GET", body: dict | None = None) -> tuple[int, str]:
        """Call the API from inside the ``api`` container over loopback.

        A request through the published host port is not Docker-loopback from the
        application's point of view and would trip the non-loopback HTTPS rule.
        """

        script = (
            "import json, sys, urllib.error, urllib.request\n"
            "path, method, body = sys.argv[1:4]\n"
            "request = urllib.request.Request('http://127.0.0.1:8000' + path,"
            " data=body.encode() if body else None, method=method,"
            " headers={'Content-Type': 'application/json'})\n"
            "try:\n"
            "    response = urllib.request.urlopen(request, timeout=15)\n"
            "    print(json.dumps([response.status, response.read().decode()]))\n"
            "except urllib.error.HTTPError as error:\n"
            "    print(json.dumps([error.code, error.read().decode()]))\n"
        )
        output = self.compose(
            "exec", "-T", "api", "python", "-c", script, path, method,
            "" if body is None else json.dumps(body),
        ).stdout
        status, text = json.loads(output)
        return int(status), str(text)

    def destroy(self) -> None:
        self.compose(
            "down", "-v", "--remove-orphans", profiles=("self-hosted", "demo"), check=False
        )


def docker_image_id(reference: str) -> str:
    return subprocess.run(
        ["docker", "image", "inspect", reference, "--format", "{{.Id}}"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()


def build_release(base: str, tag: str, work: Path, *, migration: str | None) -> str:
    """Derive a distinct local backend "release" from the prebuilt base image."""

    context = work / tag.replace(":", "_")
    context.mkdir()
    lines = [f"FROM {base}", f'LABEL org.eimir.rehearsal.release="{tag}"']
    if migration is not None:
        (context / "release_migration.py").write_text(migration, encoding="utf-8")
        lines.append("COPY release_migration.py /app/alembic/versions/zz_rehearsal_release.py")
    (context / "Dockerfile").write_text("\n".join(lines) + "\n", encoding="utf-8")
    subprocess.run(
        ["docker", "build", "--quiet", "--tag", tag, str(context)],
        check=True, capture_output=True, text=True,
    )
    return tag


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise RehearsalError(message)


def step(title: str) -> None:
    print(f"\n== {title}", flush=True)


def wait_ready(stack: Stack) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        status, body = stack.api("/api/v1/health/ready")
        if status == 200 and json.loads(body).get("database") == "ok":
            return
        time.sleep(1)
    raise RehearsalError("API did not report ready with a healthy database")


def assert_release_running(stack: Stack, backend_image: str, label: str) -> None:
    expected = docker_image_id(backend_image)
    seen = stack.containers()
    for role in ("api", "worker", "migrate"):
        expect(role in seen, f"{label}: {role} container is missing")
        expect(
            seen[role]["image_id"] == expected,
            f"{label}: {role} does not run the selected backend image",
        )
    for role in ("api", "worker", "web", "postgres"):
        expect(seen[role]["state"] == "running", f"{label}: {role} is {seen[role]['state']}")
    expect(seen["migrate"]["exit_code"] == 0, f"{label}: migrate did not exit 0")
    expect("demo-init" not in seen, f"{label}: normal startup created demo-init")
    wait_ready(stack)


def rehearse_release_lifecycle(base_backend: str, web: str, work: Path, run_id: str) -> None:
    head = subprocess.run(
        ["docker", "run", "--rm", base_backend, "alembic", "heads"],
        check=True, capture_output=True, text=True,
    ).stdout.split()[0]
    prefix = f"eimir-backend:rehearsal-{run_id}"
    stable = build_release(base_backend, f"{prefix}-stable", work, migration=None)
    same_schema = build_release(base_backend, f"{prefix}-patch", work, migration=None)
    newer = build_release(
        base_backend,
        f"eimir-backend:rehearsal-{run_id}-schema",
        work,
        migration=render_release_migration(REHEARSAL_REVISION, head),
    )
    stack = Stack(f"eimir-rehearsal-{run_id}", work, {})
    try:
        step("1. fresh installation from release A")
        stack.select_images(stable, web)
        stack.deploy()
        assert_release_running(stack, stable, "fresh install")
        expect(stack.schema_revision() == head, "fresh install did not migrate to head")
        stack.sql("CREATE TABLE rehearsal_user_data (note text)")
        stack.sql("INSERT INTO rehearsal_user_data VALUES ('survives every step')")

        step("2. upgrade to release B (no schema change), rollback to A")
        stack.select_images(same_schema, web)
        stack.deploy()
        assert_release_running(stack, same_schema, "upgrade without schema change")
        expect(stack.schema_revision() == head, "schema changed without a migration")
        stack.select_images(stable, web)
        stack.deploy()
        assert_release_running(stack, stable, "compatible rollback")
        expect(stack.schema_revision() == head, "compatible rollback altered the schema")

        step("3. upgrade to release C (new migration) applies it exactly once")
        stack.select_images(newer, web)
        stack.deploy()
        assert_release_running(stack, newer, "upgrade with schema change")
        expect(
            stack.schema_revision() == REHEARSAL_REVISION,
            "migrate did not apply the release migration",
        )
        expect(
            stack.sql("SELECT to_regclass('rehearsal_release_marker') IS NOT NULL") == "t",
            "release migration objects are missing",
        )

        step("4. rollback C -> A with an incompatible schema fails closed")
        running_before = stack.containers()
        stack.select_images(stable, web)
        refused = stack.deploy(check=False)
        expect(refused.returncode != 0, "rollback to a release older than the schema was accepted")
        after_refusal = stack.containers()
        newer_id = docker_image_id(newer)
        # The refusal happens before any runtime container is replaced: the
        # running release C keeps serving, untouched and healthy.
        for role in ("api", "worker", "web", "postgres"):
            expect(
                after_refusal[role]["state"] == "running",
                f"{role} was taken down by a refused rollback ({after_refusal[role]['state']})",
            )
            expect(
                after_refusal[role]["image_id"] == running_before[role]["image_id"],
                f"{role} was replaced by a refused rollback",
            )
        for role in ("api", "worker"):
            expect(
                after_refusal[role]["image_id"] == newer_id,
                f"{role} no longer runs release C after the refused rollback",
            )
        wait_ready(stack)
        expect(
            stack.schema_revision() == REHEARSAL_REVISION,
            "refused rollback changed the schema revision",
        )
        expect(
            stack.sql("SELECT note FROM rehearsal_user_data") == "survives every step",
            "refused rollback lost application data",
        )
        expect(
            stack.sql("SELECT to_regclass('rehearsal_release_marker') IS NOT NULL") == "t",
            "refused rollback dropped release objects",
        )
        print(
            f"   refused by the migration step (exit {refused.returncode}); "
            "release C keeps running"
        )

        step("5. re-selecting the newer release recovers")
        stack.select_images(newer, web)
        stack.deploy()
        assert_release_running(stack, newer, "recovery")
        expect(stack.schema_revision() == REHEARSAL_REVISION, "recovery changed the schema")
        expect(
            stack.sql("SELECT note FROM rehearsal_user_data") == "survives every step",
            "recovery lost application data",
        )
        print("release lifecycle rehearsal passed")
    finally:
        stack.destroy()
        for tag in (stable, same_schema, newer):
            subprocess.run(["docker", "image", "rm", "--force", tag], capture_output=True)


def rehearse_demo_lifecycle(backend: str, web: str, work: Path, run_id: str) -> None:
    stack = Stack(
        f"eimir-rehearsal-demo-{run_id}",
        work,
        {
            "EIMIR_ENVIRONMENT": "demo",
            "EIMIR_DEMO_MODE": "true",
            "EIMIR_PUBLIC_BASE_URL": "https://demo.rehearsal.invalid",
            "EIMIR_ALLOWED_HOSTS": '["demo.rehearsal.invalid","localhost","127.0.0.1"]',
            "EIMIR_CURSOR_SIGNING_KEY": secrets.token_urlsafe(48),
            "EIMIR_MAIL_TRANSPORT": "none",
        },
    )
    stack.select_images(backend, web)
    try:
        step("6. normal startup does not initialize Demo data")
        stack.deploy()
        expect("demo-init" not in stack.containers(), "normal startup created demo-init")
        status, body = stack.api("/api/v1/demo/entry", method="POST", body={"persona": "LEA"})
        expect(
            status == 404 and "DEMO_IDENTITY_MISSING" in body,
            f"normal startup unexpectedly provided Demo identities ({status})",
        )

        step("7. explicit demo-init command initializes Demo data")
        # ``up --wait`` treats an exited standalone one-shot as a failure, so the
        # Demo step is an explicit ``run``: it starts only its own dependencies.
        profiles = ("self-hosted", "demo")
        created = stack.compose("run", "--rm", "demo-init", profiles=profiles)
        expect("created" in created.stdout, "demo-init did not create the canonical Space")
        status, _ = stack.api("/api/v1/demo/entry", method="POST", body={"persona": "LEA"})
        expect(status == 200, f"Demo entry is unavailable after explicit initialization ({status})")

        step("8. demo-init is idempotent and survives a normal redeploy")
        again = stack.compose("run", "--rm", "demo-init", profiles=profiles)
        expect("already present" in again.stdout, "demo-init is not idempotent")
        stack.deploy()
        expect("demo-init" not in stack.containers(), "normal redeploy revived demo-init")
        status, _ = stack.api("/api/v1/demo/entry", method="POST", body={"persona": "ALEX"})
        expect(status == 200, f"Demo data did not survive a normal redeploy ({status})")
        print("demo lifecycle rehearsal passed")
    finally:
        stack.destroy()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--backend-image", default="eimir-backend:source-local")
    parser.add_argument("--web-image", default="eimir-web:source-local")
    parser.add_argument(
        "--scenario",
        choices=("all", "release", "demo"),
        default="all",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        backend = require_local_tag(args.backend_image, "backend", "eimir-backend")
        web = require_local_tag(args.web_image, "web", "eimir-web")
        for image in (backend, web):
            probe = subprocess.run(["docker", "image", "inspect", image], capture_output=True)
            if probe.returncode:
                raise RehearsalError(f"local image {image} does not exist; build it first")
        run_id = secrets.token_hex(3)
        work = Path(tempfile.mkdtemp(prefix="eimir-rehearsal-"))
        try:
            if args.scenario in {"all", "release"}:
                rehearse_release_lifecycle(backend, web, work, run_id)
            if args.scenario in {"all", "demo"}:
                rehearse_demo_lifecycle(backend, web, work, run_id)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    except (RehearsalError, SourceBuildError, subprocess.CalledProcessError) as error:
        detail = error.stderr if isinstance(error, subprocess.CalledProcessError) else error
        print(f"Self-Hosted rehearsal failed: {detail}", file=sys.stderr)
        return 1
    print("\nSelf-Hosted rehearsal passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
