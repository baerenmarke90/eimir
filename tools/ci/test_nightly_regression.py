#!/usr/bin/env python3
"""Contract checks for the nightly full regression on main (#2096)."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github/workflows"
DISPATCHER = WORKFLOWS / "nightly-regression.yml"
REPORT = WORKFLOWS / "nightly-regression-report.yml"


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def name_of(path: Path) -> str:
    return re.search(r"^name: (.+)$", text(path), re.MULTILINE).group(1).strip()


def triggers(path: Path) -> str:
    """Return the top-level ``on:`` block (the runner image has no PyYAML)."""
    return re.search(r"^on:\n(.*?)^\S", text(path), re.MULTILINE | re.DOTALL).group(1)


def trigger_keys(path: Path) -> set[str]:
    return set(re.findall(r"^  ([a-z_]+):", triggers(path), re.MULTILINE))


def listed_files(path: Path) -> list[str]:
    block = text(path).split("workflows=(", 1)[1].split(")", 1)[0]
    return re.findall(r"^\s+([a-z0-9-]+\.yml)$", block, re.MULTILINE)


def dispatched_files() -> list[str]:
    return listed_files(DISPATCHER)


class NightlyRegressionTest(unittest.TestCase):
    def test_dispatcher_and_report_cover_the_same_workflows(self) -> None:
        files = dispatched_files()
        self.assertGreaterEqual(len(files), 8)
        self.assertEqual(files, listed_files(REPORT))
        for name in files:
            self.assertTrue((WORKFLOWS / name).is_file(), name)

    def test_every_dispatched_workflow_accepts_manual_dispatch(self) -> None:
        for name in dispatched_files():
            with self.subTest(workflow=name):
                self.assertIn("workflow_dispatch", trigger_keys(WORKFLOWS / name))

    def test_dispatched_workflows_have_no_competing_schedule(self) -> None:
        # The dispatcher is the single nightly entry point, so unchanged main
        # revisions are not re-tested by separate cron triggers.
        for name in dispatched_files():
            with self.subTest(workflow=name):
                self.assertNotIn("schedule", trigger_keys(WORKFLOWS / name))

    def test_dispatcher_runs_nightly_and_can_be_started_manually(self) -> None:
        self.assertEqual(trigger_keys(DISPATCHER), {"schedule", "workflow_dispatch"})
        self.assertEqual(len(re.findall(r"- cron:", triggers(DISPATCHER))), 1)

    def test_report_polls_instead_of_waiting_for_workflow_run(self) -> None:
        # Runs dispatched with GITHUB_TOKEN emit no workflow_run events, so the
        # report must poll on a schedule (#2096).
        self.assertEqual(trigger_keys(REPORT), {"schedule", "workflow_dispatch"})
        job = text(REPORT).split("\n  report:\n", 1)[1]
        self.assertIn("    permissions:\n      actions: write\n      issues: write\n", job)
        self.assertIn("event=workflow_dispatch&branch=main&head_sha=", job)
        self.assertIn("-f private_test_channel=true", job)

    def test_report_runs_after_the_dispatcher(self) -> None:
        dispatch = re.findall(r'- cron: "(\d+) (\d+) ', triggers(DISPATCHER))
        reports = re.findall(r'- cron: "(\d+) (\d+) ', triggers(REPORT))
        start = int(dispatch[0][1]) * 60 + int(dispatch[0][0])
        self.assertTrue(reports)
        for minute, hour in reports:
            self.assertGreaterEqual(int(hour) * 60 + int(minute) - start, 60)

if __name__ == "__main__":
    unittest.main()
