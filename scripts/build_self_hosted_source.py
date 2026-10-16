#!/usr/bin/env python3
"""Build local Self-Hosted application images without creating a second Compose manifest.

Released Self-Hosted never uses this helper. Development, CI and verified-source
acceptance may build backend/Web from a checkout or explicit remote Git contexts,
then point canonical ``compose.yaml`` at the resulting local tags with
``EIMIR_SELF_HOSTED_PULL_POLICY=never``.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

try:
    from scripts._identity_environment import canonicalize, process_value
except ModuleNotFoundError:  # Direct ``python scripts/...`` execution.
    from _identity_environment import canonicalize, process_value

ROOT = Path(__file__).resolve().parents[1]
LOCAL_TAG_COMPONENT_RE = re.compile(r"^[a-z0-9_][a-z0-9_.-]{0,127}$")
SOURCE_ENVIRONMENTS = frozenset({"development", "demo", "test"})


class SourceBuildError(RuntimeError):
    """The requested source image build is unsafe or invalid."""


def compose_dotenv_value(raw: str) -> str:
    """Parse the Compose dotenv comment/quoting subset used by operator files."""

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
                    raise SourceBuildError("dotenv quoted value has unsupported trailing content")
                return value[1:index]
            escaped = False
        raise SourceBuildError("dotenv quoted value is not terminated")

    match = re.search(r"\s+#", value)
    if match is not None:
        value = value[: match.start()].rstrip()
    return value


def read_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise SourceBuildError("source-build env file could not be read") from exc
    for lineno, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise SourceBuildError(f"invalid dotenv assignment on line {lineno}")
        try:
            values[key] = compose_dotenv_value(value)
        except SourceBuildError as exc:
            raise SourceBuildError(f"invalid dotenv value for {key} on line {lineno}") from exc
    return canonicalize(values)


def effective(values: dict[str, str], key: str, default: str = "") -> str:
    process_setting = process_value(key)
    if process_setting is not None:
        return process_setting
    return values.get(key, default)


def reject_production_source_build(values: dict[str, str]) -> None:
    """Accept only explicit non-Production source-build modes from both sources."""

    dotenv_environment = values.get("EIMIR_ENVIRONMENT", "development").strip().lower()
    process_raw = process_value("EIMIR_ENVIRONMENT")
    process_environment = process_raw.strip().lower() if process_raw is not None else None

    if dotenv_environment == "production" or process_environment == "production":
        raise SourceBuildError(
            "source builds are not allowed when EIMIR_ENVIRONMENT=production is declared"
        )
    if dotenv_environment not in SOURCE_ENVIRONMENTS:
        raise SourceBuildError(
            "source-build env file must declare an explicit development, demo, or test environment"
        )
    if process_environment is not None and process_environment not in SOURCE_ENVIRONMENTS:
        raise SourceBuildError(
            "process EIMIR_ENVIRONMENT must be development, demo, or test for source builds"
        )


def require_local_tag(reference: str, label: str, repository: str) -> str:
    """Accept only an unqualified eimir.-local repository and explicit tag."""

    prefix = f"{repository}:"
    if not reference.startswith(prefix):
        raise SourceBuildError(f"{label} must use local repository {repository}")
    tag = reference[len(prefix) :]
    if not LOCAL_TAG_COMPONENT_RE.fullmatch(tag):
        raise SourceBuildError(f"{label} must contain a safe explicit local tag")
    return reference


def require_safe_source_context(context: str, label: str) -> str:
    """Reject URL credentials/query data before plans can reach logs or Docker."""

    if "://" not in context:
        return context
    try:
        parsed = urlsplit(context)
    except ValueError as exc:
        raise SourceBuildError(f"{label} is not a valid source URL") from exc
    if parsed.username is not None or parsed.password is not None:
        raise SourceBuildError(f"{label} must not contain URL credentials")
    if parsed.query:
        raise SourceBuildError(f"{label} must not contain URL query values")
    return context


def plan(
    env_file: Path,
    *,
    backend_context: str | None = None,
    web_context: str | None = None,
    revision: str | None = None,
    backend_image: str | None = None,
    web_image: str | None = None,
) -> dict[str, object]:
    values = read_dotenv(env_file)
    reject_production_source_build(values)

    resolved_revision = revision or effective(
        values, "EIMIR_BUILD_REVISION", "unverified-local-checkout"
    )
    resolved_backend_context = require_safe_source_context(
        backend_context
        or effective(values, "EIMIR_BACKEND_BUILD_CONTEXT", str(ROOT / "backend")),
        "EIMIR_BACKEND_BUILD_CONTEXT",
    )
    resolved_web_context = require_safe_source_context(
        web_context or effective(values, "EIMIR_WEB_BUILD_CONTEXT", str(ROOT / "web")),
        "EIMIR_WEB_BUILD_CONTEXT",
    )
    resolved_backend_image = require_local_tag(
        backend_image
        or effective(
            values,
            "EIMIR_SELF_HOSTED_BACKEND_IMAGE",
            "eimir-backend:source-local",
        ),
        "EIMIR_SELF_HOSTED_BACKEND_IMAGE",
        "eimir-backend",
    )
    resolved_web_image = require_local_tag(
        web_image
        or effective(
            values,
            "EIMIR_SELF_HOSTED_WEB_IMAGE",
            "eimir-web:source-local",
        ),
        "EIMIR_SELF_HOSTED_WEB_IMAGE",
        "eimir-web",
    )
    return {
        "revision": resolved_revision,
        "backendContext": resolved_backend_context,
        "webContext": resolved_web_context,
        "backendImage": resolved_backend_image,
        "webImage": resolved_web_image,
        "webBuildArgs": {
            "VITE_EIMIR_API_BASE_URL": "",
            "VITE_EIMIR_DEMO_MODE": effective(values, "EIMIR_DEMO_MODE", "false"),
            "VITE_EIMIR_DEMO_URL": effective(values, "EIMIR_DEMO_PUBLIC_URL", ""),
            "VITE_EIMIR_DEMO_RESET_TIMER": effective(
                values, "EIMIR_DEMO_MODE_RESET_TIMER", "false"
            ),
            "VITE_EIMIR_DEMO_RESET_INTERVAL": effective(
                values, "EIMIR_DEMO_MODE_RESET_INTERVAL", "6h"
            ),
        },
    }


def run_build(build_plan: dict[str, object]) -> None:
    revision = str(build_plan["revision"])
    backend = [
        "docker",
        "build",
        "--build-arg",
        f"EIMIR_BUILD_REVISION={revision}",
        "--tag",
        str(build_plan["backendImage"]),
        str(build_plan["backendContext"]),
    ]
    web = ["docker", "build", "--build-arg", f"EIMIR_BUILD_REVISION={revision}"]
    for key, value in dict(build_plan["webBuildArgs"]).items():
        web.extend(["--build-arg", f"{key}={value}"])
    web.extend(
        ["--tag", str(build_plan["webImage"]), str(build_plan["webContext"])]
    )
    try:
        subprocess.run(backend, cwd=ROOT, check=True)
        subprocess.run(web, cwd=ROOT, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise SourceBuildError("Docker source image build failed") from exc


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--backend-context")
    parser.add_argument("--web-context")
    parser.add_argument("--revision")
    parser.add_argument("--backend-image")
    parser.add_argument("--web-image")
    parser.add_argument("--print-plan", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        build_plan = plan(
            args.env_file,
            backend_context=args.backend_context,
            web_context=args.web_context,
            revision=args.revision,
            backend_image=args.backend_image,
            web_image=args.web_image,
        )
        if args.print_plan:
            print(json.dumps(build_plan, sort_keys=True))
            return 0
        run_build(build_plan)
    except (OSError, SourceBuildError) as exc:
        print(f"Self-Hosted source build refused: {exc}", file=sys.stderr)
        return 2
    print(
        "Built local Self-Hosted backend/Web images; canonical compose.yaml remains the only runtime manifest."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
