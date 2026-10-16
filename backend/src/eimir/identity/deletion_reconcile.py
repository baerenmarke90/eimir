"""Replay forward Account-deletion tombstones into the current database state."""

from __future__ import annotations

import argparse
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path
from uuid import UUID

from eimir.identity.deletion import (
    DeletionAcceptanceConflictError,
    DeletionNotAcceptedError,
)
from eimir.identity.deletion_journal import (
    DeletionJournal,
    DeletionJournalError,
    DeletionTombstone,
)
from eimir.identity.deletion_lifecycle import (
    DeletionAsyncCleanupError,
    DeletionCompletionError,
    DeletionMediaCleanupError,
    converge_accepted_deletion,
)


def reconcile_tombstones(tombstones: Sequence[DeletionTombstone]) -> int:
    """Re-apply validated deletions through the authoritative lifecycle workflow."""
    for tombstone in tombstones:
        converge_accepted_deletion(
            tombstone.account_id,
            accepted_at=tombstone.accepted_at,
        )
    return len(tombstones)


def reconcile(journal_path: Path, *, instance_id: UUID) -> int:
    """Load one protected journal file and re-apply every accepted deletion."""
    tombstones = DeletionJournal(journal_path, instance_id=instance_id).read_all()
    return reconcile_tombstones(tombstones)


def reconcile_bytes(journal_bytes: bytes, *, instance_id: UUID) -> int:
    """Validate a protected journal snapshot delivered over stdin."""
    with tempfile.NamedTemporaryFile(prefix="eimir-deletion-journal-", suffix=".jsonl") as snapshot:
        snapshot.write(journal_bytes)
        snapshot.flush()
        tombstones = DeletionJournal(Path(snapshot.name), instance_id=instance_id).read_all()
    return reconcile_tombstones(tombstones)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Re-apply the protected Account-deletion reconciliation journal "
            "before API or worker traffic resumes."
        )
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--journal", type=Path)
    source.add_argument(
        "--journal-stdin",
        action="store_true",
        help="Read the complete protected journal snapshot from standard input",
    )
    parser.add_argument(
        "--confirm-instance-id",
        type=UUID,
        required=True,
        help="Stable instance UUID expected by the protected journal",
    )
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.journal_stdin:
            count = reconcile_bytes(
                sys.stdin.buffer.read(),
                instance_id=args.confirm_instance_id,
            )
        else:
            count = reconcile(args.journal, instance_id=args.confirm_instance_id)
    except (
        DeletionJournalError,
        DeletionAcceptanceConflictError,
        DeletionNotAcceptedError,
        DeletionMediaCleanupError,
        DeletionAsyncCleanupError,
        DeletionCompletionError,
    ):
        # Deliberately do not echo journal contents, identifiers, database
        # values or raw exception prose into operator logs.
        print("Account deletion reconciliation rejected an inconsistent recovery state.")
        return 1
    print(f"Account deletion reconciliation completed for {count} tombstone(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
