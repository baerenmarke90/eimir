#!/usr/bin/env python3
"""Run canonical Compose against images built from an immutable clean Git snapshot.

Released Self-Hosted consumes published OCI images and does not use this helper.
This wrapper exists for Development/CI/exceptional verified-source testing. It exports
canonical ``compose.yaml`` plus backend/Web source from one committed tree, builds local
images when the requested Compose command needs them, and points that same manifest at
the verified local tags. No second tracked Compose topology is permitted.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

try:
    from scripts._identity_environment import legacy_key, process_value
except ModuleNotFoundError:  # Direct ``python scripts/...`` execution.
    from _identity_environment import legacy_key, process_value

REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
PROJECT_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
REQUIRED_SELF_HOSTED_ENV = ("POSTGRES_USER", "POSTGRES_PASSWORD")
NO_BUILD_COMMANDS = frozenset({"config", "down", "ps", "logs", "images", "version"})
SOURCE_ENVIRONMENTS = frozenset({"development", "demo", "test"})


class CheckoutError(RuntimeError):
    """The checkout cannot be used as a verified source deployment."""


def run_git(root: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", *args], cwd=root, check=True, capture_output=True, text=True
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise CheckoutError(f"Git command failed: {' '.join(args)}") from exc
    return completed.stdout.strip()


def repository_root() -> Path:
    script_root = Path(__file__).resolve().parents[1]
    reported = Path(run_git(script_root, "rev-parse", "--show-toplevel")).resolve()
    if reported != script_root:
        raise CheckoutError("compose_checked.py must run from its own eimir. checkout")
    return script_root


def verified_revision(root: Path, expected: str | None) -> str:
    if run_git(root, "status", "--porcelain=v1", "--untracked-files=all"):
        raise CheckoutError("the repository is not clean; refusing a verified deployment")
    revision = run_git(root, "rev-parse", "HEAD")
    if not REVISION_RE.fullmatch(revision):
        raise CheckoutError("HEAD did not resolve to an exact 40-character Git commit SHA")
    if expected is not None:
        normalized = expected.strip().lower()
        if not REVISION_RE.fullmatch(normalized):
            raise CheckoutError("--expected-revision must be an exact 40-character commit SHA")
        if normalized != revision:
            raise CheckoutError("checked-out HEAD does not match --expected-revision")
    return revision


def export_verified_snapshot(root: Path, revision: str, target: Path) -> None:
    archive_path = target / "source.tar"
    try:
        with archive_path.open("wb") as archive_file:
            subprocess.run(
                ["git", "archive", "--format=tar", revision, "compose.yaml", "backend", "web"],
                cwd=root,
                check=True,
                stdout=archive_file,
                stderr=subprocess.PIPE,
            )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise CheckoutError("Git could not export the verified deployment tree") from exc

    target_root = target.resolve()
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            for member in archive.getmembers():
                destination = (target / member.name).resolve()
                if destination != target_root and target_root not in destination.parents:
                    raise CheckoutError("Git archive contained an invalid path")
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                if not member.isfile():
                    raise CheckoutError("verified deployment source contains an unsupported link/device")
                source = archive.extractfile(member)
                if source is None:
                    raise CheckoutError("Git archive member could not be read")
                destination.parent.mkdir(parents=True, exist_ok=True)
                with source, destination.open("wb") as output:
                    output.write(source.read())
                os.chmod(destination, member.mode & 0o777)
    except (OSError, tarfile.TarError) as exc:
        raise CheckoutError("verified Git deployment snapshot could not be extracted") from exc
    finally:
        archive_path.unlink(missing_ok=True)


def compose_dotenv_value(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    if value[0] in {"'", '"'}:
        quote = value[0]
        escaped = False
        for index in range(1, len(value)):
            char = value[index]
            if quote == '"' and char == "\\" and not escaped:
                escaped = True
                continue
            if char == quote and not escaped:
                trailing = value[index + 1 :].strip()
                if trailing and not trailing.startswith("#"):
                    raise CheckoutError("dotenv quoted value has unsupported trailing content")
                return value[1:index]
            escaped = False
        raise CheckoutError("dotenv quoted value is not terminated")

    match = re.search(r"\s+#", value)
    if match is not None:
        value = value[: match.start()].rstrip()
    return value


def dotenv_value(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise CheckoutError("the deployment .env file could not be read") from exc
    found: str | None = None
    for lineno, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        candidate, value = line.split("=", 1)
        candidate_key = candidate.strip()
        if candidate_key not in {key, legacy_key(key)}:
            continue
        try:
            parsed = compose_dotenv_value(value)
            # Canonical assignments win even if a deprecated alias follows.
            if candidate_key == key or found is None:
                found = parsed
        except CheckoutError as exc:
            raise CheckoutError(f"invalid dotenv value for {key} on line {lineno}") from exc
    return found


def reject_production_environment(env_file: Path) -> None:
    dotenv_environment = (dotenv_value(env_file, "EIMIR_ENVIRONMENT") or "development").strip().lower()
    process_raw = process_value("EIMIR_ENVIRONMENT")
    process_environment = process_raw.strip().lower() if process_raw is not None else None

    if dotenv_environment == "production" or process_environment == "production":
        raise CheckoutError(
            "verified source builds are not allowed when EIMIR_ENVIRONMENT=production is declared"
        )
    if dotenv_environment not in SOURCE_ENVIRONMENTS:
        raise CheckoutError(
            "verified source env file must declare an explicit development, demo, or test environment"
        )
    if process_environment is not None and process_environment not in SOURCE_ENVIRONMENTS:
        raise CheckoutError(
            "process EIMIR_ENVIRONMENT must be development, demo, or test for verified source builds"
        )


def require_self_hosted_secrets(env_file: Path) -> None:
    for key in REQUIRED_SELF_HOSTED_ENV:
        value = os.environ.get(key)
        if value is None:
            value = dotenv_value(env_file, key)
        if not value:
            raise CheckoutError(f"{key} must be set for a verified deployment")


def default_project_name(root: Path) -> str:
    value = re.sub(r"[^a-z0-9_-]+", "", root.name.lower())
    value = re.sub(r"^[^a-z0-9]+", "", value)
    if not value:
        raise CheckoutError("the checkout directory cannot produce a Compose project name")
    return value


def compose_project_name(root: Path, env_file: Path) -> str:
    value = os.environ.get("COMPOSE_PROJECT_NAME") or dotenv_value(env_file, "COMPOSE_PROJECT_NAME")
    value = value or default_project_name(root)
    if not PROJECT_NAME_RE.fullmatch(value):
        raise CheckoutError("COMPOSE_PROJECT_NAME is not a valid Docker Compose project name")
    return value


def reject_compose_source_overrides(arguments: list[str]) -> None:
    for argument in arguments:
        if argument in {"-f", "--file"} or argument.startswith("--file=") or (
            argument.startswith("-f") and argument != "-f"
        ):
            raise CheckoutError("alternate Compose files are not allowed by the verified wrapper")
        if argument in {"-p", "--project-name"} or argument.startswith("--project-name=") or (
            argument.startswith("-p") and argument != "-p"
        ):
            raise CheckoutError("project-name overrides are not allowed by the verified wrapper")
        if argument in {"--env-file", "--project-directory"} or argument.startswith(
            ("--env-file=", "--project-directory=")
        ):
            raise CheckoutError("deployment source/config overrides are not allowed by the verified wrapper")
        if argument == "--profile" or argument.startswith("--profile="):
            raise CheckoutError("profile overrides are not allowed by the verified wrapper")


def command_needs_images(arguments: list[str]) -> bool:
    return bool(arguments) and arguments[0] not in NO_BUILD_COMMANDS


def build_verified_images(snapshot_root: Path, revision: str, env_file: Path) -> tuple[str, str]:
    backend_image = f"eimir-backend:verified-{revision[:12]}"
    web_image = f"eimir-web:verified-{revision[:12]}"
    web_args = {
        "VITE_EIMIR_API_BASE_URL": "",
        "VITE_EIMIR_DEMO_MODE": dotenv_value(env_file, "EIMIR_DEMO_MODE") or "false",
        "VITE_EIMIR_DEMO_URL": dotenv_value(env_file, "EIMIR_DEMO_PUBLIC_URL") or "",
        "VITE_EIMIR_DEMO_RESET_TIMER": dotenv_value(env_file, "EIMIR_DEMO_MODE_RESET_TIMER") or "false",
        "VITE_EIMIR_DEMO_RESET_INTERVAL": dotenv_value(env_file, "EIMIR_DEMO_MODE_RESET_INTERVAL") or "6h",
    }
    backend = [
        "docker", "build", "--build-arg", f"EIMIR_BUILD_REVISION={revision}",
        "--tag", backend_image, str(snapshot_root / "backend"),
    ]
    web = ["docker", "build", "--build-arg", f"EIMIR_BUILD_REVISION={revision}"]
    for key, value in web_args.items():
        web.extend(["--build-arg", f"{key}={value}"])
    web.extend(["--tag", web_image, str(snapshot_root / "web")])
    try:
        subprocess.run(backend, cwd=snapshot_root, check=True)
        subprocess.run(web, cwd=snapshot_root, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise CheckoutError("verified backend/Web source image build failed") from exc
    return backend_image, web_image


def invoke_compose(root: Path, revision: str, compose_args: list[str]) -> int:
    if not compose_args:
        raise CheckoutError("a Docker Compose command is required")
    reject_compose_source_overrides(compose_args)
    env_file = root / ".env"
    reject_production_environment(env_file)
    require_self_hosted_secrets(env_file)
    project_name = compose_project_name(root, env_file)

    try:
        with tempfile.TemporaryDirectory(prefix="eimir-source-") as temp_dir:
            snapshot_root = Path(temp_dir)
            export_verified_snapshot(root, revision, snapshot_root)
            backend_image = f"eimir-backend:verified-{revision[:12]}"
            web_image = f"eimir-web:verified-{revision[:12]}"
            if command_needs_images(compose_args):
                backend_image, web_image = build_verified_images(snapshot_root, revision, env_file)

            command = ["docker", "compose", "--project-name", project_name]
            if env_file.is_file():
                command.extend(["--env-file", str(env_file)])
            command.extend(["-f", str(snapshot_root / "compose.yaml"), *compose_args])

            compose_env = dict(os.environ)
            compose_env.pop("COMPOSE_FILE", None)
            compose_env["COMPOSE_PROFILES"] = "self-hosted"
            compose_env["EIMIR_SELF_HOSTED_BACKEND_IMAGE"] = backend_image
            compose_env["EIMIR_SELF_HOSTED_WEB_IMAGE"] = web_image
            compose_env["EIMIR_SELF_HOSTED_PULL_POLICY"] = "never"
            completed = subprocess.run(command, cwd=root, check=False, env=compose_env)
            return completed.returncode
    except OSError as exc:
        raise CheckoutError("docker compose could not be executed") from exc


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-revision", help="Require clean HEAD to equal this exact 40-character commit SHA")
    parser.add_argument("--print-revision", action="store_true", help="Print the verified checkout revision without invoking Compose")
    parser.add_argument("compose_args", nargs=argparse.REMAINDER)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        root = repository_root()
        revision = verified_revision(root, args.expected_revision)
        if args.print_revision:
            if args.compose_args:
                raise CheckoutError("--print-revision cannot be combined with Compose arguments")
            print(revision)
            return 0
        return invoke_compose(root, revision, args.compose_args)
    except CheckoutError as exc:
        print(f"verified Compose deployment refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
