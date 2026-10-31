#!/usr/bin/env python3
from __future__ import annotations

import fnmatch
import re
import unittest
from pathlib import Path

from change_scope import (
    PREFLIGHT_TOOLING_TESTS,
    SCOPES,
    SELF_VALIDATING_TOOLING_OWNERS,
    classify_paths,
)

ROOT = Path(__file__).resolve().parents[2]

ACCOUNT_DELETION_RECOVERY_RUNTIME_PATHS = (
    "backend/src/eimir/identity/deletion.py",
    "backend/src/eimir/identity/deletion_async.py",
    "backend/src/eimir/identity/deletion_jobs.py",
    "backend/src/eimir/identity/deletion_journal.py",
    "backend/src/eimir/identity/deletion_lifecycle.py",
    "backend/src/eimir/identity/deletion_media.py",
    "backend/src/eimir/identity/deletion_models.py",
    "backend/src/eimir/identity/deletion_reconcile.py",
    "backend/src/eimir/identity/deletion_self_service.py",
    "backend/src/eimir/authorization/retention.py",
    "backend/src/eimir/attachments/retention.py",
    "backend/src/eimir/jobs/runner.py",
)

RECOVERY_TOOLING_PATHS = (
    "scripts/self_hosted_recovery.py",
    "scripts/self_hosted_deletion_reconcile.py",
    "scripts/self_hosted_recovery_acceptance.py",
    "scripts/account_deletion_recovery_acceptance.py",
    "scripts/test_self_hosted_recovery.py",
    "scripts/test_self_hosted_deletion_reconcile.py",
    "docs/SELF-HOSTED-RECOVERY.md",
)

SELF_VALIDATING_LEAF_WORKFLOW_PATHS = (
    ".github/workflows/backend-encrypted.yml",
    ".github/workflows/codeql.yml",
    ".github/workflows/g2-e2e.yml",
    ".github/workflows/incident-runbooks.yml",
    ".github/workflows/product-design-review.yml",
    ".github/workflows/reuse-review.yml",
    ".github/workflows/web-browser-qa.yml",
    ".github/workflows/web-s8.yml",
)


