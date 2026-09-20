"""Fail-closed Production release gate executed by Compose itself.

``scripts/self_hosted_release.py`` validates a released Production deployment
before it starts Compose. An Arcane "Deploy"/"Redeploy" runs Compose directly and
never reaches that launcher, so the same invariants also have to hold inside the
canonical ``compose.yaml``: every runtime service transitively waits for the
``release-guard`` one-shot, which runs ``verify`` from the selected backend image.

Trust root. The published ``self-hosted-image-identity.json`` of the immutable
release is bind-mounted read-only into the guard, exactly the file the launcher
reads. The guard requires the image references Compose renders for the runtime
services to be *identical* to the references recorded there, and requires that
record to be internally consistent and bound to ``EIMIR_RELEASE_VERSION``. It never
derives the expected values from the values under test. A source checkout ships an
unreleased placeholder instead, which is refused.

Operator identities. Only an explicit ``EIMIR_ENVIRONMENT`` is accepted. ``production``
runs every check; ``development``, ``test`` and ``demo`` are separate identities that
are not gated here; an unset or unknown value is refused, so a Production project that
lost its ``EIMIR_ENVIRONMENT`` cannot silently degrade to Development.

``bootstrap`` is the once-only Production deletion-authority provisioning step for an
Arcane project; it validates the same release identity and then delegates to
``eimir.identity.deletion_bootstrap`` which owns the never-replace-an-authority rule.
``tools/ci/test_arcane_release_guard.py`` keeps the guard and the launcher on one
trust contract.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

PRODUCTION = "production"
NON_PRODUCTION_IDENTITIES = frozenset({"development", "test", "demo"})
IDENTITY_PATH = Path("/run/eimir/self-hosted-image-identity.json")
IDENTITY_KIND = "eimir-self-hosted-image-identity"
_SEMVER = (
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"
)
_RELEASE_VERSION_RE = re.compile(_SEMVER)
_SHA40_RE = re.compile(r"[0-9a-f]{40}")
_IMAGE_RE = {
    role: re.compile(
        rf"ghcr\.io/baerenmarke90/eimir-{role}:v(?P<version>{_SEMVER})@sha256:[0-9a-f]{{64}}"
    )
    for role in ("backend", "web")
}
_IDENTITY_ROLES = {
    "backend": {"api", "worker", "migrate"},
    "web": {"web"},
}
# role -> (variable holding the rendered reference, operator-facing variable name)
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


def _profiles(environ: Mapping[str, str]) -> set[str]:
    return {
        item.strip()
        for item in _value(environ, "EIMIR_COMPOSE_PROFILES").split(",")
        if item.strip()
    }


def _identity_references(identity: Any, version: str) -> tuple[dict[str, str], list[str]]:
    """Return the published image references and every inconsistency in the record."""

    if not isinstance(identity, dict):
        return {}, ["release image identity must be a JSON object"]
    if "unreleased" in identity:
        return {}, [
            "release image identity is the source-checkout placeholder; provide the "
            "self-hosted-image-identity.json of the immutable release"
        ]
    if identity.get("schemaVersion") != 1 or identity.get("kind") != IDENTITY_KIND:
        return {}, ["release image identity is not a published Self-Hosted release identity"]
    product = identity.get("product")
    if not isinstance(product, dict):
        return {}, ["release image identity has no product binding"]
    published = product.get("version")
    if not isinstance(published, str) or product.get("tag") != f"v{published}":
        return {}, ["release image identity product version/tag is invalid"]

    problems: list[str] = []
    if published != version:
        problems.append("release image identity does not match EIMIR_RELEASE_VERSION")
    source = identity.get("sourceRevision")
    if not isinstance(source, str) or _SHA40_RE.fullmatch(source) is None:
        problems.append("release image identity sourceRevision is invalid")

    references: dict[str, str] = {}
    images = identity.get("images")
    if not isinstance(images, dict):
        return {}, [*problems, "release image identity has no images object"]
    for role, expected_roles in _IDENTITY_ROLES.items():
        record = images.get(role)
        if not isinstance(record, dict):
            problems.append(f"release image identity has no {role} record")
            continue
        reference = record.get("reference")
        match = _IMAGE_RE[role].fullmatch(reference) if isinstance(reference, str) else None
        if not isinstance(reference, str) or match is None or match.group("version") != published:
            problems.append(
                f"release image identity {role} reference is not the digest-qualified "
                "release image of its product version"
            )
        elif record.get("digest") != reference.split("@", 1)[1]:
            problems.append(f"release image identity {role} digest does not match its reference")
        elif not isinstance(record.get("roles"), list) or set(record["roles"]) != expected_roles:
            problems.append(f"release image identity {role} roles are inconsistent")
        else:
            references[role] = reference
    return references, problems


def load_identity(path: Path) -> tuple[Any, list[str]]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, [f"release image identity {path} is not mounted"]
    except (OSError, UnicodeDecodeError):
        return None, [f"release image identity {path} could not be read"]
    except json.JSONDecodeError:
        return None, ["release image identity is not valid JSON"]


def release_problems(
    environ: Mapping[str, str],
    *,
    identity_path: Path = IDENTITY_PATH,
    require_deletion_authority: bool,
) -> list[str]:
    """Return every Production release violation visible in the rendered values."""

    problems: list[str] = []
    version = _value(environ, "EIMIR_RELEASE_VERSION")
    if not version:
        problems.append("Production requires an explicit EIMIR_RELEASE_VERSION")
    elif _RELEASE_VERSION_RE.fullmatch(version) is None:
        problems.append("EIMIR_RELEASE_VERSION is not a SemVer product version")

    identity, load_problems = load_identity(identity_path)
    if load_problems:
        problems.extend(load_problems)
    elif version:
        published, identity_problems = _identity_references(identity, version)
        problems.extend(identity_problems)
        for role, (guard_key, operator_key) in _IMAGE_VARIABLES.items():
            if role in published and _value(environ, guard_key) != published[role]:
                problems.append(
                    f"{operator_key} differs from the {role} image published in "
                    "self-hosted-image-identity.json for EIMIR_RELEASE_VERSION"
                )

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


def _environment_problems(environment: str) -> list[str]:
    if environment == PRODUCTION or environment in NON_PRODUCTION_IDENTITIES:
        return []
    shown = repr(environment) if environment else "unset"
    return [
        f"EIMIR_ENVIRONMENT is {shown}; it must be set explicitly to production (or, for a "
        "separate Development/Demo project, to development, test or demo)"
    ]


def verify(environ: Mapping[str, str], *, identity_path: Path = IDENTITY_PATH) -> int:
    environment = _value(environ, "EIMIR_ENVIRONMENT")
    problems = _environment_problems(environment)
    if problems:
        return _refuse("the deployment", problems)
    if environment != PRODUCTION:
        print(f"Production release guard not applicable: EIMIR_ENVIRONMENT={environment}")
        return 0
    problems = release_problems(
        environ, identity_path=identity_path, require_deletion_authority=True
    )
    if "bootstrap" in _profiles(environ):
        problems.append(
            "Compose profile bootstrap is active next to the runtime; run the bootstrap "
            "with COMPOSE_PROFILES=bootstrap only"
        )
    if problems:
        return _refuse("the deployment", problems)
    print("Production release guard passed")
    return 0


def bootstrap(environ: Mapping[str, str], *, identity_path: Path = IDENTITY_PATH) -> int:
    if _value(environ, "EIMIR_ENVIRONMENT") != PRODUCTION:
        return _refuse(
            "the deletion-authority bootstrap",
            ["the Compose bootstrap is Production-only; set EIMIR_ENVIRONMENT=production"],
        )
    problems = release_problems(
        environ, identity_path=identity_path, require_deletion_authority=False
    )
    if _profiles(environ) - {"bootstrap"}:
        problems.append(
            "the bootstrap must run alone: set COMPOSE_PROFILES=bootstrap and no other profile"
        )
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
