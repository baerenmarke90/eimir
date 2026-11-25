#!/usr/bin/env python3
"""Publish a checked, digest-pinned private test channel for Arcane Git Sync.

The root Compose contract owns the process topology. This exporter only wires its
Cloud processes to the existing test instance; it never reads operator secrets.
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import tomllib
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

import image_archive_config
import release_manifest
import supply_chain_state

# Decision 0019: the channel moves from the old monorepo to the private Pro and
# release repository, and a rehearsal runs it in throwaway repositories first.
# The publishing repository, the deployment instance and the Core source are
# therefore plain Actions variables (never secrets). Unset or empty variables
# reproduce the monorepo behaviour exactly: repository baerenmarke90/eimir,
# instance eimir-test (branch deploy/eimir-test) and Core from the same checkout.
REPOSITORY_ENV = "EIMIR_TEST_CHANNEL_REPOSITORY"
DEFAULT_REPOSITORY = "baerenmarke90/eimir"
INSTANCE_ENV = "EIMIR_TEST_CHANNEL_INSTANCE"
DEFAULT_INSTANCE = "eimir-test"
# Split mode: the official image is built from a pinned revision of this public
# Core repository plus the publishing (Pro) repository's own tree.
CORE_REPOSITORY_ENV = "EIMIR_CORE_REPOSITORY"
# Only for a private Core repository (the rehearsal): a fine-grained token that
# can read that one repository. It is stored in the Pro repository, never in the
# Core repository; a public Core needs no token.
CORE_TOKEN_ENV = "EIMIR_CORE_READ_TOKEN"
# GitHub owner names: letters, digits and single inner hyphens, at most 39
# characters. Repository names are `eimir` or `eimir-` plus lowercase segments,
# like the package prefix below.
REPOSITORY_PATTERN = re.compile(
    r"(?P<owner>[A-Za-z0-9](?:-?[A-Za-z0-9])*)/(?P<name>eimir(?:-[a-z0-9]+)*)"
)
INSTANCE_PATTERN = re.compile(r"eimir(?:-[a-z0-9]+)+")
# Phase 0b of Decision 0019: the channel publishes to the private GHCR packages
# eimir-cloud-{backend,web,media}. The legacy prefix "eimir" names the old public
# packages and stays selectable only as an explicit rollback. Both settings are
# Actions variables, never secrets.
PACKAGE_PREFIX_ENV = "EIMIR_TEST_CHANNEL_PACKAGE_PREFIX"
PROMOTE_ENV = "EIMIR_TEST_CHANNEL_PROMOTE"
DEFAULT_PACKAGE_PREFIX = "eimir-cloud"
LEGACY_PUBLIC_PACKAGE_PREFIX = "eimir"
PACKAGE_PREFIX_PATTERN = re.compile(r"eimir(?:-[a-z0-9]+)*")
# GHCR may create a new package public when its source label points at a public
# repository (observed on the first eimir-cloud publication), so every publication
# proves that the pushed digests are not anonymously readable. 401, 403 and 404 mean
# "not anonymous"; only a clean 200 means public.
PRIVATE_PACKAGE_STATUSES = frozenset({401, 403, 404})
GHCR_REFERENCE = re.compile(
    r"ghcr\.io/(?P<name>[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*)"
    r"@(?P<digest>sha256:[0-9a-f]{64})"
)
GHCR_MANIFEST_ACCEPT = ", ".join(
    (
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
    )
)
CHANNEL_KIND = "eimir-private-test-channel"
ROOT = Path(__file__).resolve().parents[1]
REQUIRED_WORKFLOWS = frozenset(
    {
        ".github/workflows/ci.yml",
        ".github/workflows/web-browser-qa.yml",
        ".github/workflows/codeql.yml",
        ".github/workflows/self-hosted-deployment-guard.yml",
        ".github/workflows/self-hosted-recovery.yml",
        ".github/workflows/media-video.yml",
    }
)
# Decision 0019, D5: a private personal repository has no code scanning, so CodeQL
# is dropped from the required set only where scripts/supply_chain_state.py records
# it as unavailable with the Product Owner's acceptance.
CODE_SCANNING_WORKFLOW = ".github/workflows/codeql.yml"
# Pushes to main start no workflows (#2096). The full regression of a main
# revision is the set of dispatched runs from the Nightly Regression dispatcher
# or a manual dispatch.
FULL_REGRESSION_EVENT = "workflow_dispatch"
FULL_REGRESSION_DISPATCHER = "nightly-regression.yml"
# Every merge to main publishes the private test channel right away (#2096,
# Product Owner decision 2026-11-20): a push admits the current main commit
# after its pull-request checks, without waiting for the full regression.
# Product releases keep requiring the full regression.
FAST_LANE_EVENT = "push"
CLOUD_SERVICES = ("cloud-migrate", "cloud-api", "cloud-worker", "cloud-web")
FCM_CREDENTIAL_TARGET = "/run/secrets/eimir-fcm-sender.json"
_FCM_SOURCE_PLACEHOLDER = "/__eimir_source_only_fcm_mount__"


class ChannelError(ValueError):
    """The candidate must not replace the last known channel configuration."""


class GitHubError(ChannelError):
    def __init__(self, endpoint: str, missing: bool = False) -> None:
        super().__init__(f"GitHub request failed: {endpoint}")
        self.missing = missing


def _repository_setting(name: str, value: str) -> str:
    match = REPOSITORY_PATTERN.fullmatch(value)
    if not match or len(match["owner"]) > 39:
        raise ChannelError(
            f"{name} must be OWNER/eimir or OWNER/eimir- followed by lowercase "
            "letters, digits and single hyphens"
        )
    return value


def publishing_repository() -> str:
    """The only repository that may publish; unset or empty keeps the monorepo."""
    value = os.environ.get(REPOSITORY_ENV, "").strip()
    return _repository_setting(REPOSITORY_ENV, value) if value else DEFAULT_REPOSITORY


def core_repository() -> str | None:
    """The public Core repository in split mode; None builds Core from this checkout."""
    value = os.environ.get(CORE_REPOSITORY_ENV, "").strip()
    if not value:
        return None
    _repository_setting(CORE_REPOSITORY_ENV, value)
    publisher = publishing_repository()
    if value == publisher:
        raise ChannelError(
            f"{CORE_REPOSITORY_ENV} must name the Core repository, not the publisher"
        )
    if value.partition("/")[0] != publisher.partition("/")[0]:
        # The Core revision becomes part of the official image; it may only come
        # from the same owner as the publisher.
        raise ChannelError(
            f"{CORE_REPOSITORY_ENV} must have the same owner as {publisher}"
        )
    return value


def instance() -> str:
    """The deployment instance; it names the branch, project, networks and stores."""
    value = os.environ.get(INSTANCE_ENV, "").strip()
    if not value:
        return DEFAULT_INSTANCE
    if not INSTANCE_PATTERN.fullmatch(value):
        raise ChannelError(
            f"{INSTANCE_ENV} must be 'eimir-' followed by lowercase letters, digits "
            "and single hyphens"
        )
    return value


def channel_branch() -> str:
    return f"deploy/{instance()}"


def core_token_environment() -> dict[str, str] | None:
    """GH_TOKEN for Core reads when a private Core needs its own read token."""
    token = os.environ.get(CORE_TOKEN_ENV, "")
    if not token:
        return None
    return {**os.environ, "GH_TOKEN": token}


def run(
    arguments: list[str],
    *,
    timeout: int = 120,
    stdin: str | None = None,
    environment: dict[str, str] | None = None,
) -> str:
    result = subprocess.run(
        arguments,
        input=stdin,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=environment,
    )
    if result.returncode:
        # Do not relay environment values, command output, or credential helpers.
        raise ChannelError(f"Command failed: {arguments[0]}")
    return result.stdout


def gh_api(
    endpoint: str,
    *,
    payload: dict | None = None,
    paginate: bool = False,
    method: str = "POST",
    environment: dict[str, str] | None = None,
):
    arguments = ["gh", "api", endpoint]
    if payload is not None:
        arguments += ["--method", method, "--input", "-"]
    if paginate:
        arguments += ["--paginate", "--slurp"]
    result = subprocess.run(
        arguments,
        input=json.dumps(payload) if payload is not None else None,
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
        env=environment,
    )
    if result.returncode:
        raise GitHubError(endpoint, missing="(HTTP 404)" in result.stderr)
    return json.loads(result.stdout)


def revision(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ChannelError("A full lowercase source commit SHA is required")
    return value


def latest_main() -> str:
    return revision(
        gh_api(f"repos/{publishing_repository()}/git/ref/heads/main")["object"]["sha"]
    )


def required_workflows() -> frozenset[str]:
    """Every required workflow, without CodeQL where code scanning is unavailable."""
    try:
        state = supply_chain_state.assess(
            gh_api(f"repos/{publishing_repository()}"),
            os.environ.get(supply_chain_state.ACCEPTANCE_ENV, ""),
        )
    except supply_chain_state.CapabilityError as error:
        raise ChannelError(str(error)) from error
    code_scanning = state["codeScanning"]
    if code_scanning["state"] == supply_chain_state.AVAILABLE:
        return REQUIRED_WORKFLOWS
    print(f"CodeQL is not a required workflow here: {code_scanning['reason']}")
    return REQUIRED_WORKFLOWS - {CODE_SCANNING_WORKFLOW}


def workflow_state(
    runs: list[dict], source: str, required: frozenset[str] = REQUIRED_WORKFLOWS
) -> bool:
    """Require the newest full-regression run/attempt of every exact main workflow."""
    selected: dict[str, dict] = {}
    for item in runs:
        path = item.get("path")
        if (
            path not in required
            or item.get("event") != FULL_REGRESSION_EVENT
            or item.get("head_branch") != "main"
            or item.get("head_sha") != source
            or item.get("head_repository", {}).get("full_name") != publishing_repository()
        ):
            continue
        key = (item["id"], item.get("run_attempt", 1))
        previous = selected.get(path)
        if previous is None or key > (previous["id"], previous.get("run_attempt", 1)):
            selected[path] = item
    for path, item in selected.items():
        if item.get("status") == "completed" and item.get("conclusion") != "success":
            raise ChannelError(f"Required main workflow did not succeed: {path}")
    return len(selected) == len(required) and all(
        item.get("status") == "completed" and item.get("conclusion") == "success"
        for item in selected.values()
    )


def candidate_ready(source: str) -> bool:
    required = required_workflows()
    pages = gh_api(
        f"repos/{publishing_repository()}/actions/runs?head_sha={source}&event={FULL_REGRESSION_EVENT}&per_page=100",
        paginate=True,
    )
    return workflow_state(
        [item for page in pages for item in page["workflow_runs"]], source, required
    )


def completion_matches_source(event: dict, source: str) -> bool:
    """Admit only an owning-repository main full-regression completion for this checkout."""
    if not isinstance(event, dict):
        return False
    completed = event.get("workflow_run")
    if not isinstance(completed, dict):
        return False
    origin = completed.get("head_repository")
    if not isinstance(origin, dict):
        return False
    return (
        event.get("action") == "completed"
        and completed.get("path") in REQUIRED_WORKFLOWS
        and completed.get("event") == FULL_REGRESSION_EVENT
        and completed.get("head_branch") == "main"
        and completed.get("head_sha") == source
        and origin.get("full_name") == publishing_repository()
        and completed.get("status") == "completed"
        and completed.get("conclusion") == "success"
    )


def selected_identity() -> dict | None:
    """The owned channel.json on the deployment branch; None only after a real 404."""
    repository = publishing_repository()
    try:
        parent = revision(
            gh_api(f"repos/{repository}/git/ref/heads/{channel_branch()}")["object"][
                "sha"
            ]
        )
    except GitHubError as error:
        if error.missing:
            return None
        raise
    current = gh_api(f"repos/{repository}/contents/channel.json?ref={parent}")
    identity = json.loads(base64.b64decode(current["content"], validate=False))
    if identity.get("kind") != CHANNEL_KIND or identity.get("schemaVersion") != 1:
        raise ChannelError("Existing deployment branch is not an owned test channel")
    return identity


def selected_core_revision(identity: dict | None) -> str | None:
    """The Core revision the selected channel was built from (split mode only)."""
    if identity is None or "coreSource" not in identity:
        # A monorepo channel, for example the one seeded into the Pro repository
        # on the cut-over day, names no separate Core revision.
        return None
    core = identity["coreSource"]
    if not isinstance(core, dict) or core.get("repository") != core_repository():
        raise ChannelError("The selected channel was built from another Core repository")
    return revision(str(core.get("revision", "")))


def channel_already_selected(source: str, core: str | None = None) -> bool:
    """Avoid rebuilding an already selected pair after repeated completions."""
    identity = selected_identity()
    if identity is None or revision(identity["sourceRevision"]) != source:
        return False
    return core is None or selected_core_revision(identity) == core


# Split mode (Decision 0019, runbook D2): Core Advance tests the Pro tree against
# a new Core main revision and dispatches the publisher with both identities.
CORE_REVISION_ENV = "EIMIR_CORE_REVISION"
CORE_ADVANCE_RUN_ENV = "EIMIR_CORE_ADVANCE_RUN"
CORE_ADVANCE_WORKFLOW = ".github/workflows/core-advance.yml"
CORE_ADVANCE_EVENTS = frozenset({"schedule", "workflow_dispatch"})
# The job names carry the Core revision, so the Actions API alone proves which
# Core revision a run tested or handed to the publisher.
PRO_TESTS_JOB = "Pro tests against Core {revision}"
PUBLISHER_CHECK_JOB = "Check Core {revision}"
BLOCKED_ISSUE_TITLE = "Core advance blocked"
BLOCKED_MARKER = "Core revision {revision}"


def core_main() -> str:
    return revision(
        gh_api(
            f"repos/{core_repository()}/git/ref/heads/main",
            environment=core_token_environment(),
        )["object"]["sha"]
    )


def core_contains(base: str, head: str) -> bool:
    """Whether `head` is `base` or a descendant of it in the Core repository."""
    if base == head:
        return True
    comparison = gh_api(
        f"repos/{core_repository()}/compare/{base}...{head}",
        environment=core_token_environment(),
    )
    return comparison.get("status") in {"ahead", "identical"}


def run_jobs(run_id: str) -> list[dict]:
    pages = gh_api(
        f"repos/{publishing_repository()}/actions/runs/{run_id}/jobs?filter=latest&per_page=100",
        paginate=True,
    )
    return [job for page in pages for job in page.get("jobs", [])]


def job_conclusion(jobs: list[dict], name: str) -> str | None:
    """The conclusion of exactly one job with this name; None when unfinished or absent."""
    matching = [job for job in jobs if job.get("name") == name]
    if len(matching) != 1 or matching[0].get("status") != "completed":
        return None
    return matching[0].get("conclusion")


def core_advance_state(source: str, core: str, run_id: str) -> str:
    """`passed`, `stale` (it tested an older Pro main) or `failed` for this pair."""
    if not re.fullmatch(r"[1-9][0-9]*", run_id):
        raise ChannelError(f"{CORE_ADVANCE_RUN_ENV} must name a Core Advance run id")
    repository = publishing_repository()
    tested = gh_api(f"repos/{repository}/actions/runs/{run_id}")
    if (
        tested.get("path") != CORE_ADVANCE_WORKFLOW
        or tested.get("event") not in CORE_ADVANCE_EVENTS
        or tested.get("head_branch") != "main"
        or (tested.get("head_repository") or {}).get("full_name") != repository
        or not re.fullmatch(r"[0-9a-f]{40}", str(tested.get("head_sha", "")))
    ):
        return "failed"
    if job_conclusion(run_jobs(run_id), PRO_TESTS_JOB.format(revision=core)) != "success":
        return "failed"
    # A Pro merge while the tests ran: the dispatch runs on the newer main. Not
    # a failure; the next Core Advance run tests the new Pro revision.
    return "passed" if tested["head_sha"] == source else "stale"


def require_no_core_inputs() -> None:
    if os.environ.get(CORE_REVISION_ENV, "").strip() or os.environ.get(
        CORE_ADVANCE_RUN_ENV, ""
    ).strip():
        raise ChannelError(
            f"A Core revision needs {CORE_REPOSITORY_ENV}; the monorepo builds its own Core"
        )


def check_split_publication(source: str, event_name: str) -> str | None:
    """The Core revision to build with this Pro revision, or None to keep the channel.

    A Pro merge (push) rebuilds with the Core revision the channel already selects.
    Only a Core Advance run whose Pro tests passed for exactly this pair can move
    the Core revision, and only forward along Core main.
    """
    if event_name == "workflow_run":
        print("Full-regression completions do not admit a build when Core is pinned")
        return None
    if event_name not in {FAST_LANE_EVENT, "workflow_dispatch"}:
        raise ChannelError("Test checks require a Pro merge or a Core Advance dispatch")
    if latest_main() != source:
        print("Candidate was superseded on main; keeping the current channel")
        return None
    identity = selected_identity()
    selected = selected_core_revision(identity)
    if event_name == FAST_LANE_EVENT:
        require_no_core_inputs()
        if selected is None:
            raise ChannelError(
                "The channel selects no Core revision yet; run Core Advance to pin one"
            )
        core = selected
    else:
        value = os.environ.get(CORE_REVISION_ENV, "").strip()
        if not re.fullmatch(r"[0-9a-f]{40}", value):
            raise ChannelError(
                f"{CORE_REVISION_ENV} must be the full Core commit SHA from Core Advance"
            )
        core = value
        run_id = os.environ.get(CORE_ADVANCE_RUN_ENV, "").strip()
        state = core_advance_state(source, core, run_id)
        if state == "stale":
            print("Core Advance tested an older Pro main; the next run tests the current one")
            return None
        if state != "passed":
            raise ChannelError(
                f"Core Advance run {run_id} did not pass the Pro tests for Pro {source} "
                f"and Core {core}"
            )
        if not core_contains(core, core_main()):
            raise ChannelError(f"Core {core} is not on the Core main branch")
        if selected is not None and not core_contains(selected, core):
            raise ChannelError(
                f"Core {core} does not descend from the selected Core {selected}; "
                "the pin only moves forward"
            )
    if (
        identity is not None
        and revision(identity["sourceRevision"]) == source
        and selected == core
    ):
        print("This source pair is already selected; preserving its exact image pair")
        return None
    return core


def check_for_publication(source: str, event_name: str, event: dict) -> bool:
    """Check once; later main workflow completions retry unfinished candidates."""
    require_no_core_inputs()
    if event_name == FAST_LANE_EVENT:
        if latest_main() != source:
            print("Candidate was superseded on main; keeping the current channel")
            return False
        if channel_already_selected(source):
            print("This source is already selected; preserving its exact image pair")
            return False
        return True
    if event_name == "workflow_run":
        if not completion_matches_source(event, source):
            print("Completion does not admit this exact main checkout")
            return False
    elif event_name != "workflow_dispatch":
        raise ChannelError("Test checks require a main completion or manual retry")
    if latest_main() != source:
        print("Candidate was superseded on main; keeping the current channel")
        return False
    if not candidate_ready(source):
        print("Required main workflows are unfinished; awaiting another completion")
        return False
    if channel_already_selected(source):
        print("This source is already selected; preserving its exact image pair")
        return False
    return True


def blocked_issue(core: str) -> int | None:
    """The open blocked-advance issue that already reports this Core revision."""
    repository = publishing_repository()
    marker = BLOCKED_MARKER.format(revision=core)
    pages = gh_api(f"repos/{repository}/issues?state=open&per_page=100", paginate=True)
    for issue in (item for page in pages for item in page):
        if "pull_request" in issue or issue.get("title") != BLOCKED_ISSUE_TITLE:
            continue
        comments = gh_api(
            f"repos/{repository}/issues/{issue['number']}/comments?per_page=100",
            paginate=True,
        )
        texts = [issue.get("body") or ""] + [
            comment.get("body") or "" for page in comments for comment in page
        ]
        if any(marker in text for text in texts):
            return issue["number"]
    return None


def report_blocked(core: str, reason: str) -> None:
    """Open the one blocked-advance issue, or add this Core revision to it once."""
    repository = publishing_repository()
    marker = BLOCKED_MARKER.format(revision=core)
    body = (
        f"{marker} ({core_repository()}) was not advanced to the private test "
        f"channel.\n\n{reason}\n\nCore Advance does not test this revision again "
        "while this issue is open. Fix the cause (usually a Pro pull request), then "
        "close the issue or dispatch Core Advance with `retest`."
    )
    if blocked_issue(core) is not None:
        return
    pages = gh_api(f"repos/{repository}/issues?state=open&per_page=100", paginate=True)
    existing = [
        issue["number"]
        for page in pages
        for issue in page
        if "pull_request" not in issue and issue.get("title") == BLOCKED_ISSUE_TITLE
    ]
    if existing:
        gh_api(f"repos/{repository}/issues/{existing[0]}/comments", payload={"body": body})
    else:
        gh_api(
            f"repos/{repository}/issues",
            payload={"title": BLOCKED_ISSUE_TITLE, "body": body},
        )


def latest_publication(core: str) -> dict | None:
    """The newest publisher run that Core Advance dispatched for this Core revision."""
    repository = publishing_repository()
    listed = gh_api(
        f"repos/{repository}/actions/workflows/release-publish.yml/runs"
        "?event=workflow_dispatch&branch=main&per_page=20"
    )
    name = PUBLISHER_CHECK_JOB.format(revision=core)
    for item in sorted(listed.get("workflow_runs", []), key=lambda run_: -run_["id"]):
        if any(job.get("name") == name for job in run_jobs(str(item["id"]))):
            return item
    return None


def plan_core_advance(*, retest: bool) -> str | None:
    """The Core main revision to test now, or None when there is nothing to do.

    A Core revision whose Pro tests or publication failed is reported once in an
    issue and not tested again until that issue is closed or `retest` is set, so
    a persistent failure neither disappears nor costs a test run every schedule.
    """
    if core_repository() is None:
        raise ChannelError(f"Core Advance needs {CORE_REPOSITORY_ENV}")
    head = core_main()
    selected = selected_core_revision(selected_identity())
    if selected == head:
        print(f"The channel already selects Core main {head}")
        return None
    if selected is not None and not core_contains(selected, head):
        raise ChannelError(
            f"Core main {head} does not descend from the selected Core {selected}; "
            "a history reset of the Core repository needs a manual decision"
        )
    if not retest:
        issue = blocked_issue(head)
        if issue is not None:
            print(
                f"::warning::Core {head} is blocked (issue #{issue}). Close the issue "
                "or dispatch Core Advance with retest to try again"
            )
            return None
        publication = latest_publication(head)
        if publication is not None:
            if publication.get("status") != "completed":
                print(f"The publisher is still running for Core {head}")
                return None
            if publication.get("conclusion") != "success":
                report_blocked(
                    head,
                    f"The publisher run for this revision ended with "
                    f"`{publication.get('conclusion')}`: {publication.get('html_url')}",
                )
                raise ChannelError(f"The publisher failed for Core {head}; see the issue")
    return head


def report_core_advance(core: str, tests_result: str, run_id: str) -> None:
    """Dispatch the publisher after green Pro tests; otherwise report and fail."""
    revision(core)
    if not re.fullmatch(r"[1-9][0-9]*", run_id):
        raise ChannelError("Invalid workflow run identity")
    repository = publishing_repository()
    if tests_result != "success":
        report_blocked(
            core,
            f"The Pro tests ended with `{tests_result}`: "
            f"https://github.com/{repository}/actions/runs/{run_id}",
        )
        raise ChannelError(f"The Pro tests did not pass against Core {core}")
    run(
        [
            "gh",
            "workflow",
            "run",
            "release-publish.yml",
            "--repo",
            repository,
            "--ref",
            "main",
            "-f",
            "private_test_channel=true",
            "-f",
            "release_version=0.0.0",
            "-f",
            f"core_revision={core}",
            "-f",
            f"core_advance_run={run_id}",
        ]
    )
    print(f"Pro tests passed against Core {core}; started the publisher")


# The official tree in split mode: the pinned Core checkout with the Pro tree on
# top. The Pro tree owns the plugin distributions and the official uv workspace
# (Core's own workspace files name no plugin). Everything else comes from Core;
# the Pro tree may not replace a Core file with different content.
PRO_OWNED_TREES = ("backend/pro/", "backend/admin/")
PRO_WORKSPACE_FILES = ("backend/pyproject.toml", "backend/uv.lock")
PRO_REQUIRED_FILES = ("backend/pro/pyproject.toml", "backend/admin/pyproject.toml")
# Core files that the official build never reads and that each repository
# keeps for itself (its CI, licence and repository documents).
CORE_SKIPPED_TREES = (".github/",)
REPOSITORY_OWN_FILES = frozenset(
    {
        "AGENTS.md",
        "CLAUDE.md",
        "CONTRIBUTING.md",
        "LICENSE",
        "PROVENANCE.md",
        "README.md",
        ".gitattributes",
        ".gitignore",
        ".gitleaks.toml",
        ".gitleaksignore",
    }
)


def compose_source(core_root: Path, target: Path, core: str) -> int:
    """Copy the tracked Core tree into the Pro checkout; return the copied count."""
    revision(core)
    if run(["git", "-C", str(core_root), "rev-parse", "HEAD"]).strip() != core:
        raise ChannelError("The Core checkout is not the pinned Core revision")
    tracked = [
        path
        for path in run(["git", "-C", str(core_root), "ls-files", "-z"]).split("\0")
        if path
    ]
    copies: list[str] = []
    collisions: list[str] = []
    for path in tracked:
        if path.startswith(CORE_SKIPPED_TREES):
            continue
        if path.startswith(PRO_OWNED_TREES):
            raise ChannelError(f"The Core revision contains Pro-owned code: {path}")
        source_file = core_root / path
        if source_file.is_symlink() or not source_file.is_file():
            raise ChannelError(f"Core paths must be regular files: {path}")
        destination = target / path
        if path in PRO_WORKSPACE_FILES:
            continue
        if destination.exists() or destination.is_symlink():
            if path in REPOSITORY_OWN_FILES or (
                destination.is_file()
                and not destination.is_symlink()
                and destination.read_bytes() == source_file.read_bytes()
            ):
                continue
            collisions.append(path)
            continue
        copies.append(path)
    if collisions:
        shown = ", ".join(sorted(collisions)[:20])
        raise ChannelError(f"The Pro tree must not replace Core files: {shown}")
    for path in (*PRO_WORKSPACE_FILES, *PRO_REQUIRED_FILES):
        if not (target / path).is_file() or (target / path).is_symlink():
            raise ChannelError(f"The Pro tree must provide {path}")
    core_project = tomllib.loads((core_root / "backend/pyproject.toml").read_text())
    pro_project = tomllib.loads((target / "backend/pyproject.toml").read_text())
    if core_project.get("project") != pro_project.get("project"):
        raise ChannelError(
            "backend/pyproject.toml [project] differs between Core and Pro; update the "
            "Pro workspace files for this Core revision"
        )
    for path in copies:
        destination = target / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(core_root / path, destination, follow_symlinks=False)
    return len(copies)


def wait_for_checks(source: str, timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        if latest_main() != source:
            print("Candidate was superseded on main; keeping the current channel")
            return False
        if candidate_ready(source):
            return True
        if time.monotonic() >= deadline:
            raise ChannelError("Timed out waiting for required main workflows")
        time.sleep(15)


def require_full_regression(source: str, *, dispatch: bool) -> None:
    """Refuse a product release unless its revision passed the full regression.

    When the revision is current main and its regression is missing or still
    running, optionally start the Nightly Regression dispatcher so a later
    release attempt can pass without paying for a waiting runner.
    """
    if candidate_ready(source):
        print("Full regression passed for this revision")
        return
    if dispatch and latest_main() == source:
        run(["gh", "workflow", "run", FULL_REGRESSION_DISPATCHER, "--repo", publishing_repository(), "--ref", "main"])
        raise ChannelError(
            "Full regression is missing or unfinished; started Nightly Regression. "
            "Re-run this release after it is green"
        )
    raise ChannelError(
        "Full regression is missing or unfinished for this revision; dispatch the "
        "required workflows on main and re-run this release after they are green"
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def core_source(core: str | None) -> dict[str, str] | None:
    """The Core identity bound into evidence and channel.json in split mode."""
    if core is None:
        return None
    return {"repository": str(core_repository()), "revision": revision(core)}


def evidence_records(
    root: Path, source: str, core: str | None = None
) -> dict[str, dict]:
    index = json.loads((root / "evidence-index.json").read_text())
    if index.get("sourceRevision") != source or index.get("schemaVersion") != 1:
        raise ChannelError("Evidence source identity does not match the candidate")
    # The monorepo evidence names no separate Core; split evidence must name
    # exactly the pinned Core revision this channel was checked for.
    if index.get("coreSource") != core_source(core):
        raise ChannelError("Evidence Core identity does not match the candidate")
    if index.get("android") != {"included": False, "signing": "not-applicable"}:
        raise ChannelError("The server test channel must exclude Android artifacts")
    records = index.get("artifacts", [])
    if sorted(item["id"] for item in records) not in (
        ["backend-runtime", "web-runtime"],
        ["backend-runtime", "media-runtime", "web-runtime"],
    ):
        raise ChannelError(
            "One backend, one Web and at most one restricted media artifact are required"
        )
    result = {}
    for item in records:
        artifact_id = item["id"]
        roles = (
            ["api", "worker", "migrate"]
            if artifact_id == "backend-runtime"
            else ["video-worker"]
            if artifact_id == "media-runtime"
            else ["web"]
        )
        expected_paths = {
            "path": f"{artifact_id}.image.tar",
            "sbom": f"sbom/{artifact_id}.spdx.json",
        }
        if item.get("roles") != roles:
            raise ChannelError("Evidence process roles do not match the channel")
        for field, expected in expected_paths.items():
            if item.get(field) != expected:
                raise ChannelError("Unexpected evidence artifact path")
            digest_key = "sha256" if field == "path" else "sbomSha256"
            if sha256(root / expected) != item.get(digest_key):
                raise ChannelError(f"Evidence digest mismatch: {artifact_id} {field}")
        result[artifact_id] = item
    return result


def archive_config_digest(path: Path, expected_tag: str | None = None) -> str:
    """Hash Docker save's exact config bytes, independent of image-store IDs."""
    try:
        return image_archive_config.archive_config_digest(path, expected_tag)
    except image_archive_config.ArchiveConfigError as exc:
        raise ChannelError(str(exc)) from exc


