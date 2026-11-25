#!/usr/bin/env python3
"""Check status-surface contracts for objectively detectable drift.

GitHub is canonical for moving repository facts. Implementation Status is the one
living project/gate source; secondary overview/roadmap surfaces must not become a
second Issue database or current-status authority. Historical reviews and evidence
records are intentionally outside prose drift scanning.

Open Issue tasks are checked against one tracker repository: the
``--repository`` argument, else ``EIMIR_STATUS_TRACKER_REPOSITORY``, else the
workflow's ``GITHUB_REPOSITORY``. A task may name its Issue as ``#N`` (the
tracker) or ``owner/name#N``. A qualified reference to another repository, for
example the archived pre-split repository after the Decision 0019 cut-over, is
listed as not checked instead of being queried: the workflow token cannot read
another private repository, and the line stays visible until it is re-created.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path

AUTHORITATIVE_STATUS_FILE = Path("docs/IMPLEMENTATION-STATUS.md")
M6_PLANNING_FILE = Path("docs/m6/README.md")
SECONDARY_STATUS_FILES = (
    Path("README.md"),
    Path("docs/ROADMAP.md"),
    Path("docs/assets/roadmap/roadmap-overview.svg"),
)
GOVERNANCE_STATUS_FILE = Path("docs/STATUS-SOURCES.md")

STATUS_ROLE_MARKERS = {
    Path("README.md"): "secondary-overview",
    AUTHORITATIVE_STATUS_FILE: "authoritative-living",
    Path("docs/ROADMAP.md"): "secondary-roadmap",
    Path("docs/assets/roadmap/roadmap-overview.svg"): "secondary-roadmap-visual",
    M6_PLANNING_FILE: "historical-m6-planning",
    GOVERNANCE_STATUS_FILE: "governance-contract",
}
CURRENT_STATUS_FILES = (
    AUTHORITATIVE_STATUS_FILE,
    *SECONDARY_STATUS_FILES,
    GOVERNANCE_STATUS_FILE,
)

# Keep the legacy German marker while historical migration regression coverage still
# protects against reintroducing the old form. It is matching input, not engineering
# prose.
STATIC_CURRENT_MAIN_SHA = re.compile(
    r"(?im)^.*(?:Current\s+\x60?main\x60?|Aktueller\s+\x60?main\x60?)"
    r"\s*:\s*\x60?[0-9a-f]{7,40}\x60?.*$"
)
# GitHub owner and repository names: letters, digits, '-', '_' and '.'.
REPOSITORY_NAME = r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+"
REPOSITORY_FULL_NAME = re.compile(rf"^{REPOSITORY_NAME}$")
OPEN_ISSUE_TASK = re.compile(
    r"(?m)^\s*-\s*\[ \].*?"
    rf"(?:(?<![\w./-])(?P<repository>{REPOSITORY_NAME}))?"
    r"#(?P<number>\d+)\b"
)
TRACKER_REPOSITORY_ENV = "EIMIR_STATUS_TRACKER_REPOSITORY"
STATUS_ROLE_MARKER = re.compile(
    r"<!--\s*status-surface:\s*(?P<role>[a-z0-9-]+)\s*-->"
)

OBSOLETE_PHRASES = {
    Path("README.md"): (
        "Current: M4 is complete. M5 — Client Completion & Parity is the active roadmap milestone.",
        "**Next milestone: M4 — Engage.**",
        "private repository under the current plan",
    ),
    AUTHORITATIVE_STATUS_FILE: (
        "As of: September 3, 2026",
        "M6 is the next milestone",
        "G5 has not yet been evaluated",
    ),
    Path("docs/ROADMAP.md"): (
        "**Current:** M0 through M5",
        "M6 — Operate & Launch** is the next milestone",
        "G5 has not yet been evaluated",
    ),
    Path("docs/assets/roadmap/roadmap-overview.svg"): (
        "ACTIVE · M5",
        "NEXT · M6 / G5",
        "NEXT → G5",
    ),
    M6_PLANNING_FILE: (
        "#262 remains the authoritative product/architecture decision. Until it is resolved:",
    ),
}

IssueStateFetcher = Callable[[int], str]


def resolve_tracker_repository(
    explicit: str | None,
    environment: Mapping[str, str],
) -> str:
    """Return the repository whose Issues the open status tasks name.

    Precedence: the explicit argument, then ``EIMIR_STATUS_TRACKER_REPOSITORY``,
    then ``GITHUB_REPOSITORY``. An empty result means "unknown".
    """

    for candidate in (
        explicit,
        environment.get(TRACKER_REPOSITORY_ENV),
        environment.get("GITHUB_REPOSITORY"),
    ):
        value = (candidate or "").strip()
        if not value:
            continue
        if not REPOSITORY_FULL_NAME.match(value):
            raise ValueError(f"tracker repository must be 'owner/name', got {value!r}.")
        return value
    return ""


def open_issue_references(text: str) -> list[tuple[str | None, int]]:
    """Return ``(repository or None, number)`` for every open Issue task line."""

    return [
        (match.group("repository"), int(match.group("number")))
        for match in OPEN_ISSUE_TASK.finditer(text)
    ]


def validate_role(path: Path, text: str) -> list[str]:
    expected = STATUS_ROLE_MARKERS.get(path)
    if expected is None:
        return []

    roles = [match.group("role") for match in STATUS_ROLE_MARKER.finditer(text)]
    if roles == [expected]:
        return []

    return [
        f"{path}: expected exactly one status-surface role '{expected}', found {roles!r}."
    ]


def validate_text(
    path: Path,
    text: str,
    issue_state: IssueStateFetcher | None = None,
    *,
    tracker_repository: str = "",
    skipped: list[str] | None = None,
) -> list[str]:
    errors: list[str] = []

    if path in CURRENT_STATUS_FILES and STATIC_CURRENT_MAIN_SHA.search(text):
        errors.append(
            f"{path}: current-facing status must not contain a static 'Current main' SHA. "
            "GitHub main is the canonical SHA source."
        )

    for phrase in OBSOLETE_PHRASES.get(path, ()):
        if phrase in text:
            errors.append(f"{path}: obsolete status phrase is forbidden: {phrase!r}.")

    if issue_state is not None and path == AUTHORITATIVE_STATUS_FILE:
        for repository, number in open_issue_references(text):
            label = f"{repository}#{number}" if repository else f"#{number}"
            if repository and repository.lower() != tracker_repository.lower():
                if skipped is not None:
                    skipped.append(
                        f"{path}: {label} is not checked; it names another repository "
                        f"than the tracker {tracker_repository or '(unknown)'}."
                    )
                continue
            state = issue_state(number)
            if state != "open":
                errors.append(
                    f"{path}: issue {label} is marked open, but GitHub reports '{state}'."
                )

    return errors


def github_issue_state_fetcher(repository: str, token: str) -> IssueStateFetcher:
    cache: dict[int, str] = {}

    def fetch(number: int) -> str:
        if number in cache:
            return cache[number]

        request = urllib.request.Request(
            f"https://api.github.com/repos/{repository}/issues/{number}",
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "eimir-status-drift-guard",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as exc:
            raise RuntimeError(
                f"GitHub issue #{number} could not be checked: HTTP {exc.code}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"GitHub issue #{number} could not be checked: {exc.reason}"
            ) from exc

        state = payload.get("state")
        if state not in {"open", "closed"}:
            raise RuntimeError(f"GitHub issue #{number} returned invalid state: {state!r}")
        cache[number] = state
        return state

    return fetch


def check_repository(
    root: Path,
    issue_state: IssueStateFetcher | None = None,
    *,
    tracker_repository: str = "",
    skipped: list[str] | None = None,
) -> list[str]:
    errors: list[str] = []
    for relative_path in STATUS_ROLE_MARKERS:
        path = root / relative_path
        if not path.is_file():
            errors.append(f"{relative_path}: status-contract file is missing.")
            continue

        text = path.read_text(encoding="utf-8")
        errors.extend(validate_role(relative_path, text))
        errors.extend(
            validate_text(
                relative_path,
                text,
                issue_state,
                tracker_repository=tracker_repository,
                skipped=skipped,
            )
        )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument(
        "--online",
        action="store_true",
        help="Verify Issues explicitly tracked as open in the authoritative status.",
    )
    parser.add_argument(
        "--repository",
        help=(
            "Tracker repository 'owner/name' for --online "
            f"(default: ${TRACKER_REPOSITORY_ENV}, then $GITHUB_REPOSITORY)."
        ),
    )
    args = parser.parse_args()

    fetcher: IssueStateFetcher | None = None
    repository = ""
    if args.online:
        try:
            repository = resolve_tracker_repository(args.repository, os.environ)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        token = os.environ.get("GITHUB_TOKEN", "")
        if not repository or not token:
            print(
                "--online requires a tracker repository (--repository, "
                f"{TRACKER_REPOSITORY_ENV} or GITHUB_REPOSITORY) and GITHUB_TOKEN.",
                file=sys.stderr,
            )
            return 2
        fetcher = github_issue_state_fetcher(repository, token)

    skipped: list[str] = []
    try:
        errors = check_repository(
            args.root,
            fetcher,
            tracker_repository=repository,
            skipped=skipped,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if fetcher is not None:
        print(f"Open Issue tasks checked against {repository}.")
    for note in skipped:
        print(f"Not checked: {note}")

    if errors:
        print("Status drift detected:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Status-surface contract is internally consistent and checkable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
