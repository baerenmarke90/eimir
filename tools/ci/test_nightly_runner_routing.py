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


NIGHTLY_ROUTE = f"{NIGHTLY_GUARD} && {NIGHTLY_LABELS}"
PR_PILOT_ROUTE = f"{SECRET_SCAN_PILOT} && 'eimir-kvm-pr'"


def with_hosted_fallback(route: str) -> str:
    return "${{ " + route + " || 'ubuntu-latest' }}"


def job_runners(workflow: str) -> dict[str, str]:
    """Read the direct runs-on field of each job without a YAML dependency."""
    jobs_block = text(WORKFLOWS / workflow).split("\njobs:\n", 1)[1]
    sections = re.split(r"^  ([a-zA-Z0-9_-]+):\s*$", jobs_block, flags=re.MULTILINE)
    runners = {}
    for job, definition in zip(sections[1::2], sections[2::2]):
        match = re.search(r"^    runs-on: (.+)((?:\n      [^\n]+)*)", definition, re.MULTILINE)
        if match is None:
            raise AssertionError(f"{workflow}: {job} must declare its runner directly")
        value = match[2] if match[1] == ">-" else match[1]
        runners[job] = " ".join(value.split())
    if not runners:
        raise AssertionError(f"{workflow}: expected at least one job")
    return runners


class NightlyRunnerRoutingTest(unittest.TestCase):
    def test_pr_jobs_stay_on_github_except_same_repository_secret_scan(self) -> None:
        for workflow in dispatched_files():
            for job, runner in job_runners(workflow).items():
                with self.subTest(workflow=workflow, job=job):
                    if (workflow, job) == ("ci.yml", "secrets"):
                        self.assertEqual(runner, with_hosted_fallback(f"{NIGHTLY_ROUTE} || {PR_PILOT_ROUTE}"))
                    elif (
                        workflow == "android-launcher-icons.yml"
                        or (workflow, job) == ("ci.yml", "backend_core_only_shards")
                        or (workflow == "web-browser-qa.yml" and job in PR_BROWSER_JOBS)
                    ):
                        self.assertEqual(runner, "ubuntu-latest")
                    else:
                        self.assertEqual(runner, with_hosted_fallback(NIGHTLY_ROUTE))

    def test_capability_check_is_manual_and_has_run_specific_labels(self) -> None:
        capability = "runner-capability-check.yml"
        self.assertEqual(trigger_keys(WORKFLOWS / capability), {"workflow_dispatch"})
        for job, runner in job_runners(capability).items():
            with self.subTest(job=job):
                self.assertEqual(runner, '[eimir-kvm-nightly, "eimir-run-${{ github.run_id }}-${{ github.run_attempt }}"]')


if __name__ == "__main__":
    unittest.main()
