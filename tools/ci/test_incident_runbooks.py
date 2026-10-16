#!/usr/bin/env python3
"""Fail-closed checks for the #522 incident-response/runbook contract."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNBOOK = ROOT / "docs/m6/INCIDENT-RESPONSE.md"
DRILL = ROOT / "docs/m6/INCIDENT-DRILL.md"

RUNBOOK_TITLES = (
    "API/Web unavailable",
    "Database/readiness degraded",
    "Worker/job queue stalled or poison/repeated failure",
    "MediaStore degraded",
    "Failed migration or failed release candidate",
    "Authentication/OIDC/provider outage",
    "High error rate or latency",
    "Maintenance-mode activation and recovery",
    "Rollback versus forward-fix decision",
    "Backup/restore recovery",
    "Suspected privacy/secret leakage in logs or telemetry",
    "Entitlement/commercial-source outage",
)

RUNBOOK_SUBSECTIONS = (
    "Detection",
    "Immediate containment",
    "Safe diagnostics",
    "User impact",
    "Recovery boundary",
    "Recovery actions",
    "Recovery verification",
    "Evidence to preserve",
)

FORBIDDEN_DIAGNOSTIC_CATEGORIES = (
    "ProtectedPayload",
    "OWNER_ONLY",
    "Job.payload",
    "Job.last_error",
    "Job.locked_by",
    "Authorization",
    "signed media URLs",
    "private attachment filenames",
    "raw provider webhook/error response bodies",
)


def runbook_section(document: str, index: int) -> str:
    marker = f"# Runbook {index}: "
    start = document.index(marker)
    if index == len(RUNBOOK_TITLES):
        return document[start:]
    end = document.index(f"# Runbook {index + 1}: ", start)
    return document[start:end]


def bash_blocks(document: str) -> list[str]:
    return re.findall(r"```bash\n(.*?)```", document, flags=re.DOTALL)


class IncidentRunbookContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.runbook = RUNBOOK.read_text(encoding="utf-8")
        cls.drill = DRILL.read_text(encoding="utf-8")

    def test_all_required_runbooks_have_complete_operator_shape(self) -> None:
        for index, title in enumerate(RUNBOOK_TITLES, start=1):
            section = runbook_section(self.runbook, index)
            self.assertIn(f"# Runbook {index}: {title}", section)
            for subsection in RUNBOOK_SUBSECTIONS:
                with self.subTest(runbook=index, subsection=subsection):
                    self.assertIn(f"## {subsection}", section)

    def test_reuses_authoritative_recovery_and_release_paths(self) -> None:
        for marker in (
            "#189",
            "#190",
            "#334",
            "#375",
            "#523",
            "scripts/deployment_smoke.py",
            "scripts/self_hosted_recovery.py backup",
            "scripts/self_hosted_recovery.py restore",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.runbook)

    def test_maintenance_is_conditional_until_334_is_deployed(self) -> None:
        self.assertIn("Until #334 is actually merged and", self.runbook)
        self.assertIn("do not edit the database directly to imitate", self.runbook)
        maintenance = runbook_section(self.runbook, 8)
        self.assertIn("If #334 is **not** in the deployed release", maintenance)
        self.assertNotRegex(maintenance, r"(?im)^\s*UPDATE\s+")

    def test_queue_diagnostics_never_prescribe_sensitive_columns(self) -> None:
        queue_blocks = [block for block in bash_blocks(self.runbook) if "SELECT status," in block]
        self.assertEqual(len(queue_blocks), 1, "expected one canonical safe queue SQL block")
        query_block = queue_blocks[0]
        for column in ("payload", "last_error", "locked_by"):
            with self.subTest(column=column):
                self.assertNotRegex(query_block, rf"(?i)\b{re.escape(column)}\b")
        self.assertIn("never select `payload`, `last_error` or `locked_by`", self.runbook)

    def test_privacy_forbidden_categories_are_explicit(self) -> None:
        for category in FORBIDDEN_DIAGNOSTIC_CATEGORIES:
            with self.subTest(category=category):
                self.assertIn(category, self.runbook)
        self.assertIn("Never\npreserve the leaked secret/private value", self.runbook)

    def test_no_fictional_worker_heartbeat_is_required(self) -> None:
        self.assertIn("no authoritative worker\nheartbeat endpoint", self.runbook)
        self.assertIn("do not alert on a fictional heartbeat metric", self.runbook)
        worker = runbook_section(self.runbook, 3)
        self.assertIn("There is currently no mainline worker-heartbeat endpoint", worker)

    def test_entitlement_outage_keeps_core_independent(self) -> None:
        entitlement = runbook_section(self.runbook, 12)
        self.assertIn("keep non-paywallable Core/security/privacy/data-rights functionality working", entitlement)
        for forbidden in ("receipts", "purchase tokens", "signed\nlicense material"):
            self.assertIn(forbidden, entitlement)

    def test_launch_drill_is_not_claimed_as_already_executed(self) -> None:
        self.assertIn("a checked-in\ntemplate is not evidence that the drill happened", self.drill)
        self.assertIn("dedicated Development/Staging/launch-rehearsal topology", self.drill)
        self.assertIn("fictional/test data", self.drill)
        self.assertIn("Do **not** intentionally stop a Production database", self.drill)
        self.assertIn("Drill result: PASS / FAIL", self.drill)

    def test_drill_exercises_real_health_revision_and_recovery_signals(self) -> None:
        for marker in (
            "/api/v1/health",
            "/api/v1/health/ready",
            "X-Eimir-Revision",
            "docker compose stop postgres",
            "docker compose start postgres",
            "scripts/deployment_smoke.py",
            "--expected-revision \"$EXPECTED_REVISION\"",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.drill)

    def test_drill_does_not_contain_destructive_volume_command(self) -> None:
        executable_lines = [
            line.strip()
            for block in bash_blocks(self.drill)
            for line in block.splitlines()
            if line.strip().startswith("docker compose")
        ]
        for line in executable_lines:
            self.assertFalse(
                re.search(r"\bdown\b.*(?:-v|--volumes)", line),
                f"destructive volume command in drill: {line}",
            )


if __name__ == "__main__":
    unittest.main()