def package_prefix() -> str:
    """The package name prefix; an unset or empty variable selects the default."""
    value = os.environ.get(PACKAGE_PREFIX_ENV, "").strip()
    if not value:
        return DEFAULT_PACKAGE_PREFIX
    if not PACKAGE_PREFIX_PATTERN.fullmatch(value):
        raise ChannelError(
            f"{PACKAGE_PREFIX_ENV} must be 'eimir' or start with 'eimir-' and use "
            "only lowercase letters, digits and single hyphens"
        )
    return value


def promote_enabled() -> bool:
    """Whether publication advances the Git Sync branch; `false` only stages images."""
    value = os.environ.get(PROMOTE_ENV, "").strip()
    if value in {"", "true"}:
        return True
    if value == "false":
        return False
    raise ChannelError(f"{PROMOTE_ENV} must be empty, 'true' or 'false'")


def package_repository(role: str) -> str:
    owner = publishing_repository().partition("/")[0]
    return f"ghcr.io/{owner}/{package_prefix()}-{role}"


def anonymous_request(
    url: str, headers: dict[str, str] | None = None
) -> tuple[int, bytes]:
    """One unauthenticated GET to GHCR; 5xx and network failures are retried."""
    request = urllib.request.Request(url, headers=headers or {})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310
                return response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            if error.code < 500:
                return error.code, b""
        except (urllib.error.URLError, TimeoutError):
            pass
        if attempt < 2:
            time.sleep(2)
    raise ChannelError("Could not verify package visibility: GHCR was unreachable")


