#!/usr/bin/env python3
"""Classify changed paths for expensive pull-request gates.

Pull requests should only pay for checks that can be affected by their diff.
The classifier stays fail-closed for unknown paths and CI infrastructure so a
new repository surface cannot silently bypass an expensive safety gate.
Pushes to ``main`` are handled separately by the workflows and still run the
full integration suite.

On top of the path scopes, pull requests run in one of two tiers (#2096):

* ``cheap``: lint, typing, unit tests, contracts and secret scanning only. The
  heavy scopes below are switched off; the nightly regression on ``main``
  covers them.
* ``full``: the heavy scopes selected by the paths. A pull request is ``full``
  when it is ready for review and either carries the ``ci:full`` label or
  touches a risk path (migrations, authentication/authorization, deployment,
  Compose, Self-Hosted and release tooling, CI/workflow files, or an unknown
  path). Draft pull requests always stay ``cheap``.
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
    "supply_chain_backend",
    "supply_chain_web",
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
    ".github/workflows/backend-encrypted.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/g2-e2e.yml",
    ".github/workflows/incident-runbooks.yml",
    ".github/workflows/product-design-review.yml",
    ".github/workflows/reuse-review.yml",
    ".github/workflows/web-browser-qa.yml",
    ".github/workflows/web-s8.yml",
)

# Tooling that a dedicated leaf workflow validates itself. Each path maps to the
# workflow that owns it: that workflow's ``pull_request.paths`` filter must list
# the path and, for ``test_*.py`` files, its jobs must run it (enforced by
# test_change_scope.py). None of these paths is consumed by a core CI gate, so
# changing only them must not wake Backend, Self-Hosted or Supply Chain.
# Files with other consumers stay fail-closed on purpose, for example
# ``scripts/release_manifest.py`` (also used by the release candidate and the
# project-identity scan) and ``scripts/android_test_release.py`` (no workflow
# validates it). The entries must precede the blanket ``tools/ci/`` rule below.
RELEASE_PUBLISH_WORKFLOW = ".github/workflows/release-publish.yml"
RELEASE_EVIDENCE_WORKFLOW = ".github/workflows/release-evidence.yml"
ANDROID_LAUNCHER_WORKFLOW = ".github/workflows/android-launcher-icons.yml"
SELF_VALIDATING_TOOLING_OWNERS = {
    # Immutable release publisher and private test channel.
    RELEASE_PUBLISH_WORKFLOW: RELEASE_PUBLISH_WORKFLOW,
    "scripts/image_archive_config.py": RELEASE_PUBLISH_WORKFLOW,
    "scripts/test_deployment_channel.py": RELEASE_PUBLISH_WORKFLOW,
    "scripts/verify_release_asset_set.py": RELEASE_PUBLISH_WORKFLOW,
    "tools/ci/test_image_archive_config.py": RELEASE_PUBLISH_WORKFLOW,
    "tools/ci/test_release_publish_workflow.py": RELEASE_PUBLISH_WORKFLOW,
    "tools/ci/test_test_deployment_channel.py": RELEASE_PUBLISH_WORKFLOW,
    "tools/ci/test_verify_release_asset_set.py": RELEASE_PUBLISH_WORKFLOW,
    # Release evidence build (also reused by release-publish.yml via workflow_call).
    RELEASE_EVIDENCE_WORKFLOW: RELEASE_EVIDENCE_WORKFLOW,
    "tools/ci/test_release_evidence.py": RELEASE_EVIDENCE_WORKFLOW,
    # Android launcher identity and adaptive-icon resources.
    ANDROID_LAUNCHER_WORKFLOW: ANDROID_LAUNCHER_WORKFLOW,
    "scripts/android_adaptive_icon_resources.py": ANDROID_LAUNCHER_WORKFLOW,
    "scripts/android_launcher_identity.py": ANDROID_LAUNCHER_WORKFLOW,
    "scripts/test_android_adaptive_icon_resources.py": ANDROID_LAUNCHER_WORKFLOW,
    "scripts/test_android_launcher_identity.py": ANDROID_LAUNCHER_WORKFLOW,
}

# These exact tools are tested by the unconditional Change Detection preflight,
# before it classifies any diff. They do not build or configure product runtimes.
# Keep their owner tests explicit; new CI tools and changes to the classifier or
# its workflow still enable every expensive gate until reviewed.
PREFLIGHT_TOOLING_TESTS = {
    "tools/ci/project_identity_scan.py": "tools/ci/test_project_identity_scan.py",
    "tools/ci/test_project_identity_scan.py": "tools/ci/test_project_identity_scan.py",
    "tools/ci/engineering_language_audit.py": "tools/ci/test_engineering_language_audit.py",
    "tools/ci/documentation_language_audit.py": "tools/ci/test_engineering_language_audit.py",
    "tools/ci/test_engineering_language_audit.py": "tools/ci/test_engineering_language_audit.py",
    "tools/ci/test_main_site.py": "tools/ci/test_main_site.py",
    "tools/site/build_main_site.py": "tools/ci/test_main_site.py",
}

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

SUPPLY_CHAIN_BACKEND_EXACT = (
    "backend/pyproject.toml",
    "backend/uv.lock",
    "backend/Dockerfile",
    "docs/DEPENDENCIES.md",
)

SUPPLY_CHAIN_WEB_EXACT = (
    "web/Dockerfile",
)

# Dependabot configuration can change dependency/update behavior across all
# ecosystems, so preserve the historical fail-closed Supply Chain coverage for
# both build surfaces when this cross-ecosystem control changes.
SUPPLY_CHAIN_CROSS_ECOSYSTEM_EXACT = (
    ".github/dependabot.yml",
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

        # Exact allowlist only; a mixed PR still classifies its other paths.
        if path in SELF_VALIDATING_TOOLING_OWNERS or path in PREFLIGHT_TOOLING_TESTS:
            continue

        # The classifier and its owning workflow define the safety boundary.
        # Changes to either must exercise every gate.
        if path.startswith("tools/ci/") or path == ".github/workflows/ci.yml":
            return _all_enabled()

        known = path in SELF_VALIDATING_LEAF_WORKFLOW_EXACT

        # Backend lint, typing, unit tests and the OpenAPI contract only depend
        # on backend files. Web/Capacitor changes do not wake this job up.
        if path.startswith("backend/"):
            result["backend"] = True
            known = True

        # Canonical legal documents feed the Backend's required terms version,
        # which a Backend unit test compares with the document front matter.
        # Web S8 regenerates and checks its bundled copy through its own filter.
        if path.startswith("legal/"):
            result["backend"] = True
            known = True

        # Canonical design tokens feed the Backend's service-mail palette, which
        # a Backend unit test compares with design/tokens.json. The Web image
        # builds from the checked-in generated adapter and Web S8 checks token
        # drift itself, so design changes need neither PostgreSQL integration
        # nor container gates. The whole design/ tree keeps the fast Backend
        # gate so a future Backend consumer of design data stays covered.
        if path.startswith("design/"):
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

        # The canonical generated Web client only needs regeneration when its
        # OpenAPI input or generator surfaces change.
        if _matches(
            path,
            prefixes=(
                "tools/openapi/",
                "web/src/api/generated/",
            ),
            exact=(
                "backend/openapi.json",
                "backend/scripts/openapi_contract.py",
            ),
        ):
            result["api_clients"] = True
            known = True

        # Supply-chain work keeps one stable required status while distinguishing
        # the expensive build surface underneath it. Backend dependency/build
        # controls do not need a Web no-cache image build; Web Dockerfile changes
        # do not need Python/uv/backend audit and build work.
        if path in SUPPLY_CHAIN_BACKEND_EXACT:
            result["supply_chain"] = True
            result["supply_chain_backend"] = True
            known = True

        if path in SUPPLY_CHAIN_WEB_EXACT:
            result["supply_chain"] = True
            result["supply_chain_web"] = True
            known = True

        if path in SUPPLY_CHAIN_CROSS_ECOSYSTEM_EXACT:
            result["supply_chain"] = True
            result["supply_chain_backend"] = True
            result["supply_chain_web"] = True
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

        # Canonical Web source and the Capacitor packaging trees (android/ is the
        # canonical Android wrapper) are known but do not activate backend/
        # container gates. Web has its own product gates; wrapper integration is
        # handled by mobile packaging work.
        if path.startswith(("web/", "android/", "ios/")):
            known = True

        # The public site ships in its own container. The unconditional
        # main-site preflight covers this tree and its assembly script.
        if path.startswith("site/"):
            known = True

        if _is_explicitly_safe_documentation(path):
            known = True

        if not known:
            return _all_enabled()

    return result


FULL_CI_LABEL = "ci:full"

# Scopes that need containers, PostgreSQL shards or full stack rehearsals. In
# the cheap pull-request tier they move to the nightly regression (#2096).
HEAVY_SCOPES = (
    "backend_integration",
    "self_hosted",
    "deployment_guard",
    "recovery",
)

# Risk paths put a ready pull request into the full tier automatically. They
# cover migrations, authentication/authorization, deployment and Compose,
# Self-Hosted/release tooling, and the CI definitions themselves.
RISK_PREFIXES = (
    "backend/alembic/",
    "backend/src/eimir/auth/",
    "backend/src/eimir/authorization/",
    "backend/src/eimir/identity/",
    "deploy/",
    ".github/",
    "tools/ci/",
    "scripts/self_hosted",
    "scripts/release",
)
RISK_EXACT = (
    CANONICAL_COMPOSE_FILE,
    ".env.example",
    "backend/alembic.ini",
    "backend/Dockerfile",
    "web/Dockerfile",
    "web/nginx.conf",
    "self-hosted-image-identity.json",
    "scripts/_identity_environment.py",
    "scripts/build_self_hosted_source.py",
    "scripts/check_environment_isolation.py",
    "scripts/check_runtime_environment.py",
    "scripts/compose_checked.py",
    "scripts/deployment_smoke.py",
    "scripts/verify_release_asset_set.py",
)

# Heavy workflows outside this classifier gate themselves on the ``ci:full``
# label because GitHub only exposes labels, not paths, to job conditions. A
# ready pull request that changes one of their definitions must carry the label
# so the changed workflow actually runs before merge.
LABEL_GATED_WORKFLOW_PREFIXES = (".github/actions/",)
LABEL_GATED_WORKFLOW_EXACT = (
    ".github/workflows/android-launcher-icons.yml",
    ".github/workflows/backend-encrypted.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/media-video.yml",
    RELEASE_EVIDENCE_WORKFLOW,
    ".github/workflows/web-browser-qa.yml",
)


def _normalized(paths: Iterable[str]) -> list[str]:
    return [path.strip().replace("\\", "/") for path in paths if path.strip()]


def risk_paths(paths: Iterable[str]) -> list[str]:
    """Return the changed paths that put a ready pull request into the full tier."""
    risky = []
    for path in _normalized(paths):
        if _matches(path, prefixes=RISK_PREFIXES, exact=RISK_EXACT):
            risky.append(path)
        elif classify_paths([path]) == _all_enabled():
            # Unknown surfaces fail closed into the full tier as well.
            risky.append(path)
    return risky


def label_gated_paths(paths: Iterable[str]) -> list[str]:
    """Paths that only a label-gated workflow validates before merge."""
    return [
        path
        for path in _normalized(paths)
        if _matches(path, prefixes=LABEL_GATED_WORKFLOW_PREFIXES, exact=LABEL_GATED_WORKFLOW_EXACT)
        or SELF_VALIDATING_TOOLING_OWNERS.get(path) in LABEL_GATED_WORKFLOW_EXACT
    ]


def tiered_outputs(
    paths: Iterable[str],
    *,
    pull_request: bool,
    draft: bool = False,
    labels: Iterable[str] = (),
) -> dict[str, str]:
    """Combine the path scopes with the pull-request tier into workflow outputs."""
    changed = _normalized(paths)
    scopes = classify_paths(changed)
    labelled = FULL_CI_LABEL in {label.strip() for label in labels}
    risky = risk_paths(changed)

    if not pull_request:
        full, reason = True, "not a pull request"
    elif draft:
        full, reason = False, "draft pull request"
    elif labelled:
        full, reason = True, f"label {FULL_CI_LABEL}"
    elif risky:
        full, reason = True, "risk paths: " + ", ".join(sorted(risky)[:5])
    else:
        full, reason = False, "no risk path and no ci:full label"

    if not full:
        for scope in HEAVY_SCOPES:
            scopes[scope] = False

    label_required = pull_request and not draft and not labelled and bool(label_gated_paths(changed))

    outputs = {scope: "true" if enabled else "false" for scope, enabled in scopes.items()}
    # Supply Chain stays a cheap required check; only its container and wheel
    # builds belong to the heavy tier.
    outputs["supply_chain_backend_build"] = "true" if full and scopes["supply_chain_backend"] else "false"
    outputs["supply_chain_web_build"] = "true" if full and scopes["supply_chain_web"] else "false"
    outputs["tier"] = "full" if full else "cheap"
    outputs["tier_reason"] = reason
    outputs["label_required"] = "true" if label_required else "false"
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("changed_files", type=Path, help="File with one changed path per line")
    parser.add_argument(
        "--pull-request",
        action="store_true",
        help="Classify a pull request; without it the full tier applies (push, schedule, dispatch).",
    )
    parser.add_argument("--draft", choices=("true", "false"), default="false")
    parser.add_argument("--labels", default="", help="Newline- or comma-separated pull-request labels")
    args = parser.parse_args()

    paths = args.changed_files.read_text(encoding="utf-8").splitlines()
    labels = [label for chunk in args.labels.splitlines() for label in chunk.split(",") if label.strip()]
    outputs = tiered_outputs(
        paths,
        pull_request=args.pull_request,
        draft=args.draft == "true",
        labels=labels,
    )
    for key, value in outputs.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

