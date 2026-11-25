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


class LockCheckTest(unittest.TestCase):
    A = '[[package]]|name = "a"|version = "1.0"|source = { registry = "https://pypi.org/simple" }|'
    PRO = '[[package]]|name = "pro"|version = "0.1"|source = { editable = "pro" }|'

    @staticmethod
    def lock(*parts: str) -> str:
        return "".join(parts).replace("|", chr(10))

    def test_dropping_packages_is_accepted(self) -> None:
        before = self.lock(self.A, self.PRO)
        self.assertEqual(core_export.check_lock_only_removes("uv.lock", before, self.lock(self.A)), [])

    def test_a_changed_or_new_package_fails(self) -> None:
        before = self.lock(self.A)
        changed = before.replace('version = "1.0"', 'version = "2.0"')
        added = self.lock(self.A, '[[package]]|name = "b"|version = "1"|')
        self.assertEqual(
            core_export.check_lock_only_removes("uv.lock", before, changed),
            ["uv.lock: a changed from 1.0 to 2.0"],
        )
        self.assertEqual(
            core_export.check_lock_only_removes("uv.lock", before, added),
            ["uv.lock: b is new in the re-locked file"],
        )


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

    def test_the_real_allowlist_exports_the_rewritten_lifecycle_tests(self) -> None:
        # #2285 moved these onto a fake plugin; the remaining D5 modules still import Pro.
        config = core_export.load_config(REAL_ALLOWLIST)
        for path in (
            "backend/tests/integration/test_core_only_lifecycle.py",
            "backend/tests/integration/test_dormant_plugin_data.py",
            "backend/tests/integration/test_plugin_lifecycle.py",
            "backend/tests/support/fake_plugin.py",
        ):
            self.assertTrue(config.exported(path), path)
        for path in (
            "backend/tests/media/acceptance_video_lifecycle.py",
            "backend/tests/unit/test_account_table_lifecycle.py",
        ):
            self.assertFalse(config.exported(path), path)
            self.assertEqual(config.exclude_rule(path).id, "pro-coupled-core-tests")

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
            dict.fromkeys(core_export.cheap_gates_for(self.config()), "passed"),
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

    def test_a_core_test_module_with_a_plugin_import_and_no_allowance_fails(self) -> None:
        self.commit(
            {"backend/tests/integration/test_lifecycle.py": "from eimir_pro.garden.models import Plant\n"}
        )
        result = self.gates(self.export())["plugin-imports"]
        self.assertTrue(result.failed)
        self.assertIn(
            "backend/tests/integration/test_lifecycle.py:1 imports eimir_pro.garden.models", result.details
        )

    def test_a_fake_plugin_module_passes(self) -> None:
        self.commit(
            {"backend/tests/support/fake_plugin.py": "from eimir.plugins.contract import ProPlugin\n"}
        )
        self.assertEqual(self.gates(self.export())["plugin-imports"].status, "passed")

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


PRO_CONFIG = textwrap.dedent(
    """
    schema = 1
    name = "pro"

    [split]
    core_allowlist = "allowlist.toml"
    archive_only = ["media"]

    [[include]]
    id = "pro"
    reason = "pro"
    core_exclude = "pro"

    [[include]]
    id = "private-notes"
    reason = "only here"
    patterns = ["secret.txt"]

    [[include]]
    id = "provenance"
    reason = "split"
    patterns = ["docs/PROVENANCE.md"]

    [[overlap]]
    id = "provenance-split"
    reason = "two halves of one file"
    patterns = ["docs/PROVENANCE.md"]

    [[add]]
    path = "LICENSE"
    from = "scripts/pro/LICENSE"
    reason = "proprietary"

    [[forbidden]]
    id = "public-licensing"
    reason = "no CLA here"
    patterns = ["CLA.md"]

    [[transform]]
    path = "docs/PROVENANCE.md"
    reason = "keep the Pro part"
    keep_markdown_sections = ["Pro catalog"]
    header = "# Provenance of the private tree\\n\\n"

    [gates]
    [[gates.required_file]]
    path = "LICENSE"
    contains = ["All rights reserved"]
    lacks = ["PolyForm"]
    """
)