def anonymous_manifest_status(reference: str) -> int:
    """HTTP status of an anonymous manifest fetch by digest; 200 means publicly readable."""
    match = GHCR_REFERENCE.fullmatch(reference)
    if not match:
        raise ChannelError("Unexpected package reference; cannot check its visibility")
    name, digest = match["name"], match["digest"]
    status, body = anonymous_request(
        f"https://ghcr.io/token?service=ghcr.io&scope=repository:{name}:pull"
    )
    if status != 200:
        return status
    try:
        token = json.loads(body).get("token")
    except (ValueError, AttributeError):
        token = None
    if not isinstance(token, str) or not token:
        return 401
    status, _ = anonymous_request(
        f"https://ghcr.io/v2/{name}/manifests/{digest}",
        {"Authorization": f"Bearer {token}", "Accept": GHCR_MANIFEST_ACCEPT},
    )
    return status


def verify_packages_private(images: dict[str, str]) -> None:
    """Refuse to promote images that anyone can pull without credentials.

    The legacy prefix names the old public packages, so a rollback to them is not
    checked. Any other prefix must stay private, and an unclear answer fails closed.
    """
    if package_prefix() == LEGACY_PUBLIC_PACKAGE_PREFIX:
        return
    public: list[str] = []
    for reference in images.values():
        status = anonymous_manifest_status(reference)
        if status == 200:
            public.append(reference.partition("@")[0])
        elif status not in PRIVATE_PACKAGE_STATUSES:
            raise ChannelError(
                f"Cannot confirm that {reference.partition('@')[0]} is private: "
                f"the anonymous check returned HTTP {status}"
            )
    if public:
        raise ChannelError(
            "These packages are publicly readable and must be private before the "
            f"channel can use them: {', '.join(public)}. Set each package to Private "
            "(package settings, Danger Zone, Change package visibility) and re-run "
            "the failed job"
        )


