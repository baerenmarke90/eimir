#!/usr/bin/env python3
"""Migrate and replay the protected deletion journal before restored writers start."""

from __future__ import annotations

import argparse
from pathlib import Path
from uuid import UUID

try:
    from scripts.self_hosted_recovery import (
        TRANSIENT_WRITER_SERVICES,
        WRITER_SERVICES,
        ComposeTarget,
        RecoveryError,
        _require_postgres,
        _run,
    )
except ModuleNotFoundError as exc:
    if exc.name != "scripts":
        raise
    from self_hosted_recovery import (  # type: ignore[no-redef]
        TRANSIENT_WRITER_SERVICES,
        WRITER_SERVICES,
        ComposeTarget,
        RecoveryError,
        _require_postgres,
        _run,
    )


def reconcile_restored_target(
    target: ComposeTarget,
    *,
    journal_path: Path,
    instance_id: UUID,
) -> None:
    """Upgrade schema and replay tombstones while all normal writers are stopped."""
    _require_postgres(target)
    running = target.running_services()
    unsafe = (WRITER_SERVICES | TRANSIENT_WRITER_SERVICES).intersection(running)
    if unsafe:
        raise RecoveryError(
            "API, worker, migration, and demo initialization must be stopped before reconciliation."
        )

    try:
        journal = journal_path.resolve(strict=True)
    except OSError as exc:
        raise RecoveryError("The protected deletion journal does not exist.") from exc
    if not journal.is_file():
        raise RecoveryError("The protected deletion journal is not a regular file.")
    try:
        journal_bytes = journal.read_bytes()
    except OSError as exc:
        raise RecoveryError("The protected deletion journal could not be read.") from exc

    # Required restore ordering: old backup -> current schema -> current forward
    # journal -> fail-closed replay. Normal API/worker traffic remains stopped.
    _run(target.compose_command("run", "--rm", "--no-deps", "-T", "migrate"))
    _run(
        target.compose_command(
            "run",
            "--rm",
            "--no-deps",
            "-T",
            "api",
            "python",
            "-m",
            "eimir.identity.deletion_reconcile",
            "--journal-stdin",
            "--confirm-instance-id",
            str(instance_id),
        ),
        input_bytes=journal_bytes,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the mandatory post-restore Account-deletion reconciliation "
            "before API/worker startup."
        )
    )
    parser.add_argument("--compose-file", type=Path, default=Path("compose.yaml"))
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--journal", type=Path, required=True)
    parser.add_argument("--confirm-instance-id", type=UUID, required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        target = ComposeTarget.load(
            compose_file=args.compose_file,
            env_file=args.env_file,
            confirmed_project=args.confirm_project,
        )
        reconcile_restored_target(
            target,
            journal_path=args.journal,
            instance_id=args.confirm_instance_id,
        )
    except RecoveryError as exc:
        print(f"Deletion reconciliation failed: {exc}")
        return 1
    print(
        "Deletion reconciliation completed with normal writers still stopped. "
        "Continue the documented recovery verification before starting the application."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
