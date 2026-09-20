"""Fail-closed Production release gate executed by Compose itself.

``scripts/self_hosted_release.py`` validates a released Production deployment
before it starts Compose. An Arcane "Deploy"/"Redeploy" runs Compose directly and
never reaches that launcher, so the same invariants also have to hold inside the
canonical ``compose.yaml``: every runtime service transitively waits for the
``release-guard`` one-shot, which runs ``verify`` from the selected backend image.

The guard sees only the values Compose rendered for the application images, so it
enforces the subset of the launcher contract that is decidable from those values:
exact Production mode, digest-qualified backend/Web references of the declared
release version, ``pull_policy=always`` and a provisioned deletion authority. The
published ``self-hosted-image-identity.json`` cross-check stays with the launcher.
``tools/ci/test_arcane_release_guard.py`` keeps both accept/reject sets identical.

Development and Demo are separate operator identities and are not gated here.
``bootstrap`` is the once-only Production deletion-authority provisioning step for
an Arcane project; it validates the release identity and then delegates to
``eimir.identity.deletion_bootstrap`` which owns the never-replace-an-authority rule.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Mapping, Sequence
from uuid import UUID

PRODUCTION = "production"
_SEMVER = (
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"
)
_RELEASE_VERSION_RE = re.compile(_SEMVER)
_IMAGE_RE = {
    role: re.compile(
        rf"ghcr\.io/baerenmarke90/eimir-{role}:v(?P<version>{_SEMVER})@sha256:[0-9a-f]{{64}}"
    )
    for role in ("backend", "web")
}
_IMAGE_VARIABLES = {
    "backend": ("EIMIR_GUARD_BACKEND_IMAGE", "EIMIR_SELF_HOSTED_BACKEND_IMAGE"),
    "web": ("EIMIR_GUARD_WEB_IMAGE", "EIMIR_SELF_HOSTED_WEB_IMAGE"),
}
BOOTSTRAP_PROFILE_HINT = (
    "set COMPOSE_PROFILES=bootstrap once, deploy, copy the printed "
    "EIMIR_ACCOUNT_DELETION_INSTANCE_ID into the project environment, then set "
    "COMPOSE_PROFILES=self-hosted"
)


def _value(environ: Mapping[str, str], key: str) -> str:
    return environ.get(key, "").strip()


def release_problems(environ: Mapping[str, str], *, require_deletion_authority: bool) -> list[str]:
    """Return every Production release violation visible in the rendered values."""

    problems: list[str] = []
    version = _value(environ, "EIMIR_RELEASE_VERSION")
    if not version:
        problems.append("Production requires an explicit EIMIR_RELEASE_VERSION")
    elif _RELEASE_VERSION_RE.fullmatch(version) is None:
        problems.append("EIMIR_RELEASE_VERSION is not a SemVer product version")

    for role, (guard_key, operator_key) in _IMAGE_VARIABLES.items():
        match = _IMAGE_RE[role].fullmatch(_value(environ, guard_key))
        if match is None:
            problems.append(
                f"{operator_key} must be the digest-qualified "
                f"ghcr.io/baerenmarke90/eimir-{role} release reference "
                "from self-hosted-image-identity.json"
            )
        elif version and match.group("version") != version:
            problems.append(f"{operator_key} does not match EIMIR_RELEASE_VERSION")

    if _value(environ, "EIMIR_GUARD_PULL_POLICY") != "always":
        problems.append("EIMIR_SELF_HOSTED_PULL_POLICY must be always in Production")

    if require_deletion_authority:
        instance_id = _value(environ, "EIMIR_ACCOUNT_DELETION_INSTANCE_ID")
        if not instance_id:
            problems.append(
                "EIMIR_ACCOUNT_DELETION_INSTANCE_ID is not set; for a brand-new "
                f"installation {BOOTSTRAP_PROFILE_HINT}; an established installation must "
                "restore its stored value (see ACCOUNT-DELETION-SELF-HOSTED.md)"
            )
        else:
            try:
                UUID(instance_id)
            except ValueError:
                problems.append("EIMIR_ACCOUNT_DELETION_INSTANCE_ID is not a UUID")
    return problems


def _refuse(operation: str, problems: Sequence[str]) -> int:
    print(f"Production release guard refused {operation}:", file=sys.stderr)
    for problem in problems:
        print(f"- {problem}", file=sys.stderr)
    return 1


def verify(environ: Mapping[str, str]) -> int:
    environment = _value(environ, "EIMIR_ENVIRONMENT")
    if environment != PRODUCTION:
        print(
            f"Production release guard not applicable: EIMIR_ENVIRONMENT={environment or '<unset>'}"
        )
        return 0
    problems = release_problems(environ, require_deletion_authority=True)
    if problems:
        return _refuse("the deployment", problems)
    print("Production release guard passed")
    return 0


def bootstrap(environ: Mapping[str, str]) -> int:
    if _value(environ, "EIMIR_ENVIRONMENT") != PRODUCTION:
        return _refuse(
            "the deletion-authority bootstrap",
            ["the Compose bootstrap is Production-only; set EIMIR_ENVIRONMENT=production"],
        )
    problems = release_problems(environ, require_deletion_authority=False)
    if problems:
        return _refuse("the deletion-authority bootstrap", problems)

    from eimir.identity.deletion_bootstrap import (
        DeletionBootstrapError,
        bootstrap_new_deletion_authority,
    )

    try:
        instance_id = bootstrap_new_deletion_authority(confirmed_new_installation=True)
    except DeletionBootstrapError as exc:
        return _refuse("the deletion-authority bootstrap", [str(exc)])

    print("Account deletion authority initialized.")
    print(f"EIMIR_ACCOUNT_DELETION_INSTANCE_ID={instance_id}")
    print(
        "Store this value in the project environment and the protected operator "
        "configuration backup, then set COMPOSE_PROFILES=self-hosted and deploy."
    )
    print("Do not run the bootstrap again for this installation.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("operation", choices=("verify", "bootstrap"))
    args = parser.parse_args(argv)
    operation = verify if args.operation == "verify" else bootstrap
    return operation(os.environ)


if __name__ == "__main__":
    raise SystemExit(main())
