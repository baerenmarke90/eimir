#!/usr/bin/env python3
"""Operate released Self-Hosted eimir. through the fail-closed image identity gate.

This is the supported Production entry point for the released Self-Hosted bundle.
It always uses repository-root ``compose.yaml``, the ``self-hosted`` profile, an
explicit dotenv file, and the exact digest-qualified image references published in
``self-hosted-image-identity.json``. Normal deployment additionally requires the
complete Production runtime guard.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from scripts._identity_environment import canonicalize, process_value
except ModuleNotFoundError:  # Direct ``python scripts/...`` execution.
    from _identity_environment import canonicalize, process_value

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "compose.yaml"
RUNTIME_CHECKER = ROOT / "scripts" / "check_runtime_environment.py"
DEFAULT_IMAGE_IDENTITY = ROOT / "self-hosted-image-identity.json"
SHA40_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_REF_RE = re.compile(
    r"^ghcr\.io/baerenmarke90/eimir-(backend|web):v"
    r"(?P<version>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)"
    r"@sha256:[0-9a-f]{64}$"
)


# Compose arguments (after the shared prefix) that ``deploy`` runs after
# validation, in this order. Migration runs against the selected backend image
# *before* any runtime container is replaced: a failed or refused migration (for
# example a rollback to a release older than the database schema) aborts here and
# leaves the currently running API/worker/Web untouched instead of tearing them
# down. ``scripts/self_hosted_upgrade_rehearsal.py`` executes the same sequence.
DEPLOY_WAIT = ("--wait", "--wait-timeout", "300")
DEPLOY_SEQUENCE: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Self-Hosted release image pull", ("pull",)),
    ("Self-Hosted database start", ("up", "-d", *DEPLOY_WAIT, "postgres")),
    ("Self-Hosted release migration", ("run", "--rm", "--no-deps", "migrate")),
    (
        "Self-Hosted release deployment",
        ("up", "-d", "--force-recreate", *DEPLOY_WAIT),
    ),
)


class ReleaseOperationError(RuntimeError):
    """The requested released Self-Hosted operation is unsafe or invalid."""


def compose_dotenv_value(raw: str) -> str:
    """Parse the Compose dotenv comment/quoting subset used by release files."""

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
                    raise ReleaseOperationError(
                        "dotenv quoted value has unsupported trailing content"
                    )
                return value[1:index]
            escaped = False
        raise ReleaseOperationError("dotenv quoted value is not terminated")

    match = re.search(r"\s+#", value)
    if match is not None:
        value = value[: match.start()].rstrip()
    return value


def read_dotenv(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ReleaseOperationError(f"release env file does not exist: {path}")
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise ReleaseOperationError("release env file could not be read") from exc

    values: dict[str, str] = {}
    for lineno, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise ReleaseOperationError(f"invalid dotenv assignment on line {lineno}")
        try:
            values[key] = compose_dotenv_value(raw_value)
        except ReleaseOperationError as exc:
            raise ReleaseOperationError(
                f"invalid dotenv value for {key} on line {lineno}"
            ) from exc
    return canonicalize(values)


def require_release_environment(values: dict[str, str]) -> None:
    """Require one exact Production mode across dotenv and process environment."""

    if values.get("EIMIR_ENVIRONMENT", "").strip() != "production":
        raise ReleaseOperationError(
            "released Self-Hosted requires exact EIMIR_ENVIRONMENT=production in the env file"
        )

    process_environment = process_value("EIMIR_ENVIRONMENT")
    if process_environment is not None and process_environment.strip() != "production":
        raise ReleaseOperationError(
            "process EIMIR_ENVIRONMENT must be unset or exactly production for released Self-Hosted"
        )


def _identity_image_reference(
    images: object, *, role: str, expected_roles: set[str], version: str
) -> str:
    if not isinstance(images, dict):
        raise ReleaseOperationError("release image identity has no images object")
    record = images.get(role)
    if not isinstance(record, dict):
        raise ReleaseOperationError(f"release image identity has no {role} record")
    reference = record.get("reference")
    digest = record.get("digest")
    if not isinstance(reference, str):
        raise ReleaseOperationError(f"release image identity {role} reference is missing")
    match = DIGEST_REF_RE.fullmatch(reference)
    if match is None or match.group(1) != role or match.group("version") != version:
        raise ReleaseOperationError(
            f"release image identity {role} reference is not the selected digest-qualified release"
        )
    actual_digest = reference.split("@", 1)[1]
    if digest != actual_digest:
        raise ReleaseOperationError(
            f"release image identity {role} digest does not match its reference"
        )
    if set(record.get("roles", [])) != expected_roles:
        raise ReleaseOperationError(f"release image identity {role} roles are inconsistent")
    return reference


def load_release_identity(path: Path, values: dict[str, str]) -> tuple[str, str]:
    """Return exact published backend/Web refs after validating release binding."""

    try:
        identity = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ReleaseOperationError(f"release image identity does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ReleaseOperationError("release image identity is not valid JSON") from exc
    if not isinstance(identity, dict):
        raise ReleaseOperationError("release image identity must be a JSON object")
    if (
        identity.get("schemaVersion") != 1
        or identity.get("kind") != "eimir-self-hosted-image-identity"
    ):
        raise ReleaseOperationError("unsupported Self-Hosted release image identity schema")

    product = identity.get("product")
    if not isinstance(product, dict):
        raise ReleaseOperationError("release image identity has no product binding")
    version = product.get("version")
    if not isinstance(version, str) or product.get("tag") != f"v{version}":
        raise ReleaseOperationError("release image identity product version/tag is invalid")
    declared_version = values.get("EIMIR_RELEASE_VERSION", "").strip()
    if not declared_version:
        raise ReleaseOperationError("released Self-Hosted requires EIMIR_RELEASE_VERSION")
    if version != declared_version:
        raise ReleaseOperationError(
            "release image identity does not match EIMIR_RELEASE_VERSION"
        )

    source_revision = identity.get("sourceRevision")
    if not isinstance(source_revision, str) or not SHA40_RE.fullmatch(source_revision):
        raise ReleaseOperationError("release image identity sourceRevision is invalid")

    images = identity.get("images")
    backend = _identity_image_reference(
        images,
        role="backend",
        expected_roles={"api", "worker", "migrate"},
        version=version,
    )
    web = _identity_image_reference(
        images,
        role="web",
        expected_roles={"web"},
        version=version,
    )
    return backend, web


def reject_conflicting_image_overrides(
    values: dict[str, str], *, backend: str, web: str
) -> None:
    expected = {
        "EIMIR_SELF_HOSTED_BACKEND_IMAGE": backend,
        "EIMIR_SELF_HOSTED_WEB_IMAGE": web,
    }
    for key, published in expected.items():
        dotenv_value = values.get(key, "").strip()
        if dotenv_value and dotenv_value != published:
            raise ReleaseOperationError(
                f"{key} differs from the published release image identity"
            )
        process_setting = process_value(key)
        if process_setting is not None and process_setting.strip() != published:
            raise ReleaseOperationError(
                f"process {key} differs from the published release image identity"
            )

    pull_policy = values.get("EIMIR_SELF_HOSTED_PULL_POLICY", "").strip()
    if pull_policy and pull_policy != "always":
        raise ReleaseOperationError(
            "EIMIR_SELF_HOSTED_PULL_POLICY must be always for released Self-Hosted"
        )
    process_pull_policy = process_value("EIMIR_SELF_HOSTED_PULL_POLICY")
    if process_pull_policy is not None and process_pull_policy.strip() != "always":
        raise ReleaseOperationError(
            "process EIMIR_SELF_HOSTED_PULL_POLICY must be always for released Self-Hosted"
        )


def compose_environment(*, backend: str, web: str) -> dict[str, str]:
    """Force canonical published image identity for every Compose invocation."""

    environment = dict(os.environ)
    environment.pop("COMPOSE_FILE", None)
    environment["COMPOSE_PROFILES"] = "self-hosted"
    environment["EIMIR_ENVIRONMENT"] = "production"
    environment["EIMIR_SELF_HOSTED_BACKEND_IMAGE"] = backend
    environment["EIMIR_SELF_HOSTED_WEB_IMAGE"] = web
    environment["EIMIR_SELF_HOSTED_PULL_POLICY"] = "always"
    return environment


def compose_prefix(env_file: Path) -> list[str]:
    return [
        "docker",
        "compose",
        "--profile",
        "self-hosted",
        "--env-file",
        str(env_file),
        "--file",
        str(COMPOSE_FILE),
    ]


def run_checked(command: list[str], *, action: str, environment: dict[str, str]) -> None:
    try:
        subprocess.run(command, cwd=ROOT, env=environment, check=True)
    except OSError as exc:
        raise ReleaseOperationError(f"{action} could not be executed") from exc
    except subprocess.CalledProcessError as exc:
        raise ReleaseOperationError(f"{action} failed") from exc


def validate_release(
    env_file: Path,
    identity_file: Path,
    *,
    backend: str,
    web: str,
    image_identity_only: bool,
) -> None:
    command = [
        sys.executable,
        str(RUNTIME_CHECKER),
        "--env-file",
        str(env_file),
        "--compose-file",
        str(COMPOSE_FILE),
        "--profile",
        "self-hosted",
        "--release-image-identity",
        str(identity_file),
    ]
    if image_identity_only:
        command.append("--image-identity-only")
    run_checked(
        command,
        action="Self-Hosted release validation",
        environment=compose_environment(backend=backend, web=web),
    )


def pull_release(
    env_file: Path, identity_file: Path, *, backend: str, web: str
) -> None:
    validate_release(
        env_file,
        identity_file,
        backend=backend,
        web=web,
        image_identity_only=True,
    )
    run_checked(
        [*compose_prefix(env_file), "pull"],
        action="Self-Hosted release image pull",
        environment=compose_environment(backend=backend, web=web),
    )


def bootstrap_deletion_authority(
    env_file: Path, identity_file: Path, *, backend: str, web: str
) -> None:
    validate_release(
        env_file,
        identity_file,
        backend=backend,
        web=web,
        image_identity_only=True,
    )
    environment = compose_environment(backend=backend, web=web)
    run_checked(
        [*compose_prefix(env_file), "pull", "api"],
        action="Self-Hosted bootstrap image pull",
        environment=environment,
    )
    run_checked(
        [
            *compose_prefix(env_file),
            "run",
            "--rm",
            "--no-deps",
            "api",
            "python",
            "-m",
            "eimir.identity.deletion_bootstrap",
            "--confirm-new-installation",
        ],
        action="Self-Hosted deletion-authority bootstrap",
        environment=environment,
    )


def deploy_release(
    env_file: Path, identity_file: Path, *, backend: str, web: str
) -> None:
    validate_release(
        env_file,
        identity_file,
        backend=backend,
        web=web,
        image_identity_only=False,
    )
    environment = compose_environment(backend=backend, web=web)
    for action, arguments in DEPLOY_SEQUENCE:
        run_checked(
            [*compose_prefix(env_file), *arguments],
            action=action,
            environment=environment,
        )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument(
        "--image-identity",
        type=Path,
        default=DEFAULT_IMAGE_IDENTITY,
        help="Published self-hosted-image-identity.json from the same release bundle",
    )
    parser.add_argument(
        "operation",
        choices=("validate", "pull", "bootstrap-deletion-authority", "deploy"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        values = read_dotenv(args.env_file)
        require_release_environment(values)
        backend, web = load_release_identity(args.image_identity, values)
        reject_conflicting_image_overrides(values, backend=backend, web=web)

        if args.operation == "validate":
            validate_release(
                args.env_file,
                args.image_identity,
                backend=backend,
                web=web,
                image_identity_only=False,
            )
        elif args.operation == "pull":
            pull_release(
                args.env_file,
                args.image_identity,
                backend=backend,
                web=web,
            )
        elif args.operation == "bootstrap-deletion-authority":
            bootstrap_deletion_authority(
                args.env_file,
                args.image_identity,
                backend=backend,
                web=web,
            )
        elif args.operation == "deploy":
            deploy_release(
                args.env_file,
                args.image_identity,
                backend=backend,
                web=web,
            )
    except ReleaseOperationError as exc:
        print(f"Self-Hosted release operation refused: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