class ProTreeTestCase(ExportTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.commit({"scripts/pro/LICENSE": "All rights reserved.\n"})
        self.pro_path = self.temp / "pro-allowlist.toml"
        self.pro_path.write_text(PRO_CONFIG, encoding="utf-8")
        self.pro_out = self.temp / "pro-out"

    def pro_config(self, text: str | None = None) -> core_export.Config:
        if text is not None:
            self.pro_path.write_text(text, encoding="utf-8")
        return core_export.load_config(self.pro_path)

    def pro_export(self, config: core_export.Config | None = None) -> dict:
        return core_export.export(self.repo, "HEAD", config or self.pro_config(), self.pro_out)

    def split(self, pro: core_export.Config | None = None) -> core_export.GateResult:
        pro = pro or self.pro_config()
        core_manifest = self.export()
        return core_export.gate_split(core_manifest, self.config(), self.pro_export(pro), pro)


class ProTreeTest(ProTreeTestCase):
    def test_the_pro_tree_holds_what_the_core_tree_excludes_plus_its_own_files(self) -> None:
        manifest = self.pro_export()
        paths = {item["path"] for item in manifest["files"]}
        self.assertEqual(
            paths, {"backend/pro/src/eimir_pro/__init__.py", "secret.txt", "docs/PROVENANCE.md", "LICENSE"}
        )
        added = next(item for item in manifest["files"] if item["path"] == "LICENSE")
        self.assertEqual(added["added_from"], "scripts/pro/LICENSE")
        self.assertIsNone(added["source"])
        results = {
            r.name: r.status
            for r in core_export.run_cheap_gates(
                self.pro_out, manifest, self.pro_config(), self.repo, self.work
            )
        }
        self.assertEqual(results, {"coverage": "passed", "licence": "passed", "secret-scan": "passed"})

    def test_kept_sections_and_header_form_the_private_provenance(self) -> None:
        self.pro_export()
        text = (self.pro_out / "docs/PROVENANCE.md").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("# Provenance of the private tree\n\n## Pro catalog"))
        self.assertIn("dropped too", text)  # the subsection belongs to the kept section
        self.assertNotIn("## Assets", text)
        self.assertNotIn("## Contributors", text)

    def test_a_mapping_moves_a_directory_and_coverage_follows_it(self) -> None:
        mapped = PRO_CONFIG.replace(
            "[[add]]", '[[map]]\nfrom = "backend/pro/"\nto = "pro/"\nreason = "flat layout"\n\n[[add]]', 1
        )
        manifest = self.pro_export(self.pro_config(mapped))
        item = next(
            item for item in manifest["files"] if item["source"] == "backend/pro/src/eimir_pro/__init__.py"
        )
        self.assertEqual(item["path"], "pro/src/eimir_pro/__init__.py")
        self.assertTrue((self.pro_out / "pro/src/eimir_pro/__init__.py").is_file())
        self.assertEqual(
            core_export.gate_coverage(self.pro_out, manifest, self.pro_config(mapped)).status, "passed"
        )

    def test_a_mapping_that_matches_nothing_fails(self) -> None:
        mapped = PRO_CONFIG.replace(
            "[[add]]", '[[map]]\nfrom = "gone/"\nto = "x/"\nreason = "stale"\n\n[[add]]', 1
        )
        with self.assertRaisesRegex(ExportError, "matches no exported file"):
            self.pro_export(self.pro_config(mapped))

    def test_an_added_file_that_is_not_declared_fails_coverage(self) -> None:
        manifest = self.pro_export()
        (self.pro_out / "EXTRA").write_text("x")
        manifest["files"].append(
            {
                "path": "EXTRA",
                "source": None,
                "added_from": "scripts/pro/LICENSE",
                "sha256": core_export.sha256(b"x"),
            }
        )
        details = core_export.gate_coverage(self.pro_out, manifest, self.pro_config()).details
        self.assertIn("not an [[add]] of the allow-list: EXTRA", details)

    def test_a_public_licence_in_the_private_tree_fails(self) -> None:
        self.commit({"scripts/pro/LICENSE": "All rights reserved. PolyForm Noncommercial\n"})
        manifest = self.pro_export()
        result = core_export.gate_licence(self.pro_out, self.pro_config())
        self.assertIn("LICENSE must not contain 'PolyForm'", result.details)
        self.assertTrue(manifest["files"])

    def test_a_cla_in_the_private_tree_stops_the_export(self) -> None:
        text = PRO_CONFIG.replace('patterns = ["secret.txt"]', 'patterns = ["secret.txt", "CLA.md"]')
        with self.assertRaisesRegex(ExportError, "forbidden rule public-licensing"):
            self.pro_export(self.pro_config(text))

    def test_core_exclude_must_name_an_existing_rule(self) -> None:
        with self.assertRaisesRegex(ExportError, "no Core exclude rule"):
            self.pro_config(PRO_CONFIG.replace('core_exclude = "pro"', 'core_exclude = "nope"'))
        with self.assertRaisesRegex(ExportError, "archive_only names no Core exclude rule"):
            self.pro_config(PRO_CONFIG.replace('archive_only = ["media"]', 'archive_only = ["nope"]'))


