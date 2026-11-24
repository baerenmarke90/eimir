#!/usr/bin/env python3
"""Contract checks for the nightly codec advisory review issue."""

from __future__ import annotations

import contextlib
import io
import json
import re
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/codec-advisories.yml"
MEDIA = ROOT / "tools/media"
checker = runpy.run_path(str(MEDIA / "check-advisories.py"))
reporter = runpy.run_path(str(MEDIA / "report-advisories.py"))
SHA_PIN = re.compile(r"uses: [\w./-]+@[0-9a-f]{40} # v\d")


def workflow() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


def job(name: str) -> str:
    text = workflow()
    start = text.index(f"\n  {name}:\n") + 1
    header = len(name) + 4
    following = re.search(r"^  [a-z]+:\n", text[start + header :], re.MULTILINE)
    return text[start : start + header + following.start()] if following else text[start:]


def advisory(description: str, status: str = "open") -> dict:
    return {"description": description, "releases": {"sid": {"status": status}}}


class WorkflowContract(unittest.TestCase):
    def test_gate_is_unchanged_and_still_fails_the_run(self) -> None:
        text = workflow()
        self.assertIn("- run: python3 tools/media/check-advisories.py\n", text)
        self.assertNotIn("continue-on-error", text)
        self.assertNotIn("--feed-file", text)

    def test_triggers_are_schedule_and_manual_dry_run_only(self) -> None:
        block = re.search(r"^on:\n(.*?)^\S", workflow(), re.MULTILINE | re.DOTALL).group(1)
        self.assertEqual(
            set(re.findall(r"^  ([a-z_]+):", block, re.MULTILINE)),
            {"schedule", "workflow_dispatch"},
        )
        self.assertRegex(block, r"dry_run:\n(?:.*\n)*?\s+default: true")

    def test_only_the_issue_job_can_write_and_it_runs_no_repository_code(self) -> None:
        text = workflow()
        self.assertEqual(text.count("issues: write"), 1)
        self.assertIn("permissions:\n  contents: read\n", text)
        self.assertNotIn("issues: write", job("review"))
        issue = job("issue")
        self.assertIn("issues: write", issue)
        self.assertNotIn("actions/checkout", issue)
        self.assertNotIn("python3", issue)
        self.assertNotIn("secrets.", text)

    def test_every_action_is_sha_pinned_and_already_used_elsewhere(self) -> None:
        others = "".join(
            path.read_text(encoding="utf-8")
            for path in WORKFLOW.parent.glob("*.yml")
            if path != WORKFLOW
        )
        uses = re.findall(r"uses: (\S+@[0-9a-f]{40}) # v", workflow())
        self.assertEqual(len(uses), len(re.findall(r"uses:", workflow())))
        for pin in uses:
            self.assertIn(pin, others)

    def test_one_issue_is_kept_idempotently_and_dry_run_never_writes(self) -> None:
        issue = job("issue")
        self.assertIn('title="FFmpeg advisory review needed"', issue)
        self.assertIn('label="security-advisory-review"', issue)
        self.assertIn("gh issue list --state open --label", issue)
        self.assertIn("advisory-fingerprint", issue)
        self.assertIn("act issue create", issue)
        self.assertIn("act issue close", issue)
        self.assertIn("act issue edit", issue)
        # Every mutation outside the dry-run wrapper is the label creation guarded by it.
        mutations = re.findall(r"\bgh (issue (?:create|edit|comment|close)|label create)\b", issue)
        self.assertEqual(mutations, ["label create"])
        self.assertIn('if [ "$DRY_RUN" = "true" ]', issue)

    def test_concurrency_and_timeouts_bound_the_cost(self) -> None:
        text = workflow()
        self.assertIn("group: codec-advisories\n  cancel-in-progress: false", text)
        self.assertEqual(len(re.findall(r"timeout-minutes: 5\n", text)), 2)


