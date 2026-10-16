#!/usr/bin/env python3
"""Prove fresh restore and schema upgrade for the canonical Self-Hosted stack.

The gate creates a disposable Compose project with synthetic-only credentials
and data. It never accepts an operator project name, environment file, or data
path, so its volume cleanup cannot target a real deployment.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "compose.yaml"
RECOVERY_SCRIPT = ROOT / "scripts" / "self_hosted_recovery.py"
DEPLOYMENT_SMOKE_SCRIPT = ROOT / "scripts" / "deployment_smoke.py"
FIXTURE_SCRIPT = ROOT / "backend" / "scripts" / "recovery_fixture.py"

OWNER_EMAIL = "recovery-owner@fixture.invalid"
PARTNER_EMAIL = "recovery-partner@fixture.invalid"
OUTSIDER_EMAIL = "recovery-outsider@fixture.invalid"
FIXTURE_PASSWORD = "recovery-fixture-password"
SPACE_ID = "01990000-0000-7000-8000-000000000101"
FOREIGN_SPACE_ID = "01990000-0000-7000-8000-000000000102"
MEMORY_ID = "01990000-0000-7000-8000-000000000201"
ATTACHMENT_ID = "01990000-0000-7000-8000-000000000301"
PRIVATE_HEART_ID = "01990000-0000-7000-8000-000000000401"
PARTNER_PRIVATE_HEART_ID = "01990000-0000-7000-8000-000000000402"
FOREIGN_PRIVATE_HEART_ID = "01990000-0000-7000-8000-000000000403"
DURABLE_ORIGINAL = b"eimir-recovery-durable-original-v1"
DURABLE_THUMBNAIL = b"eimir-recovery-durable-thumbnail-v1"
HTTP_TIMEOUT_SECONDS = 20


class AcceptanceError(RuntimeError):
    """The disposable recovery acceptance scenario failed."""


def run(
    command: list[str],
    *,
    action: str,
    diagnostic_markers: tuple[str, ...] = (),
) -> bytes:
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
        )
    except OSError as exc:
        raise AcceptanceError(f"{action} could not be executed.") from exc
    if result.returncode != 0:
        # Never forward arbitrary subprocess output. Callers may expose only a
        # fixed marker that contains no command data, values, or payloads.
        stderr = result.stderr.decode("utf-8", errors="ignore")
        marker = next((item for item in diagnostic_markers if item in stderr), None)
        raise AcceptanceError(
            f"{action} failed"
            + (f": {marker}" if marker is not None else "")
            + "; command output was withheld to avoid emitting credentials "
            "or protected fixture values."
        )
    return result.stdout


def available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def write_environment(path: Path, project_name: str, api_port: int, web_port: int) -> None:
    path.write_text(
        "\n".join(
            (
                f"COMPOSE_PROJECT_NAME={project_name}",
                "COMPOSE_PROFILES=self-hosted",
                "POSTGRES_USER=eimir",
                "POSTGRES_PASSWORD=synthetic-recovery-database-password",
                "POSTGRES_DB=eimir",
                "EIMIR_ENVIRONMENT=development",
                "EIMIR_DEMO_MODE=false",
                "EIMIR_MEDIA_STORE=local",
                "EIMIR_CURSOR_SIGNING_KEY=synthetic-recovery-signing-key-at-least-32-characters",
                'EIMIR_ALLOWED_HOSTS=["localhost","127.0.0.1"]',
                f"EIMIR_PUBLIC_BASE_URL=http://127.0.0.1:{web_port}",
                "EIMIR_BIND_IP=127.0.0.1",
                f"API_PORT={api_port}",
                f"WEB_PORT={web_port}",
                "EIMIR_MAIL_TRANSPORT=log",
                "EIMIR_MAIL_FROM=recovery@fixture.invalid",
                "",
            )
        ),
        encoding="utf-8",
    )
    os.chmod(path, 0o600)


class Scenario:
    def __init__(
        self,
        *,
        project_name: str,
        env_file: Path,
        api_port: int,
        web_port: int,
    ) -> None:
        self.project_name = project_name
        self.env_file = env_file
        self.api_origin = f"http://127.0.0.1:{api_port}"
        self.web_origin = f"http://127.0.0.1:{web_port}"

    def compose(self, *arguments: str) -> list[str]:
        return [
            "docker",
            "compose",
            "--project-name",
            self.project_name,
            "--profile",
            "self-hosted",
            "--env-file",
            str(self.env_file),
            "-f",
            str(COMPOSE_FILE),
            *arguments,
        ]

    def cleanup(self) -> None:
        run(
            self.compose("down", "--volumes", "--remove-orphans"),
            action="Disposable Compose cleanup",
        )

    def start_postgres(self) -> None:
        run(
            self.compose(
                "up",
                "-d",
                "--wait",
                "--wait-timeout",
                "120",
                "postgres",
            ),
            action="Disposable PostgreSQL startup",
        )

    def start_stack(self, *, build: bool) -> None:
        arguments = ["up", "-d"]
        if build:
            arguments.append("--build")
        arguments.extend(("--wait", "--wait-timeout", "300"))
        run(self.compose(*arguments), action="Disposable application startup")

    def migrate(self, revision: str = "head") -> None:
        run(
            self.compose("run", "--rm", "migrate", "alembic", "upgrade", revision),
            action=f"Alembic migration to {revision}",
        )

    def fixture(self, command: str) -> None:
        run(
            self.compose(
                "run",
                "--rm",
                "--no-deps",
                "--volume",
                f"{FIXTURE_SCRIPT}:/app/scripts/recovery_fixture.py:ro",
                "api",
                "python",
                "-m",
                "scripts.recovery_fixture",
                command,
            ),
            action=f"Synthetic recovery fixture {command}",
        )

    def backup(self, archive: Path) -> None:
        run(
            [
                sys.executable,
                str(RECOVERY_SCRIPT),
                "backup",
                "--compose-file",
                str(COMPOSE_FILE),
                "--env-file",
                str(self.env_file),
                "--confirm-project",
                self.project_name,
                "--output",
                str(archive),
            ],
            action="Coordinated Self-Hosted backup",
        )

    def restore(self, archive: Path) -> None:
        run(
            [
                sys.executable,
                str(RECOVERY_SCRIPT),
                "restore",
                "--compose-file",
                str(COMPOSE_FILE),
                "--env-file",
                str(self.env_file),
                "--confirm-project",
                self.project_name,
                "--archive",
                str(archive),
                "--confirm-empty-target",
            ],
            action="Fresh-target Self-Hosted restore",
            diagnostic_markers=(
                "Restore target database is not fresh and empty.",
                "Restore target LocalMediaStore is not fresh and empty.",
                "The backup archive member set is invalid.",
                "The database dump checksum does not match the manifest.",
                "The media archive checksum does not match the manifest.",
                "Restored LocalMediaStore contents do not match the validated archive.",
                "Restored database revision does not match the validated archive.",
            ),
        )

    def request(
        self,
        path: str,
        *,
        expected_status: int,
        method: str = "GET",
        payload: dict[str, object] | None = None,
        bearer: str | None = None,
    ) -> bytes:
        headers = {"Accept": "application/json"}
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload).encode("utf-8")
        if bearer is not None:
            headers["Authorization"] = f"Bearer {bearer}"
        request = urllib.request.Request(
            f"{self.api_origin}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                status = response.status
                body = response.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            exc.read()
            body = b""
        except OSError as exc:
            raise AcceptanceError(f"HTTP {method} {path} could not be completed.") from exc
        if status != expected_status:
            raise AcceptanceError(
                f"HTTP {method} {path} returned {status}; expected {expected_status}."
            )
        return body

    def sign_in(self, email: str) -> str:
        body = self.request(
            "/api/v1/auth/sign-in",
            expected_status=200,
            method="POST",
            payload={
                "email": email,
                "password": FIXTURE_PASSWORD,
                "deviceName": "Self-Hosted recovery acceptance",
                "platform": "ops-acceptance",
            },
        )
        try:
            response = json.loads(body.decode("utf-8"))
            token = response["tokens"]["accessToken"]
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as exc:
            raise AcceptanceError("Synthetic sign-in returned an invalid session.") from exc
        if not isinstance(token, str) or not token:
            raise AcceptanceError("Synthetic sign-in returned an invalid access token.")
        return token

    def verify_application(self) -> None:
        run(
            [
                sys.executable,
                str(DEPLOYMENT_SMOKE_SCRIPT),
                "--base-url",
                self.web_origin,
                "--allow-unverified-local",
            ],
            action="Existing deployment smoke after recovery",
        )
        ready = self.request("/api/v1/health/ready", expected_status=200)
        try:
            readiness = json.loads(ready.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AcceptanceError("Readiness did not return valid JSON.") from exc
        if not isinstance(readiness, dict) or readiness.get("status") != "ok":
            raise AcceptanceError("Readiness did not report an operational application.")

        sessions = {
            "owner": self.sign_in(OWNER_EMAIL),
            "partner": self.sign_in(PARTNER_EMAIL),
            "outsider": self.sign_in(OUTSIDER_EMAIL),
        }
        try:
            shared_memory = f"/api/v1/spaces/{SPACE_ID}/memories/{MEMORY_ID}"
            self.request(shared_memory, expected_status=200, bearer=sessions["owner"])
            self.request(shared_memory, expected_status=200, bearer=sessions["partner"])
            self.request(shared_memory, expected_status=404, bearer=sessions["outsider"])

            owner_private = f"/api/v1/spaces/{SPACE_ID}/heart-moments/{PRIVATE_HEART_ID}"
            self.request(owner_private, expected_status=200, bearer=sessions["owner"])
            self.request(owner_private, expected_status=404, bearer=sessions["partner"])

            partner_private = f"/api/v1/spaces/{SPACE_ID}/heart-moments/{PARTNER_PRIVATE_HEART_ID}"
            self.request(partner_private, expected_status=200, bearer=sessions["partner"])
            self.request(partner_private, expected_status=404, bearer=sessions["owner"])

            foreign_private = (
                f"/api/v1/spaces/{FOREIGN_SPACE_ID}/heart-moments/{FOREIGN_PRIVATE_HEART_ID}"
            )
            self.request(foreign_private, expected_status=200, bearer=sessions["outsider"])
            self.request(foreign_private, expected_status=404, bearer=sessions["owner"])

            media = f"/api/v1/spaces/{SPACE_ID}/attachments/{ATTACHMENT_ID}/content"
            original = self.request(media, expected_status=200, bearer=sessions["partner"])
            if original != DURABLE_ORIGINAL:
                raise AcceptanceError("Restored durable media bytes changed.")
            thumbnail = self.request(
                f"{media}?variant=thumbnail",
                expected_status=200,
                bearer=sessions["owner"],
            )
            if thumbnail != DURABLE_THUMBNAIL:
                raise AcceptanceError("Restored durable thumbnail bytes changed.")
            self.request(media, expected_status=404, bearer=sessions["outsider"])
        finally:
            for token in sessions.values():
                self.request(
                    "/api/v1/auth/sign-out",
                    expected_status=204,
                    method="POST",
                    bearer=token,
                )


def step(message: str) -> None:
    print(f"recovery acceptance: {message}", flush=True)


def run_acceptance() -> None:
    project_name = f"eimir-recovery-{uuid4().hex[:12]}"
    api_port = available_port()
    web_port = available_port()
    if api_port == web_port:
        web_port = available_port()

    with tempfile.TemporaryDirectory(prefix="eimir-recovery-acceptance-") as temp_name:
        temp = Path(temp_name)
        env_file = temp / "synthetic.env"
        archive = temp / "verified-backup.tar"
        write_environment(env_file, project_name, api_port, web_port)
        scenario = Scenario(
            project_name=project_name,
            env_file=env_file,
            api_port=api_port,
            web_port=web_port,
        )
        try:
            step("building and seeding the current schema")
            scenario.start_stack(build=True)
            scenario.fixture("seed-current")

            step("creating a coordinated PostgreSQL and LocalMediaStore backup")
            scenario.backup(archive)

            step("discarding the source and restoring into fresh volumes")
            scenario.cleanup()
            scenario.start_postgres()
            scenario.restore(archive)
            scenario.migrate()
            scenario.start_stack(build=False)
            scenario.fixture("verify-restored")
            scenario.verify_application()

            step("building the reproducible Alembic 0032 upgrade baseline")
            scenario.cleanup()
            scenario.start_postgres()
            scenario.migrate("0032")
            scenario.fixture("seed-0032")

            step("rolling the prior schema forward and checking the application")
            scenario.migrate()
            scenario.start_stack(build=False)
            scenario.fixture("verify-upgraded")
            scenario.verify_application()
        finally:
            scenario.cleanup()


def main() -> int:
    try:
        run_acceptance()
    except AcceptanceError as exc:
        print(f"Self-Hosted recovery acceptance failed: {exc}", file=sys.stderr)
        return 1
    print("Self-Hosted recovery acceptance completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
