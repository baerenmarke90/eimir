#!/usr/bin/env python3
"""Tests of the Core allow-list export and its gates (Decision 0019, #2183).

Each test builds a small synthetic git repository, so the tests are fast and
independent of the real tree. The gates are tested in both directions: a
clean export passes, and each planted violation fails loudly.

Run: python3 tools/cutover/test_core_export.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import core_export
from core_export import ExportError

REAL_ALLOWLIST = Path(__file__).resolve().with_name("core-allowlist.toml")

CONFIG = textwrap.dedent(
    """
    schema = 1

    [[include]]
    id = "root"
    reason = "licence"
    patterns = ["LICENSE", "CLA.md", "README.md"]

    [[include]]
    id = "backend"
    reason = "core backend"
    patterns = ["backend/**", "scripts/**"]

    [[include]]
    id = "docs"
    reason = "docs"
    patterns = ["docs/**"]

    [[exclude]]
    id = "pro"
    reason = "pro"
    patterns = ["backend/pro/**"]

    [[exclude]]
    id = "media"
    reason = "media"
    decision = "D3"
    patterns = ["docs/**/*.png"]

    [[forbidden]]
    id = "pro-code"
    reason = "never public"
    patterns = ["backend/pro/**", "**/eimir_pro/**", "**/*.jks"]

    [[transform]]
    path = "backend/pyproject.toml"
    reason = "drop the workspace"
    [[transform.replace]]
    old = 'members = ["pro"]'
    new = "members = []"

    [[transform]]
    path = "docs/PROVENANCE.md"
    reason = "split"
    drop_markdown_sections = ["Pro catalog"]

    [gates]
    plugin_import_roots = ["eimir_pro"]
    openapi_contract = "backend/openapi.json"
    [[gates.required_file]]
    path = "LICENSE"
    contains = ["PolyForm Noncommercial License 1.0.0"]
    [[gates.required_file]]
    path = "CLA.md"
    [[gates.plugin_import_allowance]]
    path = "backend/tests/conftest.py"
    reason = "guarded"
    """
)

FILES = {
    "LICENSE": "# PolyForm Noncommercial License 1.0.0\n",
    "CLA.md": "CLA\n",
    "README.md": "readme\n",
    "secret.txt": "not listed\n",
    "backend/pyproject.toml": '[tool.uv.workspace]\nmembers = ["pro"]\n',
    "backend/openapi.json": '{"paths": {"/a": {"get": {}}}}\n',
    "backend/src/eimir/__init__.py": "import json\n",
    "backend/src/eimir/run.sh": "#!/bin/sh\necho ok\n",
    "backend/tests/conftest.py": "def load():\n    from eimir_pro.plugin import plugin\n    return plugin\n",
    "backend/pro/src/eimir_pro/__init__.py": "VALUE = 1\n",
    "docs/guide.md": "guide\n",
    "docs/shot.png": "PNG",
    "docs/PROVENANCE.md": (
        "# Provenance\n\n## Assets\n\nkept\n\n## Pro catalog\n\ndropped\n\n"
        "### Detail\n\ndropped too\n\n## Contributors\n\nkept\n"
    ),
}


# Identity and line endings come from the command line, not from a written
# config file: no test depends on the machine's git configuration.
GIT_ENV = {
    "GIT_AUTHOR_NAME": "Test",
    "GIT_AUTHOR_EMAIL": "test@example.invalid",
    "GIT_COMMITTER_NAME": "Test",
    "GIT_COMMITTER_EMAIL": "test@example.invalid",
}


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "core.autocrlf=false", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, **GIT_ENV},
    ).stdout.strip()


class ExportTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = Path(tempfile.mkdtemp(prefix="core-export-test-"))
        self.addCleanup(shutil.rmtree, self.temp, ignore_errors=True)
        self.repo = self.temp / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "--quiet", "--initial-branch=main")
        self.write_files(FILES)
        git(self.repo, "update-index", "--chmod=+x", "backend/src/eimir/run.sh")
        git(self.repo, "commit", "--quiet", "-m", "base", "--date", "2026-11-01T10:00:00+00:00")
        self.config_path = self.temp / "allowlist.toml"
        self.config_path.write_text(CONFIG, encoding="utf-8")
        self.out = self.temp / "out"
        self.work = self.temp / "work"
        # A fake gitleaks: exit 3 and one finding when a planted marker exists.
        self.fake_gitleaks = self.temp / "fake_gitleaks.py"
        self.fake_gitleaks.write_text(
            textwrap.dedent(
                """
                import json, os, pathlib, sys
                args = sys.argv[1:]
                report = pathlib.Path(args[args.index("--report-path") + 1])
                hits = [
                    {"File": str(p.relative_to(".")).replace("\\\\", "/"), "StartLine": 1,
                     "RuleID": "generic-api-key", "Fingerprint": "x"}
                    for p in pathlib.Path(".").rglob("*") if p.is_file() and b"FAKE-SECRET" in p.read_bytes()
                ]
                if args[0] == "git" and os.environ.get("FAKE_GITLEAKS_GIT_FINDING"):
                    hits = [{"File": "x", "StartLine": 1, "RuleID": "git", "Fingerprint": "y"}]
                report.write_text(json.dumps(hits))
                sys.exit(3 if hits else 0)
                """
            ),
            encoding="utf-8",
        )
        patcher = mock.patch.dict(
            os.environ,
            {"EIMIR_CUTOVER_GITLEAKS": json.dumps([sys.executable, str(self.fake_gitleaks)])},
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("EIMIR_CUTOVER_GITLEAKS_IMAGE", None)

    def write_files(self, files: dict[str, str]) -> None:
        for path, content in files.items():
            target = self.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content.encode("utf-8"))
        git(self.repo, "add", "--all")

    def commit(self, files: dict[str, str]) -> None:
        self.write_files(files)
        git(self.repo, "commit", "--quiet", "-m", "change")

    def config(self, text: str | None = None) -> core_export.Config:
        if text is not None:
            self.config_path.write_text(text, encoding="utf-8")
        return core_export.load_config(self.config_path)

    def export(self, config: core_export.Config | None = None) -> dict:
        return core_export.export(self.repo, "HEAD", config or self.config(), self.out)

    def gates(
        self, manifest: dict, config: core_export.Config | None = None
    ) -> dict[str, core_export.GateResult]:
        results = core_export.run_cheap_gates(
            self.out, manifest, config or self.config(), self.repo, self.work
        )
        return {result.name: result for result in results}


class PatternTest(unittest.TestCase):
    def test_glob_semantics(self) -> None:
        cases = {
            "docs/**": (["docs/a.md", "docs/x/y/z.png"], ["docsx/a.md", "doc/a.md"]),
            "docs/**/*.png": (["docs/a.png", "docs/x/y.png"], ["docs/a.pngx", "other/a.png"]),
            "**/eimir_pro/**": (["eimir_pro/a.py", "backend/pro/src/eimir_pro/x/y.py"], ["eimir_prox/a.py"]),
            "LICENSE": (["LICENSE"], ["LICENSE.md", "x/LICENSE"]),
            "a/*.yml": (["a/b.yml"], ["a/b/c.yml"]),
            "**/daily_sayings*": (["x/daily_sayings.json"], ["x/daily.json"]),
        }
        for pattern, (matching, other) in cases.items():
            regex = core_export.glob_regex(pattern)
            for path in matching:
                self.assertTrue(regex.match(path), (pattern, path))
            for path in other:
                self.assertFalse(regex.match(path), (pattern, path))

    def test_invalid_patterns_are_rejected(self) -> None:
        for pattern in ("/abs", "a\\b", "a/", "a**/b", ""):
            with self.subTest(pattern=pattern), self.assertRaises(ExportError):
                core_export.glob_regex(pattern)

    def test_markdown_sections_are_dropped_to_the_next_equal_heading(self) -> None:
        text = FILES["docs/PROVENANCE.md"]
        result = core_export.drop_markdown_sections("x.md", text, ["Pro catalog"])
        self.assertIn("## Assets", result)
        self.assertIn("## Contributors", result)
        self.assertNotIn("dropped", result)
        with self.assertRaises(ExportError):
            core_export.drop_markdown_sections("x.md", text, ["Missing"])

    def test_headings_inside_code_fences_are_ignored(self) -> None:
        text = "## A\n\n```\n## B\n```\n\n## C\n"
        self.assertEqual(core_export.drop_markdown_sections("x.md", text, ["A"]), "## C\n")


class AllowlistConfigTest(ExportTestCase):
    def test_the_real_allowlist_loads(self) -> None:
        config = core_export.load_config(REAL_ALLOWLIST)
        self.assertTrue(config.includes and config.excludes and config.forbidden)
        self.assertIn("eimir_pro", config.plugin_import_roots)
        for path in (
            "backend/pro/src/eimir_pro/plugin.py",
            "backend/admin/pyproject.toml",
            ".github/workflows/release-publish.yml",
        ):
            self.assertFalse(config.exported(path), path)
        for path in (
            "web/src/App.tsx",
            "backend/src/eimir/main.py",
            "backend/openapi.json",
            "LICENSE",
            "CLA.md",
            ".github/workflows/ci.yml",
        ):
            self.assertTrue(config.exported(path), path)

    def test_the_real_allowlist_forbids_what_it_excludes(self) -> None:
        config = core_export.load_config(REAL_ALLOWLIST)
        for path in (
            "backend/pro/src/eimir_pro/plugin.py",
            "backend/admin/src/eimir_admin/plugin.py",
            ".github/workflows/release-publish.yml",
            "android/app/release.jks",
        ):
            self.assertIsNotNone(config.forbidden_rule(path), path)

    def test_an_allowance_for_runtime_code_is_rejected(self) -> None:
        text = CONFIG.replace('path = "backend/tests/conftest.py"', 'path = "backend/src/eimir/__init__.py"')
        with self.assertRaisesRegex(ExportError, "outside"):
            self.config(text)

    def test_unknown_keys_and_missing_reasons_are_rejected(self) -> None:
        with self.assertRaisesRegex(ExportError, "unknown keys"):
            self.config(CONFIG.replace('id = "docs"', 'id = "docs"\nexport_everything = true'))
        with self.assertRaisesRegex(ExportError, "reason"):
            self.config(CONFIG.replace('reason = "docs"', 'reason = ""'))


class ExportBehaviourTest(ExportTestCase):
    def test_only_allow_listed_files_are_exported(self) -> None:
        manifest = self.export()
        exported = {item["path"] for item in manifest["files"]}
        self.assertIn("backend/src/eimir/__init__.py", exported)
        self.assertNotIn("secret.txt", exported)  # not listed: excluded by default
        self.assertNotIn("backend/pro/src/eimir_pro/__init__.py", exported)
        self.assertNotIn("docs/shot.png", exported)
        rules = {item["path"]: item["rule"] for item in manifest["excluded"]}
        self.assertEqual(rules["secret.txt"], None)
        self.assertEqual(rules["docs/shot.png"], "media")
        self.assertEqual(core_export.walk_files(self.out), sorted(exported))

    def test_transforms_are_applied(self) -> None:
        self.export()
        self.assertEqual(
            (self.out / "backend/pyproject.toml").read_text(), "[tool.uv.workspace]\nmembers = []\n"
        )
        provenance = (self.out / "docs/PROVENANCE.md").read_text()
        self.assertNotIn("dropped", provenance)
        self.assertIn("## Contributors", provenance)

    def test_content_is_written_byte_for_byte(self) -> None:
        self.commit({"docs/crlf.md": "line\r\nline\r\n"})
        self.export()
        self.assertEqual((self.out / "docs/crlf.md").read_bytes(), b"line\r\nline\r\n")

    def test_a_forbidden_path_fails_the_export(self) -> None:
        widened = CONFIG.replace('patterns = ["backend/pro/**"]\n', 'patterns = ["backend/nothing/**"]\n', 1)
        with self.assertRaisesRegex(ExportError, "forbidden rule pro-code"):
            self.export(self.config(widened))

    def test_signing_material_fails_the_export(self) -> None:
        self.commit({"backend/release.jks": "key"})
        with self.assertRaisesRegex(ExportError, "forbidden"):
            self.export()

    def test_a_transform_that_no_longer_matches_fails(self) -> None:
        self.commit({"backend/pyproject.toml": '[tool.uv.workspace]\nmembers = ["pro", "admin"]\n'})
        with self.assertRaisesRegex(ExportError, "exactly once"):
            self.export()

    def test_a_transform_that_matches_twice_fails(self) -> None:
        self.commit({"backend/pyproject.toml": 'members = ["pro"]\nmembers = ["pro"]\n'})
        with self.assertRaisesRegex(ExportError, "found 2 times"):
            self.export()

    def test_a_transform_of_an_excluded_file_fails(self) -> None:
        text = CONFIG.replace('path = "docs/PROVENANCE.md"', 'path = "secret.txt"').replace(
            'drop_markdown_sections = ["Pro catalog"]', 'drop_markdown_sections = ["x"]'
        )
        with self.assertRaisesRegex(ExportError, "not exported"):
            self.export(self.config(text))

    def test_a_non_empty_output_directory_is_refused(self) -> None:
        self.out.mkdir()
        (self.out / "stale.txt").write_text("x")
        with self.assertRaisesRegex(ExportError, "not empty"):
            self.export()


class GateTest(ExportTestCase):
    def test_a_clean_export_passes_every_cheap_gate(self) -> None:
        manifest = self.export()
        results = self.gates(manifest)
        self.assertEqual(
            {name: result.status for name, result in results.items()},
            dict.fromkeys(core_export.CHEAP_GATES, "passed"),
        )
        self.assertIn("allowed plugin import: backend/tests/conftest.py", results["plugin-imports"].warnings)

    def test_coverage_detects_an_extra_file(self) -> None:
        manifest = self.export()
        (self.out / "backend" / ".venv").mkdir()
        (self.out / "backend" / ".venv" / "pyvenv.cfg").write_text("x")
        result = core_export.gate_coverage(self.out, manifest, self.config())
        self.assertTrue(result.failed)
        self.assertIn("not in the manifest: backend/.venv/pyvenv.cfg", result.details)

    def test_coverage_detects_a_changed_or_missing_file(self) -> None:
        manifest = self.export()
        (self.out / "README.md").write_text("changed")
        (self.out / "CLA.md").unlink()
        details = core_export.gate_coverage(self.out, manifest, self.config()).details
        self.assertIn("changed after the export: README.md", details)
        self.assertIn("missing from the tree: CLA.md", details)

    def test_coverage_detects_a_path_outside_the_allow_list(self) -> None:
        manifest = self.export()
        manifest["files"].append({"path": "secret.txt", "sha256": "0", "mode": "100644", "size": 1})
        (self.out / "secret.txt").write_text("x")
        details = core_export.gate_coverage(self.out, manifest, self.config()).details
        self.assertIn("not covered by the allow-list: secret.txt", details)

    def test_a_core_runtime_plugin_import_fails(self) -> None:
        self.commit(
            {"backend/src/eimir/leak.py": "def f():\n    import eimir_pro.garden as g\n    return g\n"}
        )
        result = self.gates(self.export())["plugin-imports"]
        self.assertTrue(result.failed)
        self.assertIn("backend/src/eimir/leak.py:2 imports eimir_pro.garden", result.details)

    def test_from_imports_and_import_module_calls_fail(self) -> None:
        self.commit(
            {
                "scripts/a.py": "from eimir_pro.plugin import plugin\n",
                "scripts/b.py": "import importlib\nimportlib.import_module('eimir_pro.plugin')\n",
                "scripts/c.py": "__import__('eimir_pro')\n",
                "scripts/ok.py": "import eimir_prox\nfrom . import eimir_pro\n",
            }
        )
        details = self.gates(self.export())["plugin-imports"].details
        self.assertIn("scripts/a.py:1 imports eimir_pro.plugin", details)
        self.assertIn("scripts/b.py:2 imports eimir_pro.plugin", details)
        self.assertIn("scripts/c.py:1 imports eimir_pro", details)
        self.assertFalse([detail for detail in details if detail.startswith("scripts/ok.py")])

    def test_an_unparsable_python_file_fails(self) -> None:
        self.commit({"scripts/broken.py": "def (:\n"})
        result = self.gates(self.export())["plugin-imports"]
        self.assertTrue(result.failed)
        self.assertTrue(result.details[0].startswith("scripts/broken.py: cannot be parsed"))

    def test_a_changed_contract_fails(self) -> None:
        manifest = self.export()
        (self.out / "backend/openapi.json").write_text('{"paths": {}}\n')
        self.assertTrue(self.gates(manifest)["openapi-contract"].failed)

    def test_a_missing_or_wrong_licence_fails(self) -> None:
        self.commit({"LICENSE": "MIT\n"})
        result = self.gates(self.export())["licence"]
        self.assertTrue(result.failed)
        self.assertIn("LICENSE lacks 'PolyForm Noncommercial License 1.0.0'", result.details)

    def test_a_missing_cla_fails(self) -> None:
        git(self.repo, "rm", "--quiet", "CLA.md")
        git(self.repo, "commit", "--quiet", "-m", "drop cla")
        self.assertIn("missing: CLA.md", self.gates(self.export())["licence"].details)

    def test_a_secret_in_the_tree_fails(self) -> None:
        self.commit({"docs/notes.md": "token FAKE-SECRET\n"})
        result = self.gates(self.export())["secret-scan"]
        self.assertTrue(result.failed)
        self.assertTrue(result.details[0].startswith("docs/notes.md:1 generic-api-key"))

    def test_a_missing_scanner_fails_instead_of_passing(self) -> None:
        self.export()
        with (
            mock.patch.dict(os.environ, {"EIMIR_CUTOVER_GITLEAKS": ""}),
            mock.patch.object(core_export.shutil, "which", return_value=None),
        ):
            result = core_export.gate_secret_scan(self.out, self.work)
        self.assertTrue(result.failed)
        self.assertIn("gitleaks is not installed", result.details[0])

    def test_skipping_a_gate_is_reported_as_skipped(self) -> None:
        manifest = self.export()
        results = core_export.run_cheap_gates(
            self.out, manifest, self.config(), self.repo, self.work, skip=["secret-scan"]
        )
        self.assertEqual(results[-1].status, "skipped")

    def test_history_ignores_do_not_hide_findings_in_a_fresh_history(self) -> None:
        # A .gitleaksignore fingerprint names a commit of the old history; the
        # scan must still see the finding (the fake scanner ignores the file).
        self.commit(
            {"docs/notes.md": "token FAKE-SECRET\n", ".gitleaksignore": "a" * 40 + ":docs/notes.md:x:1\n"}
        )
        self.assertTrue(self.gates(self.export())["secret-scan"].failed)


class FreshHistoryTest(ExportTestCase):
    def snapshot(self, manifest: dict, name: str) -> str:
        return core_export.fresh_history(
            self.repo,
            self.out,
            manifest,
            self.config(),
            self.temp / name,
            message="snapshot",
            author="Snapshot <snapshot@example.invalid>",
            date=None,
        )

    def test_the_snapshot_is_one_reproducible_commit_with_the_exact_tree(self) -> None:
        manifest = self.export()
        first = self.snapshot(manifest, "one.git")
        second = self.snapshot(manifest, "two.git")
        self.assertEqual(first, second)
        target = self.temp / "one.git"
        self.assertEqual(git(target, "rev-list", "--count", "main"), "1")
        self.assertEqual(git(target, "remote"), "")
        listed = git(target, "ls-tree", "-r", "--name-only", "main").splitlines()
        self.assertEqual(sorted(listed), sorted(item["path"] for item in manifest["files"]))
        self.assertIn("100755 blob", git(target, "ls-tree", "main", "backend/src/eimir/run.sh"))
        self.assertEqual(git(target, "show", "main:README.md"), "readme")

    def test_a_tree_that_fails_coverage_gets_no_snapshot(self) -> None:
        manifest = self.export()
        (self.out / "extra.txt").write_text("x")
        with self.assertRaisesRegex(ExportError, "coverage"):
            self.snapshot(manifest, "bad.git")
        self.assertFalse((self.temp / "bad.git").exists())

    def test_the_tool_has_no_push_or_remote_code_path(self) -> None:
        source = Path(core_export.__file__).read_text(encoding="utf-8")
        for forbidden in ('"push"', "'push'", '"remote", "add"', "set-url"):
            self.assertNotIn(forbidden, source)


class DryRunTest(ExportTestCase):
    def test_dry_run_writes_a_report_and_a_snapshot(self) -> None:
        work = self.temp / "dry"
        code = core_export.main(
            ["--repo", str(self.repo), "--allowlist", str(self.config_path), "dry-run", "--work", str(work)]
        )
        self.assertEqual(code, 0)
        report = json.loads((work / "report/report.json").read_text(encoding="utf-8"))
        self.assertTrue(report["snapshot_commit"])
        statuses = {gate["name"]: gate["status"] for gate in report["gates"]}
        self.assertEqual(statuses["snapshot-secret-scan"], "passed")
        self.assertEqual(report["exclude_groups"]["media"]["decision"], "D3")
        self.assertIn("secret.txt", report["unlisted"])
        self.assertIn("# eimir-core export dry run", (work / "report/report.md").read_text(encoding="utf-8"))

    def test_a_secret_in_the_snapshot_fails_the_dry_run(self) -> None:
        work = self.temp / "dry"
        # Only the history scan sees this: the fake scanner flags the marker in git mode.
        marker = self.temp / "git-mode-finding"
        marker.write_text("x")
        with mock.patch.dict(os.environ, {"FAKE_GITLEAKS_GIT_FINDING": str(marker)}):
            code = core_export.main(
                [
                    "--repo",
                    str(self.repo),
                    "--allowlist",
                    str(self.config_path),
                    "dry-run",
                    "--work",
                    str(work),
                ]
            )
        self.assertEqual(code, 1)
        report = json.loads((work / "report/report.json").read_text(encoding="utf-8"))
        statuses = {gate["name"]: gate["status"] for gate in report["gates"]}
        self.assertEqual(statuses["snapshot-secret-scan"], "failed")

    def test_a_failing_gate_fails_the_dry_run_and_creates_no_snapshot(self) -> None:
        self.commit({"backend/src/eimir/leak.py": "import eimir_pro\n"})
        work = self.temp / "dry"
        code = core_export.main(
            ["--repo", str(self.repo), "--allowlist", str(self.config_path), "dry-run", "--work", str(work)]
        )
        self.assertEqual(code, 1)
        self.assertFalse((work / "snapshot.git").exists())
        report = json.loads((work / "report/report.json").read_text(encoding="utf-8"))
        self.assertIsNone(report["snapshot_commit"])


if __name__ == "__main__":
    unittest.main()
