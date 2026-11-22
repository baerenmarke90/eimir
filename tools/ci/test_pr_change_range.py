"""Pull-request change detection must compare against the merge base (#2096).

`git diff BASE HEAD` also lists files that changed on the base branch after the
pull request branched off. A pull request that lags behind `main` would then
inherit every recent risk-path change of `main` and run the full CI tier.
"""

from __future__ import annotations

import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKFLOWS = (
    ".github/workflows/ci.yml",
    ".github/workflows/codeql.yml",
)
THREE_DOT = 'git diff --name-only --no-renames "$base_sha...$head_sha"'
TWO_DOT = 'git diff --name-only --no-renames "$base_sha" "$head_sha"'


class PullRequestChangeRangeTest(unittest.TestCase):
    def test_pull_requests_diff_against_the_merge_base(self) -> None:
        for workflow in WORKFLOWS:
            with self.subTest(workflow=workflow):
                text = (ROOT / workflow).read_text(encoding="utf-8")
                pr_branch = text.index('if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then\n            if ! git merge-base')
                three_dot = text.index(THREE_DOT, pr_branch)
                two_dot = text.index(TWO_DOT, three_dot)
                # The merge-base diff belongs to the pull-request branch; the
                # plain range remains only in the following else branch.
                self.assertLess(pr_branch, three_dot)
                self.assertIn("else", text[three_dot:two_dot])
                self.assertEqual(text.count(TWO_DOT), 1)

    def test_self_hosted_checks_share_ci_change_detection(self) -> None:
        ci = (ROOT / WORKFLOWS[0]).read_text(encoding="utf-8")
        for scope, filename in (
            ("deployment_guard", "self-hosted-deployment-guard.yml"),
            ("recovery", "self-hosted-recovery.yml"),
        ):
            with self.subTest(scope=scope):
                path = f".github/workflows/{filename}"
                workflow = (ROOT / path).read_text(encoding="utf-8")
                self.assertNotIn("  pull_request:\n", workflow)
                self.assertIn("  workflow_call:", workflow)
                self.assertNotIn("    name: Change Detection", workflow)
                self.assertIn(f"    uses: ./{path}", ci)
                self.assertIn(f"needs.changes.outputs.{scope} == 'true'", ci)

    def test_merge_base_range_ignores_newer_base_commits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            def git(*args: str) -> str:
                return subprocess.run(
                    ["git", "-C", directory, *args],
                    check=True, capture_output=True, text=True,
                ).stdout.strip()

            git("init", "-q", "-b", "main")
            git("config", "user.email", "ci@example.invalid")
            git("config", "user.name", "CI")
            pathlib.Path(directory, "README.md").write_text("base\n")
            git("add", ".")
            git("commit", "-qm", "base")
            git("switch", "-qc", "feature")
            pathlib.Path(directory, "web.ts").write_text("feature\n")
            git("add", ".")
            git("commit", "-qm", "feature")
            head = git("rev-parse", "HEAD")
            git("switch", "-q", "main")
            pathlib.Path(directory, "ci.yml").write_text("risk\n")
            git("add", ".")
            git("commit", "-qm", "main moved")
            base = git("rev-parse", "HEAD")

            self.assertEqual(git("diff", "--name-only", f"{base}...{head}"), "web.ts")
            self.assertEqual(
                sorted(git("diff", "--name-only", base, head).split()),
                ["ci.yml", "web.ts"],
            )


if __name__ == "__main__":
    unittest.main()
