#!/usr/bin/env python3
"""Verify critical eimir. runtime environment before and after Compose recreation."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from scripts._identity_environment import canonicalize
except ModuleNotFoundError:  # Direct ``python scripts/...`` execution.
    from _identity_environment import canonicalize

CRITICAL_RUNTIME_KEYS = (
    "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
    "EIMIR_ENVIRONMENT",
    "EIMIR_DEPLOYMENT",
    "EIMIR_PUBLIC_BASE_URL",
    "EIMIR_CURSOR_SIGNING_KEY",
)
DOTENV_AUTHORITATIVE_KEYS = (
    "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
    "EIMIR_ENVIRONMENT",
    "EIMIR_PUBLIC_BASE_URL",
    "EIMIR_CURSOR_SIGNING_KEY",
)
PROFILE_RUNTIME_SERVICES = {
    "self-hosted": frozenset({"api", "worker"}),
    "cloud": frozenset({"cloud-api", "cloud-worker"}),
}
SELF_HOSTED_BACKEND_SERVICES = ("migrate", "api", "worker")
RELEASE_IMAGE_RE = re.compile(
    r"^ghcr\.io/baerenmarke90/eimir-(backend|web):v"
    r"(?P<version>0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"
    r"(?:@sha256:[0-9a-f]{64})?$"
)
SHA40_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class RuntimeEnvironmentError(RuntimeError):
    """The intended, rendered, or running runtime configuration is inconsistent."""


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
                    raise RuntimeEnvironmentError(
                        "dotenv quoted value has unsupported trailing content"
                    )
                return value[1:index]
            escaped = False
        raise RuntimeEnvironmentError("dotenv quoted value is not terminated")

    match = re.search(r"\s+#", value)
    if match is not None:
        value = value[: match.start()].rstrip()
    return value


def parse_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RuntimeEnvironmentError(f"could not read env file: {path}") from exc

    for lineno, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise RuntimeEnvironmentError(f"{path}:{lineno}: expected KEY=VALUE")
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise RuntimeEnvironmentError(f"{path}:{lineno}: empty variable name")
        try:
            values[key] = compose_dotenv_value(raw_value)
        except RuntimeEnvironmentError as exc:
            raise RuntimeEnvironmentError(
                f"{path}:{lineno}: invalid dotenv value for {key}"
            ) from exc
    return canonicalize(values)


def service_environment(service: dict[str, Any]) -> dict[str, str]:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        return {str(key): "" if value is None else str(value) for key, value in environment.items()}
    if isinstance(environment, list):
        values: dict[str, str] = {}
        for item in environment:
            if not isinstance(item, str):
                continue
            key, separator, value = item.partition("=")
            values[key] = value if separator else ""
        return values
    raise RuntimeEnvironmentError("Compose rendered an unsupported service environment shape")


def rendered_runtime_environments(
    config: dict[str, Any], service_names: frozenset[str] | None = None
) -> dict[str, dict[str, str]]:
    services = config.get("services")
    if not isinstance(services, dict):
        raise RuntimeEnvironmentError("Compose config does not contain a services object")

    rendered: dict[str, dict[str, str]] = {}
    for name, service in services.items():
        if not isinstance(name, str) or not isinstance(service, dict):
            continue
        if service_names is not None and name not in service_names:
            continue
        environment = service_environment(service)
        if any(key in environment for key in CRITICAL_RUNTIME_KEYS):
            rendered[name] = environment
    return rendered


def check_dotenv_to_rendered(
    dotenv: dict[str, str], rendered: dict[str, dict[str, str]]
) -> list[str]:
    problems: list[str] = []

    dotenv_is_production = dotenv.get("EIMIR_ENVIRONMENT") == "production"
    rendered_is_production = any(
        environment.get("EIMIR_ENVIRONMENT") == "production" for environment in rendered.values()
    )
    if dotenv_is_production and not dotenv.get("EIMIR_ACCOUNT_DELETION_INSTANCE_ID"):
        problems.append("production env file must set non-empty EIMIR_ACCOUNT_DELETION_INSTANCE_ID")
    if rendered_is_production and any(
        not environment.get("EIMIR_ACCOUNT_DELETION_INSTANCE_ID")
        for environment in rendered.values()
        if environment.get("EIMIR_ENVIRONMENT") == "production"
    ):
        problems.append("rendered Production runtime must set non-empty EIMIR_ACCOUNT_DELETION_INSTANCE_ID")

    for key in DOTENV_AUTHORITATIVE_KEYS:
        intended = dotenv.get(key)
        if not intended:
            continue
        consumers = [name for name, environment in rendered.items() if key in environment]
        if not consumers:
            problems.append(f"no rendered service consumes {key}")
            continue
        for service_name in consumers:
            if rendered[service_name].get(key) != intended:
                problems.append(f"rendered service {service_name} differs from env file for {key}")

    return problems


def _release_image_version(reference: Any, expected_role: str) -> str | None:
    if not isinstance(reference, str):
        return None
    match = RELEASE_IMAGE_RE.fullmatch(reference)
    if match is None or match.group(1) != expected_role:
        return None
    return reference.split(":v", 1)[1].split("@", 1)[0]


def check_production_image_identity(
    dotenv: dict[str, str],
    config: dict[str, Any],
    rendered: dict[str, dict[str, str]],
) -> list[str]:
    """Require released GHCR images and no source-build fallback in Production."""

    dotenv_is_production = dotenv.get("EIMIR_ENVIRONMENT") == "production"
    rendered_is_production = any(
        environment.get("EIMIR_ENVIRONMENT") == "production" for environment in rendered.values()
    )
    if not dotenv_is_production and not rendered_is_production:
        return []

    services = config.get("services")
    if not isinstance(services, dict):
        return ["Production image identity requires rendered Compose services"]

    problems: list[str] = []
    declared_version = dotenv.get("EIMIR_RELEASE_VERSION", "").strip()
    if not declared_version:
        problems.append("Production env file must set non-empty EIMIR_RELEASE_VERSION")

    backend_images: list[str] = []
    versions: list[str] = []
    for service_name in SELF_HOSTED_BACKEND_SERVICES:
        service = services.get(service_name)
        if not isinstance(service, dict):
            problems.append(f"Production image identity is missing service {service_name}")
            continue
        if "build" in service:
            problems.append(f"Production service {service_name} must not contain build configuration")
        image = service.get("image")
        version = _release_image_version(image, "backend")
        if version is None:
            problems.append(
                f"Production service {service_name} must use the versioned eimir-backend GHCR release image"
            )
        else:
            backend_images.append(str(image))
            versions.append(version)
        if service.get("pull_policy") != "always":
            problems.append(f"Production service {service_name} must keep pull_policy=always")

    web = services.get("web")
    if not isinstance(web, dict):
        problems.append("Production image identity is missing service web")
    else:
        if "build" in web:
            problems.append("Production service web must not contain build configuration")
        web_version = _release_image_version(web.get("image"), "web")
        if web_version is None:
            problems.append("Production service web must use the versioned eimir-web GHCR release image")
        else:
            versions.append(web_version)
        if web.get("pull_policy") != "always":
            problems.append("Production service web must keep pull_policy=always")

    if len(set(backend_images)) > 1:
        problems.append("Production api/worker/migrate must use one exact backend image identity")
    if len(set(versions)) > 1:
        problems.append("Production backend and Web images must use one product release version")
    if declared_version and any(version != declared_version for version in versions):
        problems.append("Production application images must match EIMIR_RELEASE_VERSION")
    return problems


def load_release_image_identity(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeEnvironmentError(f"could not read release image identity: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeEnvironmentError("release image identity is not valid JSON") from exc
    if not isinstance(value, dict):
        raise RuntimeEnvironmentError("release image identity must be a JSON object")
    return value


def check_published_release_image_identity(
    dotenv: dict[str, str], config: dict[str, Any], identity: dict[str, Any]
) -> list[str]:
    """Bind rendered Production images to the exact published release identity."""

    problems: list[str] = []
    if identity.get("schemaVersion") != 1 or identity.get("kind") != "eimir-self-hosted-image-identity":
        return ["Unsupported Self-Hosted release image identity schema"]

    product = identity.get("product")
    if not isinstance(product, dict):
        return ["Self-Hosted release image identity has no product binding"]
    version = product.get("version")
    if not isinstance(version, str) or product.get("tag") != f"v{version}":
        problems.append("Self-Hosted release image identity has invalid product version/tag")
    declared_version = dotenv.get("EIMIR_RELEASE_VERSION", "").strip()
    if isinstance(version, str) and declared_version != version:
        problems.append("Self-Hosted release image identity does not match EIMIR_RELEASE_VERSION")

    source = identity.get("sourceRevision")
    if not isinstance(source, str) or not SHA40_RE.fullmatch(source):
        problems.append("Self-Hosted release image identity has invalid sourceRevision")

    images = identity.get("images")
    if not isinstance(images, dict) or set(images) != {"backend", "web"}:
        problems.append("Self-Hosted release image identity must contain backend and web records")
        return problems

    expected: dict[str, str] = {}
    for role, expected_roles in (
        ("backend", {"api", "worker", "migrate"}),
        ("web", {"web"}),
    ):
        record = images.get(role)
        if not isinstance(record, dict):
            problems.append(f"Self-Hosted release {role} image record is missing")
            continue
        reference = record.get("reference")
        digest = record.get("digest")
        parsed_version = _release_image_version(reference, role)
        if (
            not isinstance(reference, str)
            or "@sha256:" not in reference
            or parsed_version != version
        ):
            problems.append(
                f"Self-Hosted release {role} reference must be digest-qualified for the selected version"
            )
            continue
        actual_digest = reference.split("@", 1)[1]
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest) or digest != actual_digest:
            problems.append(f"Self-Hosted release {role} digest does not match its reference")
            continue
        if set(record.get("roles", [])) != expected_roles:
            problems.append(f"Self-Hosted release {role} roles are inconsistent")
            continue
        expected[role] = reference

    services = config.get("services")
    if not isinstance(services, dict):
        problems.append("Published release image binding requires rendered Compose services")
        return problems

    backend_reference = expected.get("backend")
    if backend_reference is not None:
        for service_name in SELF_HOSTED_BACKEND_SERVICES:
            service = services.get(service_name)
            if not isinstance(service, dict) or service.get("image") != backend_reference:
                problems.append(
                    f"Production service {service_name} does not match published backend image identity"
                )
    web_reference = expected.get("web")
    web_service = services.get("web")
    if web_reference is not None and (
        not isinstance(web_service, dict) or web_service.get("image") != web_reference
    ):
        problems.append("Production service web does not match published web image identity")
    return problems


def parse_container_environment(values: list[str]) -> dict[str, str]:
    environment: dict[str, str] = {}
    for item in values:
        key, separator, value = item.partition("=")
        environment[key] = value if separator else ""
    return environment


def check_rendered_to_running(
    rendered: dict[str, dict[str, str]], running: dict[str, dict[str, str] | None]
) -> list[str]:
    problems: list[str] = []
    for service_name, expected_environment in rendered.items():
        actual_environment = running.get(service_name)
        if actual_environment is None:
            problems.append(f"service {service_name} has no inspectable Compose container")
            continue
        for key in CRITICAL_RUNTIME_KEYS:
            if key not in expected_environment:
                continue
            if actual_environment.get(key) != expected_environment.get(key):
                problems.append(f"running service {service_name} differs from rendered Compose for {key}")
    return problems


def run_command(command: list[str]) -> str:
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except OSError as exc:
        raise RuntimeEnvironmentError(f"could not execute {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "command failed"
        raise RuntimeEnvironmentError(f"{' '.join(command[:3])} failed: {detail}") from exc
    return completed.stdout


def compose_prefix(args: argparse.Namespace) -> list[str]:
    command = ["docker", "compose"]
    if args.project_name:
        command.extend(["--project-name", args.project_name])
    if args.profile:
        command.extend(["--profile", args.profile])
    command.extend(["--env-file", str(args.env_file)])
    if args.compose_file:
        command.extend(["--file", str(args.compose_file)])
    return command


def load_rendered_config(args: argparse.Namespace) -> dict[str, Any]:
    output = run_command([*compose_prefix(args), "config", "--format", "json"])
    try:
        config = json.loads(output)
    except json.JSONDecodeError as exc:
        raise RuntimeEnvironmentError("docker compose config did not return valid JSON") from exc
    if not isinstance(config, dict):
        raise RuntimeEnvironmentError("docker compose config returned an unexpected JSON value")
    return config


def inspect_running_services(
    args: argparse.Namespace, rendered: dict[str, dict[str, str]]
) -> dict[str, dict[str, str] | None]:
    running: dict[str, dict[str, str] | None] = {}
    prefix = compose_prefix(args)
    for service_name in rendered:
        container_ids = [
            value.strip()
            for value in run_command([*prefix, "ps", "-aq", service_name]).splitlines()
            if value.strip()
        ]
        if len(container_ids) != 1:
            running[service_name] = None
            continue
        output = run_command(
            ["docker", "inspect", "--format", "{{json .Config.Env}}", container_ids[0]]
        )
        try:
            values = json.loads(output)
        except json.JSONDecodeError as exc:
            raise RuntimeEnvironmentError(
                f"docker inspect returned invalid environment JSON for {service_name}"
            ) from exc
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            raise RuntimeEnvironmentError(
                f"docker inspect returned an unexpected environment for {service_name}"
            )
        running[service_name] = parse_container_environment(values)
    return running


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--compose-file", type=Path)
    parser.add_argument("--profile", default="self-hosted")
    parser.add_argument("--project-name")
    parser.add_argument("--release-image-identity", type=Path)
    parser.add_argument(
        "--check-running",
        action="store_true",
        help="also compare rendered critical settings with existing Compose containers",
    )
    parser.add_argument(
        "--image-identity-only",
        action="store_true",
        help="verify only released Self-Hosted image identity; used before first-install bootstrap",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.image_identity_only and args.check_running:
        print(
            "runtime environment check failed: --image-identity-only cannot be combined with --check-running",
            file=sys.stderr,
        )
        return 2
    if args.image_identity_only and args.profile != "self-hosted":
        print(
            "runtime environment check failed: --image-identity-only is Self-Hosted-only",
            file=sys.stderr,
        )
        return 2
    if args.release_image_identity is not None and args.profile != "self-hosted":
        print(
            "runtime environment check failed: --release-image-identity is Self-Hosted-only",
            file=sys.stderr,
        )
        return 2

    try:
        dotenv = parse_dotenv(args.env_file)
        selected_services = PROFILE_RUNTIME_SERVICES.get(args.profile)
        config = load_rendered_config(args)
        rendered = rendered_runtime_environments(config, service_names=selected_services)
        if args.image_identity_only:
            problems = check_production_image_identity(dotenv, config, rendered)
        else:
            problems = check_dotenv_to_rendered(dotenv, rendered)
            if args.profile == "self-hosted":
                problems.extend(check_production_image_identity(dotenv, config, rendered))
            if args.check_running:
                running = inspect_running_services(args, rendered)
                problems.extend(check_rendered_to_running(rendered, running))
        if args.release_image_identity is not None:
            identity = load_release_image_identity(args.release_image_identity)
            problems.extend(check_published_release_image_identity(dotenv, config, identity))
    except RuntimeEnvironmentError as exc:
        print(f"runtime environment check failed: {exc}", file=sys.stderr)
        return 2

    if problems:
        print("runtime environment check failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1

    scope = "image identity" if args.image_identity_only else (
        "rendered and running" if args.check_running else "rendered"
    )
    print(f"runtime environment check passed ({scope} configuration)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