class SplitGateTest(ProTreeTestCase):
    def test_every_tracked_file_lands_exactly_once_or_by_a_documented_reason(self) -> None:
        result = self.split()
        self.assertEqual(result.status, "passed", result.details)
        self.assertIn("1 in both by a documented overlap, 1 archive-only", result.details[0])

    def test_a_file_in_neither_tree_fails(self) -> None:
        result = self.split(
            self.pro_config(PRO_CONFIG.replace('patterns = ["secret.txt"]', 'patterns = ["x.txt"]'))
        )
        self.assertTrue(result.failed)
        self.assertIn("in neither tree and not archive-only: secret.txt", result.details)

    def test_an_archive_only_file_needs_its_rule_listed(self) -> None:
        result = self.split(
            self.pro_config(PRO_CONFIG.replace('archive_only = ["media"]', "archive_only = []"))
        )
        self.assertIn("in neither tree and not archive-only: docs/shot.png", result.details)

    def test_a_file_in_both_trees_without_an_overlap_rule_fails(self) -> None:
        text = PRO_CONFIG.replace('patterns = ["secret.txt"]', 'patterns = ["secret.txt", "README.md"]')
        result = self.split(self.pro_config(text))
        self.assertTrue(result.failed)
        self.assertIn("in both trees without a documented overlap: README.md", result.details)

    def test_an_unused_overlap_rule_is_reported(self) -> None:
        text = PRO_CONFIG.replace(
            "[[add]]", '[[overlap]]\nid = "stale"\nreason = "old"\npatterns = ["nothing.md"]\n\n[[add]]', 1
        )
        result = self.split(self.pro_config(text))
        self.assertIn("overlap rule stale matches no file in both trees", result.warnings)

    def test_trees_from_different_revisions_fail(self) -> None:
        core_manifest = self.export()
        self.commit({"docs/new.md": "new\n"})
        pro_manifest = self.pro_export()
        result = core_export.gate_split(core_manifest, self.config(), pro_manifest, self.pro_config())
        self.assertIn("the two trees come from different revisions", result.details)


class ForbiddenTextTest(ExportTestCase):
    RUNNER = "    runs-on: >-\n      ${{ vars.R && 'eimir-kvm-pr' || 'ubuntu-latest' }}\n"
    GATE = textwrap.dedent(
        """
        [[gates.forbidden_text]]
        id = "operator-runner-label"
        text = "eimir-kvm-pr"
        paths = [".github/**"]
        reason = "never in the public repository"
        """
    )

    def config_with_gate(self, transform: bool) -> core_export.Config:
        text = CONFIG.replace('patterns = ["docs/**"]', 'patterns = ["docs/**", ".github/**"]') + self.GATE
        if transform:
            text = text.replace(
                "[gates]",
                '[[transform]]\npath = ".github/workflows/ci.yml"\nreason = "hosted runner"\n'
                "[[transform.replace]]\nold = '''\n"
                + self.RUNNER
                + "'''\nnew = '''\n    runs-on: ubuntu-latest\n'''\n\n"
                "[gates]",
            )
        return self.config(text)

    def test_the_runner_label_in_a_workflow_fails(self) -> None:
        self.commit({".github/workflows/ci.yml": "jobs:\n  secrets:\n" + self.RUNNER})
        config = self.config_with_gate(transform=False)
        result = self.gates(self.export(config), config)["forbidden-text"]
        self.assertTrue(result.failed)
        self.assertIn(
            ".github/workflows/ci.yml contains 'eimir-kvm-pr' (operator-runner-label)", result.details
        )

    def test_the_transform_removes_the_label_and_the_gate_passes(self) -> None:
        self.commit(
            {
                ".github/workflows/ci.yml": "jobs:\n  secrets:\n" + self.RUNNER,
                "docs/runner.md": "eimir-kvm-pr\n",
            }
        )
        config = self.config_with_gate(transform=True)
        manifest = self.export(config)
        self.assertEqual(
            (self.out / ".github/workflows/ci.yml").read_text(encoding="utf-8"),
            "jobs:\n  secrets:\n    runs-on: ubuntu-latest\n",
        )
        # Documentation outside the path scope may still name the label.
        self.assertEqual(self.gates(manifest, config)["forbidden-text"].status, "passed")