def write_step_summary(images: dict[str, str], state: str) -> None:
    """List the pinned references for the operator; nothing secret is included."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    lines = [
        "### Private test channel images",
        "",
        state,
        "",
        *(f"- `{reference}`" for reference in images.values()),
        "",
    ]
    with open(path, "a", encoding="utf-8") as stream:
        stream.write("\n".join(lines))


def publish_image(
    root: Path, record: dict, source: str, version: str, attempt: str
) -> str:
    artifact_id = record["id"]
    role = artifact_id.removesuffix("-runtime")
    local = f"eimir-{role}:evidence-{source}"
    repository = package_repository(role)
    target = f"{repository}:test-{source}-{attempt}"
    config_digest = archive_config_digest(root / record["path"], local)
    run(["docker", "load", "--input", str(root / record["path"])], timeout=600)
    inspected = json.loads(run(["docker", "image", "inspect", local]))[0]
    labels = inspected["Config"]["Labels"]
    if (
        labels.get("org.opencontainers.image.revision") != source
        or labels.get("org.opencontainers.image.version") != version
        or labels.get("org.opencontainers.image.source")
        != f"https://github.com/{publishing_repository()}"
        or inspected.get("Os") != "linux"
        or inspected.get("Architecture") != "amd64"
    ):
        raise ChannelError(
            "Runtime image source/version/platform labels do not match evidence"
        )
    run(["docker", "tag", local, target])
    # Containerd archives can retain a provenance index. Deploy only the runtime
    # platform; the original archives and GitHub attestations remain unchanged.
    pushed = run(["docker", "push", "--platform", "linux/amd64", target], timeout=600)
    digests = re.findall(r"digest: (sha256:[0-9a-f]{64})", pushed)
    if len(set(digests)) != 1:
        raise ChannelError("Registry push did not report one unambiguous image digest")
    pinned = f"{repository}@{digests[0]}"
    manifest = json.loads(run(["docker", "manifest", "inspect", pinned]))
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 2
        or manifest.get("mediaType")
        not in {
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        }
        or "manifests" in manifest
        or not isinstance(manifest.get("layers"), list)
        or not isinstance(manifest.get("config"), dict)
        or manifest.get("config", {}).get("digest") != config_digest
    ):
        raise ChannelError(
            "Registry digest is not the exact built single-image manifest"
        )
    run(["docker", "pull", pinned], timeout=600)
    with tempfile.TemporaryDirectory(prefix="eimir-channel-pullback-") as temporary:
        pulled_archive = Path(temporary) / "image.tar"
        run(
            ["docker", "image", "save", "--output", str(pulled_archive), pinned],
            timeout=600,
        )
        if archive_config_digest(pulled_archive) != config_digest:
            raise ChannelError("Registry pull-back differs from the evidence image")
    return pinned


def required(name: str) -> str:
    return "${" + name + ":?Set the existing instance value in Arcane}"


def canonical_compose(*, fcm: bool = False, video: bool = False) -> dict:
    # Never resolve an operator .env or the caller's deployment settings. Required
    # local expressions are introduced after this source-default-only step.
    environment = {
        key: os.environ[key]
        for key in ("PATH", "HOME", "DOCKER_CONFIG")
        if key in os.environ
    }
    files = ["--file", str(ROOT / "compose.yaml")]
    if fcm:
        files.extend(["--file", str(ROOT / "deploy/push-fcm.compose.yaml")])
        # Only non-secret source metadata. Docker config never opens this file.
        environment.update(
            EIMIR_PUSH_FCM_PROJECT_ID="eimir-render-only",
            EIMIR_PUSH_FCM_ANDROID_PACKAGE="de.eimir.app",
            EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE=_FCM_SOURCE_PLACEHOLDER,
        )
    return json.loads(
        run(
            [
                "docker",
                "compose",
                *files,
                "--env-file",
                os.devnull,
                "--profile",
                "cloud",
                *(["--profile", "cloud-video"] if video else []),
                "config",
                "--format",
                "json",
            ],
            environment=environment,
        )
    )


@lru_cache(maxsize=1)
def fcm_sender_mount() -> dict:
    """Compile the same opt-in file mount used by canonical operators."""
    enabled = canonical_compose(fcm=True)
    expected = {
        "type": "bind",
        "source": _FCM_SOURCE_PLACEHOLDER,
        "target": FCM_CREDENTIAL_TARGET,
        "read_only": True,
        "bind": {"create_host_path": False},
    }
    for name in ("cloud-api", "cloud-worker"):
        mounts = [
            copy.deepcopy(mount)
            for mount in enabled["services"][name].get("volumes", [])
            if mount.get("target") == FCM_CREDENTIAL_TARGET
        ]
        for mount in mounts:
            # Compose 2.38 omits the false bool when serializing bind options.
            # Its empty long-syntax bind still disables host-path creation;
            # keep that safety property explicit in the exported source.
            if mount.get("bind") == {}:
                mount["bind"] = {"create_host_path": False}
        if mounts != [expected]:
            raise ChannelError(
                "Canonical FCM credential mount changed; review the exporter"
            )
    mount = copy.deepcopy(expected)
    mount["source"] = required("EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE")
    return mount


def export_compose(
    canonical: dict, backend: str, web: str, media: str | None = None
) -> dict:
    services = copy.deepcopy(canonical["services"])
    expected_services = set(CLOUD_SERVICES) | (
        {"cloud-video-worker"} if media else set()
    )
    if set(services) != expected_services:
        raise ChannelError(
            "Canonical Cloud process set changed; review the instance exporter"
        )
    # Every instance-specific name derives from one validated instance name, so
    # a rehearsal instance can never attach to the eimir-test database or stores.
    instance_name = instance()
    database = (
        "postgresql+psycopg://sidebyside:"
        + required("POSTGRES_PASSWORD")
        + f"@{instance_name}-postgres:5432/sidebyside"
    )
    settings = {
        "EIMIR_DATABASE_URL": database,
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_DEPLOYMENT": "cloud",
        "EIMIR_PUBLIC_BASE_URL": required("EIMIR_PUBLIC_BASE_URL"),
        "EIMIR_ALLOWED_HOSTS": required("EIMIR_ALLOWED_HOSTS"),
        "EIMIR_DEMO_MODE": "false",
        "EIMIR_DEMO_MODE_RESET_TIMER": "false",
        "EIMIR_ENCRYPTION_AT_REST": "required",
        "EIMIR_MEDIA_STORE": "local",
        "EIMIR_VIDEO_UPLOAD_ENABLED": "true" if media else "false",
        # Keep audio an instance opt-in, available only with the verified processor.
        "EIMIR_AUDIO_UPLOAD_ENABLED": (
            "${EIMIR_AUDIO_UPLOAD_ENABLED:-false}" if media else "false"
        ),
        "EIMIR_MAIL_TRANSPORT": "smtp",
        "EIMIR_SMTP_PORT": "587",
        "EIMIR_SMTP_STARTTLS": "true",
        "EIMIR_SMTP_USERNAME": required("EIMIR_MAIL_FROM"),
        "EIMIR_OIDC_CONNECTIONS": "[]",
        # Optional personal-source configuration is supplied by the instance,
        # never frozen to source defaults or the publishing runner's values.
        "EIMIR_RECAP_AI_URL": "${EIMIR_RECAP_AI_URL:-}",
        "EIMIR_RECAP_AI_MODEL": "${EIMIR_RECAP_AI_MODEL:-qwen3:1.7b-q4_K_M}",
        "EIMIR_RECAP_AI_TIMEOUT_SECONDS": "${EIMIR_RECAP_AI_TIMEOUT_SECONDS:-90}",
        "EIMIR_PHOTO_SOURCES_ENABLED": "${EIMIR_PHOTO_SOURCES_ENABLED:-true}",
        "EIMIR_GOOGLE_PHOTOS_CLIENT_ID": "${EIMIR_GOOGLE_PHOTOS_CLIENT_ID:-}",
        "EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET": "${EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET:-}",
        # Private-test eligibility (#1467): the instance supplies the verified addresses; the
        # published channel never freezes the source default into the generated Compose.
        "EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS": (
            "${EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS:-[]}"
        ),
        # Calendar sync (#1895): the instance supplies its Google OAuth client.
        # Private CalDAV hosts are a Self-Hosted option and stay off on Cloud.
        # In-app support reports (#2189): an instance opt-in, off until a reader exists.
        "EIMIR_SUPPORT_REPORTS_ENABLED": "${EIMIR_SUPPORT_REPORTS_ENABLED:-false}",
        # Operator plugin (#2189, #2266): the instance names `admin` and supplies the
        # optional tracker values; the published channel never freezes them.
        "EIMIR_PLUGINS": "${EIMIR_PLUGINS:-pro}",
        "EIMIR_ADMIN_TRACKER": "${EIMIR_ADMIN_TRACKER:-}",
        "EIMIR_ADMIN_GITHUB_REPOSITORY": "${EIMIR_ADMIN_GITHUB_REPOSITORY:-}",
        "EIMIR_ADMIN_GITHUB_TOKEN": "${EIMIR_ADMIN_GITHUB_TOKEN:-}",
        "EIMIR_CALENDAR_SYNC_ENABLED": "${EIMIR_CALENDAR_SYNC_ENABLED:-true}",
        "EIMIR_GOOGLE_CALENDAR_CLIENT_ID": "${EIMIR_GOOGLE_CALENDAR_CLIENT_ID:-}",
        "EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET": "${EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET:-}",
        # The selected private target uses FCM only (PO 2026-11-01).
        "EIMIR_PUSH_VAPID_PRIVATE_KEY": "",
        "EIMIR_PUSH_VAPID_SUBJECT": "",
        "EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS": "[]",
        "EIMIR_PUSH_FCM_CREDENTIALS_FILE": FCM_CREDENTIAL_TARGET,
    }
    for name in (
        "EIMIR_CURSOR_SIGNING_KEY",
        "EIMIR_ENCRYPTION_KEYS",
        "EIMIR_ENCRYPTION_ACTIVE_KEY_ID",
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
        "EIMIR_SERVER_ADMIN_EMAILS",
        "EIMIR_WEBAUTHN_RP_ID",
        "EIMIR_WEBAUTHN_ORIGINS",
        "EIMIR_MAIL_FROM",
        "EIMIR_SMTP_HOST",
        "EIMIR_SMTP_PASSWORD",
        "EIMIR_PUSH_FCM_PROJECT_ID",
        "EIMIR_PUSH_FCM_ANDROID_PACKAGE",
    ):
        settings[name] = required(name)
    for name, service in services.items():
        service.pop("profiles", None)
        service["image"] = (
            web
            if name == "cloud-web"
            else media
            if name == "cloud-video-worker"
            else backend
        )
        service["pull_policy"] = "always"
        if "build" in service or service.get("ports"):
            raise ChannelError(
                "Cloud processes must remain image-only with no host ports"
            )
        if name in ("cloud-api", "cloud-worker"):
            service["environment"].update(settings)
            if any(
                mount.get("target") == FCM_CREDENTIAL_TARGET
                for mount in service.get("volumes", [])
            ):
                raise ChannelError(
                    "Source-default Compose must not mount an FCM credential"
                )
            service.setdefault("volumes", []).append(copy.deepcopy(fcm_sender_mount()))
        elif name == "cloud-migrate":
            service["environment"] = {
                "EIMIR_DATABASE_URL": database,
                "EIMIR_PLUGINS": "${EIMIR_PLUGINS:-pro}",
            }
        elif name == "cloud-video-worker":
            # This role needs DB/media keys, never mail, FCM or photo-provider credentials.
            needed = {
                "EIMIR_DATABASE_URL",
                "EIMIR_ENVIRONMENT",
                "EIMIR_DEPLOYMENT",
                "EIMIR_PUBLIC_BASE_URL",
                "EIMIR_ALLOWED_HOSTS",
                "EIMIR_CURSOR_SIGNING_KEY",
                "EIMIR_ENCRYPTION_AT_REST",
                "EIMIR_ENCRYPTION_KEYS",
                "EIMIR_ENCRYPTION_ACTIVE_KEY_ID",
                "EIMIR_MEDIA_STORE",
                "EIMIR_MEDIA_ROOT",
                "EIMIR_VIDEO_UPLOAD_ENABLED",
                "EIMIR_AUDIO_UPLOAD_ENABLED",
            }
            service["environment"] = {
                key: value
                for key, value in (service["environment"] | settings).items()
                if key in needed
            } | {"EIMIR_MAIL_TRANSPORT": "none"}
    services["cloud-api"]["environment"]["FORWARDED_ALLOW_IPS"] = required(
        "TRUSTED_PROXY_IPS"
    )
    services["cloud-api"]["networks"] = {
        "app": {"aliases": ["api"]},
        "proxy": {"aliases": [f"{instance_name}-api"]},
    }
    services["cloud-web"]["networks"] = {
        "app": {},
        "proxy": {"aliases": [f"{instance_name}-web"]},
    }
    result = {
        "name": instance_name,
        "services": services,
        "networks": {
            "app": {"external": True, "name": f"{instance_name}-data"},
            "proxy": {"external": True, "name": "mailcow-proxy"},
        },
        "volumes": {
            store: {"external": True, "name": f"{instance_name}_{store}"}
            for store in ("cloud_media_data", "cloud_deletion_journal_data")
        },
    }
    # Reuse the authoritative Cloud image-role/digest validator.
    release_manifest.cloud_images_from_compose(
        result
        | {
            "services": {
                name: service
                for name, service in services.items()
                if name in CLOUD_SERVICES
            }
        }
    )
    if media:
        release_manifest.require_digest_image_reference(
            media, label="cloud-video-worker"
        )
    return result


def source_admitted(
    source: str, *, full_regression: bool, core: str | None = None
) -> bool:
    """The fast lane needs the current main commit; otherwise its full regression too.

    With a pinned Core the full regression belongs to the Core repository: Core
    Advance admitted the pair, so only the current Pro main is rechecked here.
    """
    if core is not None:
        return latest_main() == source
    return latest_main() == source and (not full_regression or candidate_ready(source))


def advance_channel(
    files: dict[str, str],
    source: str,
    *,
    full_regression: bool = True,
    core: str | None = None,
) -> bool:
    if set(files) != {"compose.yaml", "channel.json", "README.md"}:
        raise ChannelError("Only generated deployment files may enter the channel")
    if not source_admitted(source, full_regression=full_regression, core=core):
        raise ChannelError(
            "Candidate is stale or required main checks are no longer successful"
        )
    parent = None
    try:
        parent = gh_api(f"repos/{publishing_repository()}/git/ref/heads/{channel_branch()}")["object"][
            "sha"
        ]
    except GitHubError as error:
        if not error.missing:
            raise
    if parent:
        current = gh_api(f"repos/{publishing_repository()}/contents/channel.json?ref={parent}")
        identity = json.loads(base64.b64decode(current["content"], validate=False))
        if identity.get("kind") != CHANNEL_KIND or identity.get("schemaVersion") != 1:
            raise ChannelError(
                "Existing deployment branch is not an owned test channel"
            )
        selected_core = selected_core_revision(identity) if core else None
        if identity.get("sourceRevision") == source and selected_core == core:
            print(
                "This source revision is already selected; preserving its exact image pair"
            )
            return False
        # A concurrent publication may have selected a newer Core meanwhile; the
        # pin never moves backwards or sideways.
        if core and selected_core and not core_contains(selected_core, core):
            raise ChannelError(
                f"The channel selects Core {selected_core}, which {core} does not "
                "contain; keeping the current channel"
            )
    tree = gh_api(
        f"repos/{publishing_repository()}/git/trees",
        payload={
            "tree": [
                {"path": path, "mode": "100644", "type": "blob", "content": content}
                for path, content in sorted(files.items())
            ]
        },
    )
    commit = gh_api(
        f"repos/{publishing_repository()}/git/commits",
        payload={
            "message": f"deploy(test): select checked source {source}",
            "tree": tree["sha"],
            "parents": [parent] if parent else [],
        },
    )
    if not source_admitted(source, full_regression=full_regression, core=core):
        raise ChannelError(
            "Main advanced during publication; keeping the current channel"
        )
    # GitHub rejects a non-fast-forward update if another writer moved the branch.
    # No force push is used, including on retries.
    if parent:
        gh_api(
            f"repos/{publishing_repository()}/git/refs/heads/{channel_branch()}",
            payload={
                "sha": commit["sha"],
                "force": False,
            },
            method="PATCH",
        )
    else:
        gh_api(
            f"repos/{publishing_repository()}/git/refs",
            payload={
                "ref": f"refs/heads/{channel_branch()}",
                "sha": commit["sha"],
            },
        )
    return True


def publish(
    source: str,
    artifact_root: Path,
    output: Path,
    *,
    full_regression: bool = True,
    core: str | None = None,
) -> None:
    # Validate every setting before any image is pushed.
    package_prefix()
    promote = promote_enabled()
    instance()
    if (core is None) != (core_repository() is None):
        raise ChannelError(
            f"A Core revision is required exactly when {CORE_REPOSITORY_ENV} is set"
        )
    if not source_admitted(source, full_regression=full_regression, core=core):
        raise ChannelError("Only the current, checked main commit may be published")
    run_id, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
    if not all(re.fullmatch(r"[1-9][0-9]*", value) for value in (run_id, attempt)):
        raise ChannelError("Invalid workflow run identity")
    records = evidence_records(artifact_root, source, core)
    if "media-runtime" not in records:
        raise ChannelError(
            "Private video delivery requires exact-source restricted-worker evidence"
        )
    images = {
        role: publish_image(
            artifact_root,
            records[f"{role}-runtime"],
            source,
            f"0.0.0-test.{run_id}",
            f"{run_id}-{attempt}",
        )
        for role in ("backend", "web", "media")
    }
    # Before anything is exported or promoted: the images contain Pro code and
    # must not be anonymously readable (see PRIVATE_PACKAGE_STATUSES).
    verify_packages_private(images)
    canonical = canonical_compose(video=True)
    compose = export_compose(
        canonical, images["backend"], images["web"], images["media"]
    )
    identity = {
        "schemaVersion": 1,
        "kind": CHANNEL_KIND,
        "sourceRevision": source,
        "canonicalComposeSha256": sha256(ROOT / "compose.yaml"),
        "evidenceRun": f"https://github.com/{publishing_repository()}/actions/runs/{run_id}",
        "images": images,
        "artifacts": list(records.values()),
    }
    if core is not None:
        identity["coreSource"] = core_source(core)
    core_line = (
        f"Core: `{core}` from `{core_repository()}`.\n" if core is not None else ""
    )
    documentation = core_repository() or DEFAULT_REPOSITORY
    files = {
        "compose.yaml": json.dumps(compose, indent=2, sort_keys=True) + "\n",
        "channel.json": json.dumps(identity, indent=2, sort_keys=True) + "\n",
        "README.md": (
            "# Generated private test deployment\n\n"
            "Prerelease operator channel, not a supported product release.\n"
            f"Source: `{source}`. All three images are pinned by OCI digest.\n"
            f"{core_line}\n"
            f"Use Arcane Git Sync with the existing {instance()} project. Keep its local "
            ".env, database, media, deletion journal and keys. Never run bootstrap "
            "again.\n\n"
            f"Setup and recovery: https://github.com/{documentation}/blob/main/"
            "docs/PRIVATE-TEST-CHANNEL.md\n"
        ),
    }
    output.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (output / name).write_text(content)
    if not promote:
        print(
            f"{PROMOTE_ENV}=false: images pushed and verified; "
            f"{channel_branch()} was not changed"
        )
        write_step_summary(
            images,
            f"Staged only: {PROMOTE_ENV}=false, so `{channel_branch()}` was not changed.",
        )
        return
    advanced = advance_channel(
        files, source, full_regression=full_regression, core=core
    )
    write_step_summary(
        images,
        f"Promoted to `{channel_branch()}`."
        if advanced
        else f"`{channel_branch()}` already selected this source; nothing changed.",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    check = subparsers.add_parser("check")
    check.add_argument("--revision", required=True)
    check.add_argument("--github-output", type=Path, required=True)
    wait = subparsers.add_parser("wait")
    wait.add_argument("--revision", required=True)
    wait.add_argument("--timeout", type=int, default=3600)
    wait.add_argument("--github-output", type=Path, required=True)
    regression = subparsers.add_parser("full-regression")
    regression.add_argument("--revision", required=True)
    regression.add_argument("--dispatch", action="store_true")
    publication = subparsers.add_parser("publish")
    publication.add_argument("--revision", required=True)
    publication.add_argument("--artifact-root", type=Path, required=True)
    publication.add_argument("--output", type=Path, required=True)
    publication.add_argument("--core-revision", default="")
    # Split mode (Decision 0019, runbook D2).
    plan = subparsers.add_parser("advance-plan")
    plan.add_argument("--revision", required=True)
    plan.add_argument("--github-output", type=Path, required=True)
    report = subparsers.add_parser("advance-report")
    report.add_argument("--revision", required=True)
    report.add_argument("--core-revision", required=True)
    report.add_argument("--tests-result", required=True)
    composition = subparsers.add_parser("compose-source")
    composition.add_argument("--core", type=Path, required=True)
    composition.add_argument("--core-revision", required=True)
    composition.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "compose-source":
            # A local file operation on two checkouts; it publishes nothing.
            if core_repository() is None:
                raise ChannelError(f"Composing a Core source needs {CORE_REPOSITORY_ENV}")
            copied = compose_source(args.core, args.target, args.core_revision)
            print(f"Copied {copied} Core files at {args.core_revision} under the Pro tree")
            return 0
        source = revision(args.revision)
        if os.environ.get("GITHUB_REPOSITORY") != publishing_repository():
            raise ChannelError(
                "Test publication is restricted to the owning repository"
            )
        if os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ChannelError("Test publication is restricted to main")
        instance()
        split = core_repository() is not None
        if args.command == "full-regression":
            require_full_regression(source, dispatch=args.dispatch)
        elif args.command == "advance-plan":
            if latest_main() != source:
                print("Pro main moved on; the next Core Advance run tests the new revision")
                core = None
            else:
                core = plan_core_advance(
                    retest=os.environ.get("EIMIR_CORE_ADVANCE_RETEST") == "true"
                )
            with args.github_output.open("a") as stream:
                stream.write(f"needed={str(core is not None).lower()}\n")
                stream.write(f"core_revision={core or ''}\n")
        elif args.command == "advance-report":
            if not split:
                raise ChannelError(f"Core Advance needs {CORE_REPOSITORY_ENV}")
            report_core_advance(
                args.core_revision, args.tests_result, os.environ["GITHUB_RUN_ID"]
            )
        elif args.command in {"check", "wait"}:
            outputs = ""
            if args.command == "check":
                event_name = os.environ.get("GITHUB_EVENT_NAME", "")
                if split:
                    core = check_split_publication(source, event_name)
                    ready = core is not None
                    outputs = f"core_revision={core or ''}\n"
                else:
                    event = (
                        json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
                        if event_name == "workflow_run"
                        else {}
                    )
                    ready = check_for_publication(source, event_name, event)
            else:
                if split:
                    raise ChannelError("Waiting for the full regression needs the monorepo")
                if not 1 <= args.timeout <= 3600:
                    raise ChannelError(
                        "Check timeout must be between 1 and 3600 seconds"
                    )
                ready = wait_for_checks(source, args.timeout)
            with args.github_output.open("a") as stream:
                stream.write(f"ready={str(ready).lower()}\n{outputs}")
        else:
            if args.core_revision and not split:
                raise ChannelError(
                    f"A Core revision needs {CORE_REPOSITORY_ENV}; the monorepo builds its own Core"
                )
            publish(
                source,
                args.artifact_root,
                args.output,
                full_regression=os.environ.get("GITHUB_EVENT_NAME") != FAST_LANE_EVENT,
                core=revision(args.core_revision) if split else None,
            )
    except (
        ChannelError,
        KeyError,
        OSError,
        json.JSONDecodeError,
        subprocess.TimeoutExpired,
        tomllib.TOMLDecodeError,
    ) as error:
        print(f"Test channel refused: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
