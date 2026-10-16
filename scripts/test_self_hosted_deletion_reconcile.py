"""Focused tests for the post-restore deletion reconciliation guard."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from scripts import self_hosted_deletion_reconcile
from scripts.self_hosted_recovery import RecoveryError

INSTANCE_ID = UUID("01990000-0000-7000-8000-000000000901")


class FakeTarget:
    def __init__(self, running: set[str] | None = None) -> None:
        self._running = running or set()

    def running_services(self) -> set[str]:
        return set(self._running)

    def compose_command(self, *arguments: str) -> list[str]:
        return ["docker", "compose", *arguments]


class DeletionReconcileGuardTest(unittest.TestCase):
    @patch.object(self_hosted_deletion_reconcile, "_require_postgres")
    def test_running_writer_is_rejected(self, require_postgres) -> None:  # type: ignore[no-untyped-def]
        target = FakeTarget({"api"})
        with tempfile.TemporaryDirectory() as temp_name:
            journal = Path(temp_name) / "journal.jsonl"
            journal.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(RecoveryError, "must be stopped"):
                self_hosted_deletion_reconcile.reconcile_restored_target(
                    target,  # type: ignore[arg-type]
                    journal_path=journal,
                    instance_id=INSTANCE_ID,
                )
        require_postgres.assert_called_once()

    @patch.object(self_hosted_deletion_reconcile, "_require_postgres")
    def test_missing_journal_is_rejected_before_commands(self, require_postgres) -> None:  # type: ignore[no-untyped-def]
        target = FakeTarget()
        with tempfile.TemporaryDirectory() as temp_name:
            with patch.object(self_hosted_deletion_reconcile, "_run") as run_command:
                with self.assertRaisesRegex(RecoveryError, "does not exist"):
                    self_hosted_deletion_reconcile.reconcile_restored_target(
                        target,  # type: ignore[arg-type]
                        journal_path=Path(temp_name) / "missing.jsonl",
                        instance_id=INSTANCE_ID,
                    )
                run_command.assert_not_called()
        require_postgres.assert_called_once()

    @patch.object(self_hosted_deletion_reconcile, "_require_postgres")
    def test_migration_precedes_stdin_journal_replay(self, require_postgres) -> None:  # type: ignore[no-untyped-def]
        target = FakeTarget()
        journal_bytes = b"protected-journal-snapshot\n"
        with tempfile.TemporaryDirectory() as temp_name:
            journal = Path(temp_name) / "journal.jsonl"
            journal.write_bytes(journal_bytes)
            with patch.object(self_hosted_deletion_reconcile, "_run") as run_command:
                self_hosted_deletion_reconcile.reconcile_restored_target(
                    target,  # type: ignore[arg-type]
                    journal_path=journal,
                    instance_id=INSTANCE_ID,
                )

        self.assertEqual(run_command.call_count, 2)
        first_call, second_call = run_command.call_args_list
        first = first_call.args[0]
        second = second_call.args[0]
        self.assertIn("migrate", first)
        self.assertIn("-T", first)
        self.assertIn("eimir.identity.deletion_reconcile", second)
        self.assertIn("--journal-stdin", second)
        self.assertIn(str(INSTANCE_ID), second)
        self.assertNotIn("--volume", second)
        self.assertNotIn(str(journal), second)
        self.assertEqual(second_call.kwargs, {"input_bytes": journal_bytes})
        require_postgres.assert_called_once()


if __name__ == "__main__":
    unittest.main()