class Reporter(unittest.TestCase):
    baseline = json.loads((MEDIA / "advisory-review.json").read_text(encoding="utf-8"))

    def feed(self) -> dict:
        reviewed = next(iter(self.baseline["findings"]))
        return {
            "ffmpeg": {
                "CVE-9999-0001": advisory(
                    "Overflow in libavcodec/h264dec.c on `crafted` input ``` @octocat"
                ),
                reviewed: advisory("Description changed after the review."),
                "CVE-9999-0002": advisory("Overflow in libavcodec/vvc/refs.c only."),
            }
        }

    def run_both(self, feed: dict) -> tuple[set[str], dict, str]:
        with tempfile.TemporaryDirectory() as workspace:
            work = Path(workspace)
            (work / "feed.json").write_text(json.dumps(feed), encoding="utf-8")
            (work / "source").mkdir()
            arguments = [
                "--feed-file",
                str(work / "feed.json"),
                "--source-dir",
                str(work / "source"),
            ]
            output = io.StringIO()
            with (
                mock.patch.object(sys, "argv", ["check-advisories.py", *arguments]),
                contextlib.redirect_stdout(output),
            ):
                code = checker["main"]()
            self.assertEqual(code, 1)
            gate = {line for line in output.getvalue().splitlines() if re.match(r"\w+: ", line)}
            out = work / "out"
            with (
                mock.patch.object(
                    sys, "argv", ["report-advisories.py", *arguments, "--output-dir", str(out)]
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(reporter["main"](), 0)
            status = (out / "status").read_text(encoding="utf-8").strip()
            records = reporter["collect"](
                feed,
                set((MEDIA / "built-sources.txt").read_text(encoding="utf-8").split()),
                set(),
                self.baseline,
            )
            return (
                gate,
                {"status": status, "records": records},
                (out / "issue-body.md").read_text(encoding="utf-8"),
            )

    def test_reporter_lists_exactly_what_the_gate_rejects(self) -> None:
        gate, report, body = self.run_both(self.feed())
        self.assertEqual(report["status"], "findings")
        self.assertEqual({f"{item['package']}: {item['id']}" for item in report["records"]}, gate)
        self.assertNotIn("CVE-9999-0002", body)

    def test_issue_body_carries_the_description_digest_and_instructions(self) -> None:
        feed = self.feed()
        _, _, body = self.run_both(feed)
        digest = checker["findings"](feed)["CVE-9999-0001"]
        self.assertIn(f'"evidenceSha256": "{digest}"', body)
        self.assertIn("(ffmpeg, new)", body)
        self.assertIn("(ffmpeg, changed)", body)
        self.assertIn("#2260", body)
        self.assertIn("#2269", body)
        for word in ("reachable", "not reachable", "mitigated"):
            self.assertIn(word, body)
        self.assertRegex(body, r"<!-- advisory-fingerprint: [0-9a-f]{64} -->")
        # Feed text is fenced with a longer fence than any backtick run it contains.
        self.assertIn("````text\nOverflow in libavcodec/h264dec.c", body)

    def test_fingerprint_is_stable_and_changes_with_the_findings(self) -> None:
        feed = self.feed()
        first = self.run_both(feed)[2]
        second = self.run_both(feed)[2]
        self.assertEqual(first, second)
        feed["ffmpeg"]["CVE-9999-0001"] = advisory(
            "A different description in libavcodec/h264dec.c."
        )
        self.assertNotEqual(first, self.run_both(feed)[2])

    def test_missing_feed_data_is_an_error_not_an_issue(self) -> None:
        with tempfile.TemporaryDirectory() as workspace:
            feed = Path(workspace) / "feed.json"
            feed.write_text("{}", encoding="utf-8")
            argv = ["report-advisories.py", "--feed-file", str(feed), "--output-dir", workspace]
            with mock.patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(reporter["main"](), 0)
            self.assertEqual(
                (Path(workspace) / "status").read_text(encoding="utf-8").strip(), "error"
            )


if __name__ == "__main__":
    unittest.main()
