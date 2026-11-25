#!/usr/bin/env python3
"""Record which supply-chain capabilities the publishing repository has.

GitHub artifact attestations and code scanning (CodeQL) are free on a public
repository. On a private repository of a personal account neither is available:
attestations need GitHub Enterprise Cloud and code scanning needs GitHub Code
Security. Decision 0019 (cut-over runbook, decision D5, accepted on November 25,
2026) accepts that the private ``eimir-pro`` repository runs without both, recorded
in the evidence, while the public ``eimir-core`` keeps them.

The capability is probed from the repository metadata, never inferred from a
failing step:

- **available** (a public repository, or an organization repository whose plan is
  assumed to include the products): attestations are created and verified and
  CodeQL is a required workflow, exactly as before;
- **unavailable** (a private or internal repository of a personal account): accepted
  only when the repository variable ``EIMIR_SUPPLY_CHAIN_EXCEPTION`` holds
  ``decision-0019-d5``. The evidence then carries a record that names the
  repository, the source revision and the reason, and every verification step
  checks that exact record instead of an attestation.

Everything else is refused: the acceptance on a repository that has the
capabilities, an unknown visibility or owner type, or a private personal
repository without the acceptance. A required step therefore never turns green
by skipping its work.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Mapping

ACCEPTANCE_ENV = "EIMIR_SUPPLY_CHAIN_EXCEPTION"
ACCEPTANCE = "decision-0019-d5"
DECISION = "Decision 0019, cut-over runbook decision D5 (November 25, 2026)"
RECORD_KIND = "eimir-supply-chain-state"
RECORD_NAME = "supply-chain-state.json"
AVAILABLE = "available"
UNAVAILABLE = "unavailable"
CAPABILITIES = ("attestation", "codeScanning")
OUTPUT_NAMES = {"attestation": "attestation", "codeScanning": "code_scanning"}
BUNDLE_SUFFIXES = ("-provenance.json", "-sbom.json")
REPOSITORY_NAME = re.compile(r"[A-Za-z0-9-]+/[A-Za-z0-9._-]+")
BUNDLE_PREFIX = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
SHA40 = re.compile(r"[0-9a-f]{40}")

REASONS = {
    "attestation": (
        "GitHub artifact attestations need a public repository or GitHub Enterprise "
        "Cloud; {repository} is a {visibility} repository of a personal account."
    ),
    "codeScanning": (
        "GitHub code scanning (CodeQL) needs a public repository or GitHub Code "
        "Security; {repository} is a {visibility} repository of a personal account."
    ),
}


class CapabilityError(ValueError):
    """The repository state cannot be accepted or does not match its record."""


def assess(repository: Mapping[str, Any], acceptance: str) -> dict[str, Any]:
    """Decide the capability state from ``GET /repos/{owner}/{repo}`` metadata."""
    if not isinstance(repository, Mapping):
        raise CapabilityError("Repository metadata must be a JSON object")
    name = repository.get("full_name")
    if not isinstance(name, str) or not REPOSITORY_NAME.fullmatch(name):
        raise CapabilityError("Repository metadata has no valid full_name")
    visibility = repository.get("visibility")
    private = repository.get("private")
    if visibility not in {"public", "private", "internal"} or not isinstance(private, bool):
        raise CapabilityError(f"Repository visibility of {name} is unknown")
    if private is (visibility == "public"):
        raise CapabilityError(f"Repository visibility of {name} is inconsistent")
    owner = repository.get("owner")
    owner_type = owner.get("type") if isinstance(owner, Mapping) else None
    if owner_type not in {"User", "Organization"}:
        raise CapabilityError(f"Repository owner type of {name} is unknown")
    acceptance = acceptance.strip()

    state: dict[str, Any] = {
        "repository": name,
        "visibility": visibility,
        "ownerType": owner_type,
    }
    if visibility == "public" or owner_type == "Organization":
        if acceptance:
            raise CapabilityError(
                f"{ACCEPTANCE_ENV} is set on {name}, but its exception covers only a "
                "private repository of a personal account; there attestations and "
                "CodeQL stay required. Remove the variable."
            )
        state.update({capability: {"state": AVAILABLE} for capability in CAPABILITIES})
        return state

    if acceptance != ACCEPTANCE:
        raise CapabilityError(
            f"Artifact attestations and CodeQL are unavailable on {name}, a "
            f"{visibility} repository of a personal account. The release pipeline "
            f"accepts this only with the repository variable {ACCEPTANCE_ENV}="
            f"{ACCEPTANCE} ({DECISION})."
        )
    state.update(
        {
            capability: {
                "state": UNAVAILABLE,
                "reason": REASONS[capability].format(repository=name, visibility=visibility),
            }
            for capability in CAPABILITIES
        }
    )
    state["acceptedBy"] = DECISION
    return state


def build_record(state: Mapping[str, Any], source_revision: str) -> dict[str, Any]:
    if not SHA40.fullmatch(source_revision):
        raise CapabilityError("A full lowercase source commit SHA is required")
    return {"schemaVersion": 1, "kind": RECORD_KIND, "sourceRevision": source_revision, **state}


def verify_record(record: Any, expected: Mapping[str, Any]) -> None:
    """Require the transported record to be exactly the freshly probed one."""
    if not isinstance(record, dict):
        raise CapabilityError("The supply-chain record must be a JSON object")
    if record.get("schemaVersion") != 1 or record.get("kind") != RECORD_KIND:
        raise CapabilityError("The supply-chain record has an unsupported kind or schema")
    for key in ("repository", "sourceRevision"):
        if record.get(key) != expected[key]:
            raise CapabilityError(
                f"The supply-chain record names {key} {record.get(key)!r}, "
                f"expected {expected[key]!r}"
            )
    for capability in CAPABILITIES:
        recorded = record.get(capability)
        actual = expected[capability]
        if not isinstance(recorded, dict) or recorded.get("state") != actual["state"]:
            raise CapabilityError(
                f"The supply-chain record says {capability} is "
                f"{recorded.get('state') if isinstance(recorded, dict) else recorded!r}, "
                f"but this repository has it {actual['state']}"
            )
    if record != expected:
        raise CapabilityError("The supply-chain record does not match this repository")


def verify_bundles(record: Mapping[str, Any], directory: Path, subjects: list[str]) -> None:
    """Check the retained attestation bundles against the recorded state."""
    if not subjects:
        raise CapabilityError("At least one attested subject is required")
    for subject in subjects:
        if not BUNDLE_PREFIX.fullmatch(subject):
            raise CapabilityError(f"Invalid attestation subject prefix: {subject!r}")
    bundles = (
        sorted(
            path.name
            for path in directory.iterdir()
            if path.is_file() and path.name.endswith(BUNDLE_SUFFIXES)
        )
        if directory.is_dir()
        else []
    )
    if record["attestation"]["state"] == UNAVAILABLE:
        if bundles:
            raise CapabilityError(
                "Attestations are recorded as unavailable, but bundles exist: "
                + ", ".join(bundles)
            )
        return
    missing = [
        f"{subject}{suffix}"
        for subject in subjects
        for suffix in BUNDLE_SUFFIXES
        if not (directory / f"{subject}{suffix}").is_file()
        or (directory / f"{subject}{suffix}").stat().st_size == 0
    ]
    if missing:
        raise CapabilityError("Attestation bundles are missing: " + ", ".join(missing))


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CapabilityError(f"Cannot read {path}: {error}") from error


def publish_outputs(state: Mapping[str, Any], github_output: Path | None) -> None:
    lines = [f"{OUTPUT_NAMES[name]}={state[name]['state']}" for name in CAPABILITIES]
    if github_output is not None:
        with github_output.open("a", encoding="utf-8") as stream:
            stream.write("\n".join(lines) + "\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    for name in CAPABILITIES:
        capability = state[name]
        if capability["state"] == UNAVAILABLE:
            message = f"{name} unavailable on {state['repository']}: {capability['reason']}"
            # A visible annotation, so the accepted gap never reads as a silent pass.
            print(f"::notice title=Supply chain ({name})::{message}")
            if summary:
                with Path(summary).open("a", encoding="utf-8") as stream:
                    stream.write(f"- {message} Accepted by {state['acceptedBy']}.\n")
        else:
            print(f"{name} available on {state['repository']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("assess", "probe", "verify"):
        sub = commands.add_parser(command)
        sub.add_argument("--repository-json", type=Path, required=True)
        sub.add_argument("--github-output", type=Path)
        if command != "assess":
            sub.add_argument("--source-revision", required=True)
        if command == "probe":
            sub.add_argument("--output", type=Path, required=True)
        if command == "verify":
            sub.add_argument("--record", type=Path, required=True)
            sub.add_argument("--attestation-dir", type=Path)
            sub.add_argument("--subject", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        state = assess(load_json(args.repository_json), os.environ.get(ACCEPTANCE_ENV, ""))
        if args.command == "probe":
            record = build_record(state, args.source_revision)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        elif args.command == "verify":
            record = load_json(args.record)
            verify_record(record, build_record(state, args.source_revision))
            if args.attestation_dir is not None:
                verify_bundles(record, args.attestation_dir, args.subject)
            elif args.subject:
                raise CapabilityError("--subject requires --attestation-dir")
        publish_outputs(state, args.github_output)
    except CapabilityError as error:
        print(f"Supply-chain state refused: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