class RealSplitConfigTest(unittest.TestCase):
    def test_the_real_pro_allowlist_loads_and_reuses_the_core_exclusions(self) -> None:
        pro = core_export.load_config(REAL_ALLOWLIST.with_name("pro-allowlist.toml"))
        core = core_export.load_config(REAL_ALLOWLIST)
        self.assertEqual(pro.core_allowlist, REAL_ALLOWLIST.resolve())
        for rule_id in (
            "pro-distribution",
            "operator-plugin",
            "official-release-pipeline",
            "pro-coupled-core-tests",
        ):
            pro_rule = next(rule for rule in pro.includes if rule.id == rule_id)
            core_rule = next(rule for rule in core.excludes if rule.id == rule_id)
            self.assertEqual(pro_rule.patterns, core_rule.patterns)
        self.assertTrue(pro.exported("backend/pro/src/eimir_pro/date_ideas/data/catalog.json"))
        self.assertFalse(pro.exported("backend/src/eimir/main.py"))
        self.assertIsNotNone(pro.forbidden_rule("CLA.md"))
        # Shared by the Core CI and the private release workflows (#2294).
        for path in ("scripts/supply_chain_state.py", "tools/ci/test_supply_chain_state.py"):
            self.assertTrue(pro.exported(path) and core.exported(path), path)
            self.assertTrue(any(rule.matches(path) for rule in pro.overlaps), path)
        self.assertEqual(core_export.cheap_gates_for(pro), ("coverage", "licence", "secret-scan"))

    def test_the_real_core_transform_removes_the_operator_runner_from_ci(self) -> None:
        core = core_export.load_config(REAL_ALLOWLIST)
        transform = core.transform_for(".github/workflows/ci.yml")
        source = (REAL_ALLOWLIST.parents[2] / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        result = core_export.apply_replacements(transform.path, source, transform.replace)
        self.assertNotIn("eimir-kvm-pr", result)
        self.assertNotIn("EIMIR_PR_RUNNER", result)
        self.assertIn("  secrets:\n    name: Secret Scan\n    runs-on: ubuntu-latest\n", result)
        self.assertIn("forbidden-text", core_export.cheap_gates_for(core))

    def test_the_snapshot_author_is_the_neutral_identity_of_decision_d6(self) -> None:
        self.assertEqual(core_export.SNAPSHOT_AUTHOR, "eimir. <snapshot@eimir.invalid>")


class TwoTreeDryRunTest(ProTreeTestCase):
    def test_dry_run_with_pro_writes_both_reports_and_snapshots(self) -> None:
        work = self.temp / "dry"
        code = core_export.main(
            [
                "--repo",
                str(self.repo),
                "--allowlist",
                str(self.config_path),
                "dry-run",
                "--work",
                str(work),
                "--with-pro",
                "--pro-allowlist",
                str(self.pro_path),
            ]
        )
        self.assertEqual(code, 0)
        core_report = json.loads((work / "report/report.json").read_text(encoding="utf-8"))
        pro_report = json.loads((work / "pro-report/report.json").read_text(encoding="utf-8"))
        self.assertEqual(pro_report["tree"], "pro")
        self.assertTrue(pro_report["snapshot_commit"])
        self.assertIn("split", {gate["name"] for gate in core_report["gates"]})
        author = git(work / "pro-snapshot.git", "log", "-1", "--format=%an <%ae>")
        self.assertEqual(author, core_export.SNAPSHOT_AUTHOR)
        self.assertEqual(git(work / "pro-snapshot.git", "show", "main:LICENSE"), "All rights reserved.")

    def test_a_pro_allowlist_for_another_core_list_is_refused(self) -> None:
        other = self.temp / "other.toml"
        other.write_text(CONFIG, encoding="utf-8")
        work = self.temp / "dry"
        code = core_export.main(
            [
                "--repo",
                str(self.repo),
                "--allowlist",
                str(other),
                "dry-run",
                "--work",
                str(work),
                "--with-pro",
                "--pro-allowlist",
                str(self.pro_path),
            ]
        )
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
