"""Restore-safe Account deletion tombstone journal."""

from __future__ import annotations

import json
import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from eimir.identity.deletion_journal import (
    JOURNAL_FORMAT,
    JOURNAL_VERSION,
    LEGACY_JOURNAL_FORMAT,
    DeletionJournal,
    DeletionJournalError,
)


def _initialize(tmp_path: Path) -> tuple[DeletionJournal, UUID, Path]:
    instance_id = uuid4()
    path = tmp_path / "account-deletions.v1.jsonl"
    return DeletionJournal.initialize(path, instance_id=instance_id), instance_id, path


def test_initialize_creates_self_identifying_operator_only_journal(tmp_path: Path) -> None:
    journal, instance_id, path = _initialize(tmp_path)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0]) == {
        "format": JOURNAL_FORMAT,
        "formatVersion": JOURNAL_VERSION,
        "instanceId": str(instance_id),
        "type": "HEADER",
    }
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert journal.read_all() == ()


def test_accept_is_append_only_hash_chained_and_idempotent(tmp_path: Path) -> None:
    journal, instance_id, _ = _initialize(tmp_path)
    first_account = uuid4()
    second_account = uuid4()
    accepted_at = datetime(2026, 9, 4, 18, 0, tzinfo=UTC)

    first = journal.accept(first_account, accepted_at=accepted_at)
    repeated = journal.accept(first_account, accepted_at=accepted_at + timedelta(days=1))
    second = journal.accept(second_account, accepted_at=accepted_at + timedelta(seconds=1))

    assert repeated == first
    assert first.instance_id == instance_id
    assert first.account_id == first_account
    assert first.accepted_at == accepted_at
    assert second.previous_digest == first.digest
    assert tuple(record.account_id for record in journal.read_all()) == (
        first_account,
        second_account,
    )


def test_read_all_supports_read_only_recovery_mount(tmp_path: Path) -> None:
    journal, instance_id, path = _initialize(tmp_path)
    account_id = uuid4()
    journal.accept(account_id, accepted_at=datetime.now(UTC))
    path.chmod(0o400)

    recovered = DeletionJournal(path, instance_id=instance_id).read_all()

    assert tuple(record.account_id for record in recovered) == (account_id,)


def test_existing_legacy_journal_remains_readable_and_appendable(tmp_path: Path) -> None:
    _journal, instance_id, path = _initialize(tmp_path)
    header = json.loads(path.read_text(encoding="utf-8"))
    header["format"] = LEGACY_JOURNAL_FORMAT
    path.write_text(
        json.dumps(header, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    legacy_journal = DeletionJournal(path, instance_id=instance_id)

    legacy_journal.accept(uuid4(), accepted_at=datetime.now(UTC))

    assert len(legacy_journal.read_all()) == 1


def test_open_rejects_foreign_instance_identity(tmp_path: Path) -> None:
    journal, _, path = _initialize(tmp_path)
    journal.accept(uuid4(), accepted_at=datetime.now(UTC))

    foreign = DeletionJournal(path, instance_id=uuid4())
    with pytest.raises(DeletionJournalError, match="different instance"):
        foreign.read_all()


def test_integrity_validation_rejects_tampered_account_identifier(tmp_path: Path) -> None:
    journal, _, path = _initialize(tmp_path)
    account_id = uuid4()
    journal.accept(account_id, accepted_at=datetime.now(UTC))

    lines = path.read_text(encoding="utf-8").splitlines()
    tombstone = json.loads(lines[1])
    tombstone["accountId"] = str(uuid4())
    path.write_text(
        lines[0] + "\n" + json.dumps(tombstone, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(DeletionJournalError, match="integrity validation failed"):
        journal.read_all()


def test_truncated_final_record_fails_closed(tmp_path: Path) -> None:
    journal, _, path = _initialize(tmp_path)
    journal.accept(uuid4(), accepted_at=datetime.now(UTC))
    path.write_bytes(path.read_bytes().rstrip(b"\n"))

    with pytest.raises(DeletionJournalError, match="truncated final record"):
        journal.read_all()


def test_oversized_record_fails_closed_without_unbounded_line_read(tmp_path: Path) -> None:
    journal, _, path = _initialize(tmp_path)
    with path.open("ab") as target:
        target.write(b"{" + (b"x" * 5000) + b"}\n")

    with pytest.raises(DeletionJournalError, match="maximum safe size"):
        journal.read_all()


def test_accept_requires_timezone_aware_timestamp(tmp_path: Path) -> None:
    journal, _, _ = _initialize(tmp_path)

    with pytest.raises(ValueError, match="timezone-aware"):
        journal.accept(uuid4(), accepted_at=datetime(2026, 9, 4, 18, 0))
