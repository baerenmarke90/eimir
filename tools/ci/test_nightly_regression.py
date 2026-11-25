#!/usr/bin/env python3
"""Contract checks for the nightly full regression on main (#2096)."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import textwrap
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


FAKE_GH = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_GH_LOG"
case "$1" in
  api)
    case "$2" in
      */commits/main | */nightly-regression.yml/runs*) echo "$FAKE_SHA" ;;
      */workflows/codeql.yml/runs*)
        if [ "$FAKE_CODEQL_RUN" = "missing" ]; then echo missing; else echo "completed|success|https://example.invalid/codeql"; fi ;;
      */workflows/*/runs*)
        case " $* " in
          *"| length"*) echo 0 ;;
          *) echo "completed|success|https://example.invalid/run" ;;
        esac ;;
      *) echo "unexpected gh api: $*" >&2; exit 2 ;;
    esac ;;
  workflow) ;;
  issue)
    case "$2" in list) echo "" ;; *) ;; esac ;;
  *) echo "unexpected gh call: $*" >&2; exit 2 ;;
esac
"""


def step_script(path: Path, name: str) -> str:
    block = text(path).split(f"- name: {name}\n", 1)[1].split("run: |\n", 1)[1]
    lines = []
    for line in block.splitlines():
        if line.strip() and not line.startswith(" " * 10):
            break
        lines.append(line)
    return textwrap.dedent("\n".join(lines)) + "\n"


class CodeScanningStateTest(unittest.TestCase):
    """Decision 0019, D5: CodeQL leaves the nightly set only where it is recorded unavailable."""

    STEPS = {
        DISPATCHER: "Dispatch workflows whose main revision is untested",
        REPORT: "Evaluate the newest dispatched main revision",
    }

    def test_both_workflows_probe_the_repository_before_their_list(self) -> None:
        for path, step in self.STEPS.items():
            with self.subTest(workflow=path.name):
                body = text(path)
                probe = body.split("- name: Read the code-scanning state of this repository\n", 1)[1]
                probe = probe.split("\n      - name:", 1)[0]
                self.assertIn("id: supply_chain", probe)
                self.assertIn("python3 scripts/supply_chain_state.py assess", probe)
                self.assertIn("EIMIR_SUPPLY_CHAIN_EXCEPTION: ${{ vars.EIMIR_SUPPLY_CHAIN_EXCEPTION }}", probe)
                self.assertLess(body.index("actions/checkout@"), body.index("Read the code-scanning state"))
                self.assertLess(body.index("Read the code-scanning state"), body.index(f"- name: {step}"))
                self.assertIn("CODE_SCANNING: ${{ steps.supply_chain.outputs.code_scanning }}", body)
                self.assertIn("persist-credentials: false", body)
        report_job = text(REPORT).split("\n  report:\n", 1)[1]
        self.assertIn("      contents: read\n", report_job)

    def run_step(self, path: Path, state: str, **environment: str) -> tuple[subprocess.CompletedProcess, str, str]:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, True)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        gh = bin_dir / "gh"
        gh.write_text(FAKE_GH, encoding="utf-8", newline="\n")
        gh.chmod(0o755)
        log = root / "gh.log"
        log.touch()
        summary = root / "summary.md"
        system_path = os.environ.get("PATH", "") if os.name == "nt" else "/usr/bin:/bin"
        env = {
            **({"SYSTEMROOT": os.environ["SYSTEMROOT"]} if "SYSTEMROOT" in os.environ else {}),
            "PATH": os.pathsep.join([str(bin_dir), system_path]),
            "GITHUB_REPOSITORY": "baerenmarke90/eimir-pro",
            "GITHUB_STEP_SUMMARY": summary.as_posix(),
            "FAKE_GH_LOG": log.as_posix(),
            "FAKE_SHA": "d" * 40,
            "FAKE_CODEQL_RUN": "present",
            "CODE_SCANNING": state,
            "FORCE": "false",
            "TEST_CHANNEL_ENABLED": "true",
            **environment,
        }
        result = subprocess.run(
            # shutil.which skips the WSL launcher that Windows would start for "bash".
            [shutil.which("bash") or "bash", "-c", step_script(path, self.STEPS[path])],
            cwd=root, env=env, capture_output=True, text=True, check=False,
        )
        return result, log.read_text(encoding="utf-8"), summary.read_text(encoding="utf-8") if summary.exists() else ""

    def test_dispatcher_runs_codeql_only_where_code_scanning_is_available(self) -> None:
        result, calls, _ = self.run_step(DISPATCHER, "available")
        self.assertEqual(result.returncode, 0, result.stderr)
        dispatched = re.findall(r"^workflow run (\S+)", calls, re.MULTILINE)
        self.assertEqual(dispatched, dispatched_files())

        result, calls, summary = self.run_step(DISPATCHER, "unavailable")
        self.assertEqual(result.returncode, 0, result.stderr)
        dispatched = re.findall(r"^workflow run (\S+)", calls, re.MULTILINE)
        self.assertEqual(dispatched, [name for name in dispatched_files() if name != "codeql.yml"])
        self.assertIn("codeql.yml: not dispatched, code scanning is unavailable on baerenmarke90/eimir-pro", summary)

    def test_report_requires_codeql_only_where_code_scanning_is_available(self) -> None:
        result, calls, summary = self.run_step(REPORT, "available", FAKE_CODEQL_RUN="missing")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("issue create", calls)
        self.assertNotIn("release-publish.yml", calls)

        result, calls, summary = self.run_step(REPORT, "unavailable", FAKE_CODEQL_RUN="missing")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("issue create", calls)
        self.assertIn("workflow run release-publish.yml", calls)
        self.assertIn("codeql.yml: not required, code scanning is unavailable", summary)

    def test_report_keeps_other_failures_in_the_unavailable_state(self) -> None:
        result, calls, _ = self.run_step(REPORT, "unavailable", FAKE_CODEQL_RUN="missing")
        self.assertEqual(result.returncode, 0, result.stderr)
        # Every other workflow is still queried; none is skipped with CodeQL.
        queried = set(re.findall(r"workflows/([a-z0-9-]+\.yml)/runs\?event=", calls))
        self.assertEqual(queried, set(dispatched_files()) - {"codeql.yml"})

    def test_report_leaves_a_pinned_core_channel_to_core_advance(self) -> None:
        # Decision 0019, D2: with a pinned Core repository the full regression
        # does not start the publisher; Core Advance does.
        result, calls, summary = self.run_step(
            REPORT, "unavailable", FAKE_CODEQL_RUN="missing", CORE_REPOSITORY="baerenmarke90/eimir-core"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("release-publish.yml", calls)
        self.assertIn("Core Advance publishes the private test channel", summary)

    def test_unknown_state_stops_before_any_dispatch_or_report(self) -> None:
        for path in self.STEPS:
            for state in ("", "maybe"):
                with self.subTest(workflow=path.name, state=state):
                    result, calls, _ = self.run_step(path, state)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("Unknown code-scanning state", result.stderr)
                    self.assertEqual(calls, "")


if __name__ == "__main__":
    unittest.main()