class ChangeScopeTest(unittest.TestCase):
    def assert_scope(self, paths: list[str], *, enabled: set[str]) -> None:
        expected = {scope: scope in enabled for scope in SCOPES}
        self.assertEqual(classify_paths(paths), expected)

    def test_normal_docs_do_not_enable_expensive_gates(self) -> None:
        self.assert_scope(
            [
                "README.md",
                "docs/ROADMAP.md",
                "docs/IMPLEMENTATION-STATUS.md",
                "specification/PRODUCT-SPEC.md",
            ],
            enabled=set(),
        )

    def test_self_validating_leaf_workflows_do_not_enable_core_gates(self) -> None:
        for path in SELF_VALIDATING_LEAF_WORKFLOW_PATHS:
            with self.subTest(path=path):
                self.assert_scope([path], enabled=set())

    def test_web_ui_change_does_not_enable_backend_or_container_gates(self) -> None:
        self.assert_scope(["web/src/App.tsx"], enabled=set())

    def test_capacitor_wrapper_change_does_not_enable_backend_gates(self) -> None:
        self.assert_scope(
            ["android/app/build.gradle", "android/app/src/main/AndroidManifest.xml"],
            enabled=set(),
        )
        self.assert_scope(["ios/App/App/Info.plist"], enabled=set())

    def test_backend_unit_test_only_enables_fast_backend_gate(self) -> None:
        self.assert_scope(["backend/tests/test_config.py"], enabled={"backend"})

    def test_backend_runtime_change_enables_postgres_integration(self) -> None:
        self.assert_scope(
            ["backend/src/eimir/memories/service.py"],
            enabled={"backend", "backend_integration"},
        )

    def test_backend_runtime_entrypoint_also_enables_deployment_gates(self) -> None:
        self.assert_scope(
            ["backend/src/eimir/main.py"],
            enabled={
                "backend",
                "backend_integration",
                "self_hosted",
                "deployment_guard",
                "recovery",
            },
        )

    def test_canonical_compose_enables_stack_and_recovery_gates(self) -> None:
        self.assert_scope(
            ["compose.yaml"],
            enabled={"self_hosted", "deployment_guard", "recovery"},
        )

    def test_environment_profiles_enable_expected_deployment_gates(self) -> None:
        self.assert_scope(
            ["deploy/cloud-managed.env.example"],
            enabled={"deployment_guard", "recovery"},
        )
        self.assert_scope(
            ["deploy/persistent-development.env.example"],
            enabled={"self_hosted", "deployment_guard", "recovery"},
        )

    def test_web_dockerfile_enables_only_web_supply_chain_surface(self) -> None:
        self.assert_scope(
            ["web/Dockerfile"],
            enabled={
                "self_hosted",
                "supply_chain",
                "supply_chain_web",
                "deployment_guard",
            },
        )

    def test_backend_dockerfile_enables_only_backend_supply_chain_surface(self) -> None:
        self.assert_scope(
            ["backend/Dockerfile"],
            enabled={
                "backend",
                "self_hosted",
                "supply_chain",
                "supply_chain_backend",
                "deployment_guard",
            },
        )

    def test_backend_dependency_change_runs_backend_integration_and_supply_chain(self) -> None:
        self.assert_scope(
            ["backend/uv.lock"],
            enabled={
                "backend",
                "backend_integration",
                "supply_chain",
                "supply_chain_backend",
            },
        )

    def test_mixed_supply_chain_change_runs_both_surfaces(self) -> None:
        self.assert_scope(
            ["backend/uv.lock", "web/Dockerfile"],
            enabled={
                "backend",
                "backend_integration",
                "self_hosted",
                "supply_chain",
                "supply_chain_backend",
                "supply_chain_web",
                "deployment_guard",
            },
        )

    def test_dependabot_configuration_keeps_both_supply_chain_surfaces(self) -> None:
        self.assert_scope(
            [".github/dependabot.yml"],
            enabled={"supply_chain", "supply_chain_backend", "supply_chain_web"},
        )

    def test_openapi_contract_enables_generated_client_check(self) -> None:
        self.assert_scope(["backend/openapi.json"], enabled={"backend", "api_clients"})

    def test_openapi_generator_only_enables_client_check(self) -> None:
        self.assert_scope(["tools/openapi/generate.sh"], enabled={"api_clients"})

    def test_dependency_inventory_only_enables_backend_supply_chain(self) -> None:
        self.assert_scope(
            ["docs/DEPENDENCIES.md"],
            enabled={"supply_chain", "supply_chain_backend"},
        )

    def test_supply_chain_union_matches_internal_subscopes(self) -> None:
        for paths in (
            ["backend/uv.lock"],
            ["web/Dockerfile"],
            ["backend/uv.lock", "web/Dockerfile"],
            [".github/dependabot.yml"],
            ["docs/ROADMAP.md"],
            ["future-build-system/config.toml"],
        ):
            with self.subTest(paths=paths):
                result = classify_paths(paths)
                self.assertEqual(
                    result["supply_chain"],
                    result["supply_chain_backend"] or result["supply_chain_web"],
                )

    def test_self_hosting_contract_enables_stack_deployment_and_recovery(self) -> None:
        for path in ("docs/SELF-HOSTING.md", "docs/ARCANE.md"):
            with self.subTest(path=path):
                self.assert_scope(
                    [path],
                    enabled={"self_hosted", "deployment_guard", "recovery"},
                )

    def test_migration_runs_backend_integration_and_recovery(self) -> None:
        self.assert_scope(
            ["backend/alembic/versions/0042_example.py"],
            enabled={"backend", "backend_integration", "recovery"},
        )

    def test_recovery_tooling_only_enables_recovery_gate(self) -> None:
        for path in RECOVERY_TOOLING_PATHS:
            with self.subTest(path=path):
                self.assert_scope([path], enabled={"recovery"})

    def test_complete_account_deletion_recovery_runtime_enables_recovery(self) -> None:
        for path in ACCOUNT_DELETION_RECOVERY_RUNTIME_PATHS:
            with self.subTest(path=path):
                self.assert_scope(
                    [path],
                    enabled={"backend", "backend_integration", "recovery"},
                )

    def test_future_account_deletion_recovery_module_fails_closed_to_recovery(self) -> None:
        self.assert_scope(
            ["backend/src/eimir/identity/deletion_future_authority.py"],
            enabled={"backend", "backend_integration", "recovery"},
        )

    def test_unrelated_identity_runtime_does_not_enable_recovery(self) -> None:
        self.assert_scope(
            ["backend/src/eimir/identity/preferences.py"],
            enabled={"backend", "backend_integration"},
        )

    def test_unrelated_attachment_runtime_does_not_enable_recovery(self) -> None:
        self.assert_scope(
            ["backend/src/eimir/attachments/service.py"],
            enabled={"backend", "backend_integration"},
        )

    def test_ordinary_deployment_documentation_does_not_enable_recovery(self) -> None:
        self.assert_scope(["docs/m6/DEPLOYMENT-RELEASE.md"], enabled=set())

    def test_filter_changes_fail_closed(self) -> None:
        self.assertTrue(all(classify_paths(["tools/ci/change_scope.py"]).values()))

    def test_preflight_tools_do_not_enable_unrelated_runtime_gates(self) -> None:
        for path in PREFLIGHT_TOOLING_TESTS:
            with self.subTest(path=path):
                self.assert_scope([path], enabled=set())

    def test_preflight_tools_are_tested_before_scope_selection(self) -> None:
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        preflight = workflow.split("\n  changes:\n", 1)[1].split("\n  backend:\n", 1)[0]
        before_selection = preflight.split("      - name: Determine relevant change scopes", 1)[0]
        self.assertNotIn("    if:", preflight)
        self.assertNotIn("        if:", before_selection)
        for path, test in PREFLIGHT_TOOLING_TESTS.items():
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file(), "stale preflight entry")
                self.assertTrue((ROOT / test).is_file(), "missing owner test")
                self.assertIn(f"python3 {test}", before_selection)

    def test_preflight_tools_preserve_mixed_diff_safety(self) -> None:
        tools = list(PREFLIGHT_TOOLING_TESTS)
        self.assert_scope(
            [*tools, "backend/src/eimir/memories/service.py"],
            enabled={"backend", "backend_integration"},
        )
        self.assert_scope(
            [*tools, "compose.yaml"],
            enabled={"self_hosted", "deployment_guard", "recovery"},
        )
        for path in (
            "tools/ci/change_scope.py",
            "tools/ci/test_change_scope.py",
            "tools/ci/future.py",
        ):
            with self.subTest(path=path):
                self.assertTrue(all(classify_paths([*tools, path]).values()))

    def test_ci_workflow_changes_fail_closed(self) -> None:
        self.assertTrue(all(classify_paths([".github/workflows/ci.yml"]).values()))

    def test_owned_self_hosted_workflows_keep_specific_gates(self) -> None:
        self.assert_scope(
            [".github/workflows/self-hosted-deployment-guard.yml"],
            enabled={"deployment_guard"},
        )
        self.assert_scope(
            [".github/workflows/self-hosted-recovery.yml"],
            enabled={"recovery"},
        )

    def test_non_allowlisted_workflow_changes_stay_fail_closed(self) -> None:
        for path in (
            ".github/workflows/runtime-environment-drift-guard.yml",
            ".github/workflows/future.yml",
        ):
            with self.subTest(path=path):
                self.assertTrue(all(classify_paths([path]).values()))

    @staticmethod
    def pull_request_paths(workflow: str) -> list[str]:
        text = (ROOT / workflow).read_text(encoding="utf-8")
        block = text.split("  pull_request:\n    paths:\n", 1)[1].split("\n  workflow_dispatch:", 1)[0]
        return re.findall(r"""^      - ["']([^"']+)["']$""", block, re.MULTILINE)

    def test_self_validating_tooling_does_not_enable_core_gates(self) -> None:
        for path in SELF_VALIDATING_TOOLING_OWNERS:
            with self.subTest(path=path):
                self.assert_scope([path], enabled=set())
        self.assert_scope(list(SELF_VALIDATING_TOOLING_OWNERS), enabled=set())
        self.assert_scope(
            [*SELF_VALIDATING_TOOLING_OWNERS, "docs/m6/IMMUTABLE-RELEASES.md"],
            enabled=set(),
        )

    def test_self_validating_tooling_is_actually_validated_by_its_owner(self) -> None:
        # Skipping the core gates is only safe while a pull request touching these
        # files still triggers the owning workflow, which runs their tests.
        for path, owner in SELF_VALIDATING_TOOLING_OWNERS.items():
            with self.subTest(path=path, owner=owner):
                self.assertTrue((ROOT / path).is_file(), "stale allowlist entry")
                self.assertTrue(
                    owner in SELF_VALIDATING_TOOLING_OWNERS
                    and SELF_VALIDATING_TOOLING_OWNERS[owner] == owner,
                    "owner must be an allowlisted workflow that owns itself",
                )
                patterns = self.pull_request_paths(owner)
                self.assertTrue(
                    any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns),
                    "not covered by the owner's pull_request.paths",
                )
                if Path(path).name.startswith("test_"):
                    workflow = (ROOT / owner).read_text(encoding="utf-8")
                    self.assertIn(f"python3 {path}", workflow, "test is not run by its owner")

    def test_self_validating_tooling_keeps_other_scopes_in_mixed_prs(self) -> None:
        self.assert_scope(
            [".github/workflows/release-publish.yml", "backend/tests/test_config.py"],
            enabled={"backend"},
        )
        self.assert_scope(
            ["scripts/image_archive_config.py", "backend/alembic/versions/0001_x.py"],
            enabled={"backend", "backend_integration", "recovery"},
        )

    def test_self_validating_tooling_cannot_hide_unknown_or_ci_changes(self) -> None:
        for other in ("future-build-system/config.toml", "tools/ci/change_scope.py"):
            with self.subTest(other=other):
                result = classify_paths(["scripts/android_launcher_identity.py", other])
                self.assertTrue(all(result.values()))

    def test_files_shared_with_other_consumers_stay_fail_closed(self) -> None:
        # release_manifest.py is also used by release-candidate.yml and the
        # project-identity scan; the manifest test is run by both workflows.
        # android_test_release.py is not referenced or tested by any workflow.
        for path in (
            "scripts/release_manifest.py",
            "scripts/android_test_release.py",
            "tools/ci/test_release_manifest.py",
            ".github/workflows/release-candidate.yml",
            "scripts/self_hosted_release.py",
            "tools/ci/test_change_scope.py",
        ):
            with self.subTest(path=path):
                self.assertTrue(all(classify_paths([path]).values()))

    def test_unknown_path_fails_closed(self) -> None:
        self.assertTrue(all(classify_paths(["future-build-system/config.toml"]).values()))

    def test_mixed_pr_combines_relevant_scopes(self) -> None:
        self.assert_scope(
            ["docs/ROADMAP.md", "web/src/App.tsx", "backend/tests/test_config.py"],
            enabled={"backend"},
        )

    def test_mixed_leaf_workflow_and_backend_change_keeps_backend_scope(self) -> None:
        self.assert_scope(
            [".github/workflows/codeql.yml", "backend/tests/test_config.py"],
            enabled={"backend"},
        )

    def test_mixed_pr_cannot_hide_unknown_change_with_docs(self) -> None:
        result = classify_paths(["docs/ROADMAP.md", "future-build-system/config.toml"])
        self.assertTrue(all(result.values()))


if __name__ == "__main__":
    unittest.main()

