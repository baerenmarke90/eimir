#!/usr/bin/env python3
"""Keep pull-request jobs off the nightly runner."""

from __future__ import annotations

import re
import unittest

from test_nightly_regression import WORKFLOWS, dispatched_files, text, trigger_keys

NIGHTLY_GUARD = (
    "github.event_name == 'workflow_dispatch' && "
    "github.repository == 'baerenmarke90/eimir' && "
    "(github.ref == 'refs/heads/main' || github.ref == 'refs/heads/ci/eimir-nightly-self-hosted') && "
    "vars.EIMIR_NIGHTLY_RUNNER != 'github-hosted'"
)
NIGHTLY_LABELS = (
    "fromJSON(format('[\"eimir-kvm-nightly\",\"eimir-run-{0}-{1}\"]', "
    "github.run_id, github.run_attempt))"
)
SECRET_SCAN_PILOT = (
    "github.event_name == 'pull_request' && "
    "github.event.pull_request.head.repo.full_name == github.repository && "
    "vars.EIMIR_PR_RUNNER != 'github-hosted'"
)
PR_BROWSER_JOBS = {"pr-critical", "changed-spec-plan", "changed-specs"}

# (guest, hosted) for scheduled jobs with an explicit pre-existing job limit.
# Other routed jobs use GitHub's existing 360-minute default on both routes.
NIGHTLY_TIMEOUTS = {
    ("ci.yml", "changes"): (15, 15),
    ("ci.yml", "web"): (30, 30),
    ("ci.yml", "backend_integration_shards"): (45, 30),
    ("ci.yml", "backend-integration"): (5, 5),
    ("ci.yml", "backend_core_only_shards"): (53, 30),
    ("ci.yml", "backend-core-only"): (5, 5),
    ("web-browser-qa.yml", "full-regression"): (80, 40),
    ("web-browser-qa.yml", "browser"): (10, 10),
    ("backend-encrypted.yml", "unit"): (20, 20),
    ("backend-encrypted.yml", "integration"): (69, 45),
    ("media-video.yml", "processing"): (20, 20),
    ("media-video.yml", "image"): (25, 25),
    ("media-video.yml", "browser"): (12, 12),
    ("self-hosted-deployment-guard.yml", "changes"): (15, 15),
    ("self-hosted-deployment-guard.yml", "upgrade-rehearsal"): (45, 45),
    ("self-hosted-recovery.yml", "changes"): (15, 15),
    ("self-hosted-recovery.yml", "recovery"): (35, 35),
}


NIGHTLY_ROUTE = f"{NIGHTLY_GUARD} && {NIGHTLY_LABELS}"
PR_PILOT_ROUTE = f"{SECRET_SCAN_PILOT} && 'eimir-kvm-pr'"


def with_hosted_fallback(route: str) -> str:
    return "${{ " + route + " || 'ubuntu-latest' }}"


def job_field(workflow: str, field: str) -> dict[str, str]:
    """Read a direct job field without a YAML dependency."""
    jobs_block = text(WORKFLOWS / workflow).split("\njobs:\n", 1)[1]
    sections = re.split(r"^  ([a-zA-Z0-9_-]+):\s*$", jobs_block, flags=re.MULTILINE)
    values = {}
    for job, definition in zip(sections[1::2], sections[2::2]):
        match = re.search(
            rf"^    {re.escape(field)}: (.+)((?:\n      [^\n]+)*)", definition, re.MULTILINE
        )
        if match is not None:
            value = match[2] if match[1] == ">-" else match[1]
            values[job] = " ".join(value.split())
    return values


def job_runners(workflow: str) -> dict[str, str]:
    runners = job_field(workflow, "runs-on")
    jobs_block = text(WORKFLOWS / workflow).split("\njobs:\n", 1)[1]
    jobs = set(re.findall(r"^  ([a-zA-Z0-9_-]+):\s*$", jobs_block, re.MULTILINE))
    if not jobs or jobs != runners.keys():
        raise AssertionError(f"{workflow}: all jobs must declare their runner directly")
    return runners


class NightlyRunnerRoutingTest(unittest.TestCase):
    def test_pr_jobs_stay_on_github_except_same_repository_secret_scan(self) -> None:
        for workflow in dispatched_files():
            for job, runner in job_runners(workflow).items():
                with self.subTest(workflow=workflow, job=job):
                    if (workflow, job) == ("ci.yml", "secrets"):
                        self.assertEqual(runner, with_hosted_fallback(f"{NIGHTLY_ROUTE} || {PR_PILOT_ROUTE}"))
                    elif workflow == "android-launcher-icons.yml" or (
                        workflow == "web-browser-qa.yml" and job in PR_BROWSER_JOBS
                    ):
                        self.assertEqual(runner, "ubuntu-latest")
                    else:
                        self.assertEqual(runner, with_hosted_fallback(NIGHTLY_ROUTE))

    def test_guest_and_hosted_nightly_timeouts_follow_runner_guard(self) -> None:
        routed_jobs = set()
        for workflow in dispatched_files():
            timeouts = job_field(workflow, "timeout-minutes")
            for job, runner in job_runners(workflow).items():
                if NIGHTLY_ROUTE not in runner:
                    continue
                with self.subTest(workflow=workflow, job=job):
                    routed_jobs.add((workflow, job))
                    guest, hosted = NIGHTLY_TIMEOUTS.get((workflow, job), (360, 360))
                    expected = "${{ " + f"{NIGHTLY_GUARD} && {guest} || {hosted}" + " }}"
                    self.assertEqual(timeouts.get(job), expected)
        self.assertLessEqual(NIGHTLY_TIMEOUTS.keys(), routed_jobs)

    def test_capability_check_is_manual_and_has_run_specific_labels(self) -> None:
        capability = "runner-capability-check.yml"
        self.assertEqual(trigger_keys(WORKFLOWS / capability), {"workflow_dispatch"})
        for job, runner in job_runners(capability).items():
            with self.subTest(job=job):
                self.assertEqual(runner, '[eimir-kvm-nightly, "eimir-run-${{ github.run_id }}-${{ github.run_attempt }}"]')


if __name__ == "__main__":
    unittest.main()
