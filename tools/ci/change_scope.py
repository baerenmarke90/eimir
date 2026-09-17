#!/usr/bin/env python3
"""Classify changed paths for expensive pull-request gates.

Pull requests should only pay for checks that can be affected by their diff.
The classifier stays fail-closed for unknown paths and CI infrastructure so a
new repository surface cannot silently bypass an expensive safety gate.
Pushes to ``main`` are handled separately by the workflows and still run the
full integration suite.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable
from pathlib import Path

SCOPES = (
    "backend",
    "backend_integration",
    "self_hosted",
    "api_clients",
    "supply_chain",
    "deployment_guard",
    "recovery",
)

SAFE_DOC_PREFIXES = ("docs/", "specification/")
SAFE_DOC_EXACT = (
    "README.md",
    "AGENTS.md",
    "CLA.md",
    "COMMERCIAL-LICENSE.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "PROVENANCE.md",
    "TRADEMARKS.md",
    ".gitleaksignore",
    ".gitignore",
)
CANONICAL_COMPOSE_FILE = "compose.yaml"

# These leaf workflows validate changes to their own workflow file on pull
# requests and do not own any of the expensive core CI scopes below. Keeping
# this list exact is intentional: new workflows stay fail-closed until their
# safety boundary has been reviewed explicitly.
SELF_VALIDATING_LEAF_WORKFLOW_EXACT = (
    ".github/workflows/android-s8.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/g2-e2e.yml",
    ".github/workflows/incident-runbooks.yml",
    ".github/workflows/product-design-review.yml",
    ".github/workflows/reuse-review.yml",
    ".github/workflows/web-browser-qa.yml",
    ".github/workflows/web-s8.yml",
)

# Account-deletion recovery authority is intentionally classified by semantic
# module namespace plus a small exact set of orchestration/retention owners
# outside that namespace. ``deletion.py`` is the historical root module; every
# ``deletion_*`` module participates in, or may extend, the forward-only
# deletion/convergence boundary and must fail closed into Backup/Restore/Upgrade
# evidence when changed.
ACCOUNT_DELETION_RECOVERY_PREFIXES = (
    "backend/src/eimir/identity/deletion_",
)
ACCOUNT_DELETION_RECOVERY_EXACT = (
    "backend/src/eimir/identity/deletion.py",
    "backend/src/eimir/authorization/retention.py",
    "backend/src/eimir/attachments/retention.py",
    "backend/src/eimir/jobs/runner.py",
    "backend/src/eimir/main.py",
)

# Recovery scripts are grouped by their stable semantic stems so additions to
# an existing recovery family cannot silently bypass the expensive gate.
RECOVERY_SCRIPT_PREFIXES = (
    "scripts/self_hosted_recovery",
    "scripts/self_hosted_deletion_reconcile",
    "scripts/account_deletion_recovery",
    "scripts/test_self_hosted_recovery",
    "scripts/test_self_hosted_deletion_reconcile",
)

RECOVERY_CONTRACT_EXACT = (
    ".github/workflows/self-hosted-recovery.yml",
    ".env.example",
    CANONICAL_COMPOSE_FILE,
    "deploy/cloud-managed.env.example",
    "deploy/persistent-development.env.example",
    "docs/SELF-HOSTED-RECOVERY.md",
    "docs/SELF-HOSTING.md",
    "docs/DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md",
    "docs/ARCANE.md",
)


def _matches(path: str, *, prefixes: tuple[str, ...] = (), exact: tuple[str, ...] = ()) -> bool:
    return path in exact or any(path.startswith(prefix) for prefix in prefixes)


def _all_enabled() -> dict[str, bool]:
    return {scope: True for scope in SCOPES}


def _is_explicitly_safe_documentation(path: str) -> bool:
    return path in SAFE_DOC_EXACT or any(path.startswith(prefix) for prefix in SAFE_DOC_PREFIXES)


def classify_paths(paths: Iterable[str]) -> dict[str, bool]:
    result = {scope: False for scope in SCOPES}

    for raw_path in paths:
        path = raw_path.strip().replace("\\", "/")
        if not path:
            continue

        # The classifier and its owning workflow define the safety boundary.
        # Changes to either must exercise every gate.
        if path.startswith("tools/ci/") or path == ".github/workflows/ci.yml":
            return _all_enabled()

        known = path in SELF_VALIDATING_LEAF_WORKFLOW_EXACT

        # Backend lint, typing, unit tests and the OpenAPI contract only depend
        # on backend files. Web/Android changes no longer wake this job up.
        if path.startswith("backend/"):
            result["backend"] = True
            known = True

        # PostgreSQL/Alembic integration is relevant for runtime backend code,
        # migrations, integration fixtures/tests and Python dependency changes.
        if _matches(
            path,
            prefixes=(
                "backend/src/",
                "backend/alembic/",
                "backend/tests/integration/",
            ),
            exact=(
                "backend/alembic.ini",
                "backend/tests/conftest.py",
                "backend/pyproject.toml",
                "backend/uv.lock",
            ),
        ):
            result["backend_integration"] = True
            known = True

        # The documented Self-Hosted/Arcane stack is sensitive to the canonical
        # Compose contract and container/runtime wiring, not ordinary UI source.
        if _matches(
            path,
            prefixes=("web/docker-entrypoint.d/",),
            exact=(
                ".env.example",
                CANONICAL_COMPOSE_FILE,
                "deploy/persistent-development.env.example",
                "backend/Dockerfile",
                "web/Dockerfile",
                "web/nginx.conf",
                "backend/src/eimir/config.py",
                "backend/src/eimir/main.py",
                "docs/SELF-HOSTING.md",
                "docs/ARCANE.md",
            ),
        ):
            result["self_hosted"] = True
            known = True

        # Generated Web/Android clients only need regeneration when their
        # OpenAPI input or generator surfaces change.
        if _matches(
            path,
            prefixes=(
                "tools/openapi/",
                "web/src/api/generated/",
                "android/api/generated/",
            ),
            exact=(
                "backend/openapi.json",
                "backend/scripts/openapi_contract.py",
            ),
        ):
            result["api_clients"] = True
            known = True

        # Supply-chain work is dependency/build related; normal backend source
        # changes do not need a fresh audit and two no-cache container builds.
        if _matches(
            path,
            exact=(
                "backend/pyproject.toml",
                "backend/uv.lock",
                "backend/Dockerfile",
                "web/Dockerfile",
                "docs/DEPENDENCIES.md",
                ".github/dependabot.yml",
            ),
        ):
            result["supply_chain"] = True
            known = True

        # Network/port/CSP checks are tied to deployment and proxy surfaces.
        if _matches(
            path,
            prefixes=("web/docker-entrypoint.d/",),
            exact=(
                ".github/workflows/self-hosted-deployment-guard.yml",
                ".env.example",
                CANONICAL_COMPOSE_FILE,
                "deploy/cloud-managed.env.example",
                "deploy/persistent-development.env.example",
                "backend/Dockerfile",
                "web/Dockerfile",
                "web/nginx.conf",
                "web/scripts/check_csp_header.sh",
                "backend/src/eimir/config.py",
                "backend/src/eimir/main.py",
                "docs/SELF-HOSTING.md",
                "docs/ARCANE.md",
            ),
        ):
            result["deployment_guard"] = True
            known = True

        # Recovery acceptance is expensive and is needed for actual recovery
        # tooling/contracts plus schema migrations and the complete Account-
        # deletion authority/convergence namespace that an old snapshot must
        # survive. New deletion_* modules therefore inherit Recovery by default.
        if _matches(
            path,
            prefixes=(
                "backend/alembic/",
                *ACCOUNT_DELETION_RECOVERY_PREFIXES,
                *RECOVERY_SCRIPT_PREFIXES,
            ),
            exact=(
                *ACCOUNT_DELETION_RECOVERY_EXACT,
                *RECOVERY_CONTRACT_EXACT,
            ),
        ):
            result["recovery"] = True
            known = True

        # Ordinary client source is intentionally known but does not activate
        # backend/container gates. Client-specific workflows cover these trees.
        if path.startswith(("web/", "android/")):
            known = True

        if _is_explicitly_safe_documentation(path):
            known = True

        if not known:
            return _all_enabled()

    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("changed_files", type=Path, help="File with one changed path per line")
    args = parser.parse_args()

    paths = args.changed_files.read_text(encoding="utf-8").splitlines()
    for scope, enabled in classify_paths(paths).items():
        print(f"{scope}={'true' if enabled else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
