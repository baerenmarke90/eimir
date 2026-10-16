"""Forward-only Account deletion tombstones stored outside the application database.

The application database cannot be the only deletion authority because a restore
from an older backup can predate the deletion row. This module provides the
minimal append-only journal required by #520. It deliberately contains only a
stable instance UUID, Account UUID, acceptance timestamp, and hash-chain
integrity metadata.

The journal is a recovery primitive, not a user export and not a second domain
database. Callers must protect it independently from point-in-time application
backups and keep it for at least the supported backup-retention horizon.
"""

from __future__ import annotations

import fcntl
import hashlib
import hmac
import json
import os
import stat
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final
from uuid import UUID

JOURNAL_FORMAT: Final = "eimir-account-deletion-journal"
LEGACY_JOURNAL_FORMAT: Final = "sidebyside-account-deletion-journal"
JOURNAL_VERSION: Final = 1
_HEADER_TYPE: Final = "HEADER"
_TOMBSTONE_TYPE: Final = "ACCOUNT_DELETION"
_GENESIS_DIGEST: Final = "0" * 64
_MAX_LINE_BYTES: Final = 4096
_HEADER_KEYS: Final = frozenset({"format", "formatVersion", "instanceId", "type"})
_TOMBSTONE_KEYS: Final = frozenset(
    {
        "acceptedAt",
        "accountId",
        "digest",
        "formatVersion",
        "instanceId",
        "previousDigest",
        "type",
    }
)


class DeletionJournalError(RuntimeError):
    """The deletion journal is absent, corrupt, or inconsistent."""


@dataclass(frozen=True, slots=True)
class DeletionTombstone:
    """Minimal irreversible Account-deletion acceptance record."""

    instance_id: UUID
    account_id: UUID
    accepted_at: datetime
    previous_digest: str
    digest: str


def _canonical_json(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode(
        "ascii"
    )


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Deletion acceptance time must be timezone-aware.")
    return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise DeletionJournalError("Deletion journal contains an invalid acceptance timestamp.")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise DeletionJournalError(
            "Deletion journal contains an invalid acceptance timestamp."
        ) from exc
    if parsed.tzinfo is None or parsed.utcoffset() != UTC.utcoffset(parsed):
        raise DeletionJournalError("Deletion journal acceptance timestamps must be UTC.")
    if _timestamp(parsed) != value:
        raise DeletionJournalError(
            "Deletion journal contains a non-canonical acceptance timestamp."
        )
    return parsed


def _parse_uuid(value: object, *, field: str) -> UUID:
    if not isinstance(value, str):
        raise DeletionJournalError(f"Deletion journal contains an invalid {field}.")
    try:
        parsed = UUID(value)
    except ValueError as exc:
        raise DeletionJournalError(f"Deletion journal contains an invalid {field}.") from exc
    if str(parsed) != value:
        raise DeletionJournalError(f"Deletion journal contains a non-canonical {field}.")
    return parsed


def _decode_line(raw_line: bytes) -> dict[str, Any]:
    if len(raw_line) > _MAX_LINE_BYTES:
        raise DeletionJournalError("Deletion journal record exceeds the maximum safe size.")
    if not raw_line.endswith(b"\n"):
        raise DeletionJournalError("Deletion journal contains a truncated final record.")
    try:
        decoded = raw_line.decode("utf-8")
        value = json.loads(decoded)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DeletionJournalError("Deletion journal contains invalid JSON.") from exc
    if not isinstance(value, dict):
        raise DeletionJournalError("Deletion journal records must be JSON objects.")
    return value


def _digest(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(payload)).hexdigest()


def _write_all(descriptor: int, payload: bytes) -> None:
    """Write a complete record or fail without treating a short write as success."""
    offset = 0
    while offset < len(payload):
        written = os.write(descriptor, payload[offset:])
        if written <= 0:
            raise OSError("short write")
        offset += written


class DeletionJournal:
    """Append-only, hash-chained deletion journal for one eimir. instance."""

    def __init__(self, path: Path, *, instance_id: UUID) -> None:
        self.path = path
        self.instance_id = instance_id

    @classmethod
    def initialize(cls, path: Path, *, instance_id: UUID) -> DeletionJournal:
        """Create a new empty journal without ever overwriting an existing one."""
        resolved = path.absolute()
        parent = resolved.parent
        if not parent.is_dir():
            raise DeletionJournalError("Deletion journal directory does not exist.")

        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(resolved, flags, 0o600)
        except FileExistsError as exc:
            raise DeletionJournalError("Deletion journal already exists.") from exc
        except OSError as exc:
            raise DeletionJournalError("Deletion journal could not be created.") from exc

        header = {
            "format": JOURNAL_FORMAT,
            "formatVersion": JOURNAL_VERSION,
            "instanceId": str(instance_id),
            "type": _HEADER_TYPE,
        }
        try:
            _write_all(descriptor, _canonical_json(header) + b"\n")
            os.fsync(descriptor)
        except OSError as exc:
            try:
                os.close(descriptor)
            finally:
                resolved.unlink(missing_ok=True)
            raise DeletionJournalError("Deletion journal initialization failed.") from exc
        else:
            os.close(descriptor)

        try:
            directory_descriptor = os.open(parent, os.O_RDONLY)
        except OSError as exc:
            resolved.unlink(missing_ok=True)
            raise DeletionJournalError(
                "Deletion journal directory could not be synchronized."
            ) from exc
        try:
            os.fsync(directory_descriptor)
        except OSError as exc:
            resolved.unlink(missing_ok=True)
            raise DeletionJournalError(
                "Deletion journal directory synchronization failed."
            ) from exc
        finally:
            os.close(directory_descriptor)

        journal = cls(resolved, instance_id=instance_id)
        journal.read_all()
        return journal

    def _open_locked(self, *, writable: bool) -> int:
        descriptor: int | None = None
        flags = os.O_RDWR | os.O_APPEND if writable else os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(self.path, flags)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                raise DeletionJournalError("Deletion journal must be a regular file.")
            lock_mode = fcntl.LOCK_EX if writable else fcntl.LOCK_SH
            fcntl.flock(descriptor, lock_mode)
            return descriptor
        except DeletionJournalError:
            if descriptor is not None:
                os.close(descriptor)
            raise
        except OSError as exc:
            if descriptor is not None:
                os.close(descriptor)
            raise DeletionJournalError("Deletion journal could not be opened safely.") from exc

    def _read_locked(self, descriptor: int) -> list[DeletionTombstone]:
        try:
            os.lseek(descriptor, 0, os.SEEK_SET)
            source = os.fdopen(os.dup(descriptor), "rb")
        except OSError as exc:
            raise DeletionJournalError("Deletion journal could not be read.") from exc

        with source:
            header_line = source.readline(_MAX_LINE_BYTES + 1)
            if not header_line:
                raise DeletionJournalError("Deletion journal is missing its header.")
            header = _decode_line(header_line)
            if frozenset(header) != _HEADER_KEYS:
                raise DeletionJournalError("Deletion journal header has an unexpected schema.")
            if (
                header.get("format") not in {JOURNAL_FORMAT, LEGACY_JOURNAL_FORMAT}
                or header.get("formatVersion") != JOURNAL_VERSION
                or header.get("type") != _HEADER_TYPE
            ):
                raise DeletionJournalError("Deletion journal header format is unsupported.")
            header_instance = _parse_uuid(header.get("instanceId"), field="instance identifier")
            if header_instance != self.instance_id:
                raise DeletionJournalError("Deletion journal belongs to a different instance.")

            records: list[DeletionTombstone] = []
            seen_accounts: set[UUID] = set()
            expected_previous = _GENESIS_DIGEST
            while raw_line := source.readline(_MAX_LINE_BYTES + 1):
                payload = _decode_line(raw_line)
                if frozenset(payload) != _TOMBSTONE_KEYS:
                    raise DeletionJournalError(
                        "Deletion journal tombstone has an unexpected schema."
                    )
                if (
                    payload.get("formatVersion") != JOURNAL_VERSION
                    or payload.get("type") != _TOMBSTONE_TYPE
                ):
                    raise DeletionJournalError("Deletion journal tombstone format is unsupported.")

                instance_id = _parse_uuid(payload.get("instanceId"), field="instance identifier")
                account_id = _parse_uuid(payload.get("accountId"), field="Account identifier")
                accepted_at = _parse_timestamp(payload.get("acceptedAt"))
                previous_digest = payload.get("previousDigest")
                stored_digest = payload.get("digest")
                if not isinstance(previous_digest, str) or previous_digest != expected_previous:
                    raise DeletionJournalError("Deletion journal hash chain is broken.")
                if not isinstance(stored_digest, str) or len(stored_digest) != 64:
                    raise DeletionJournalError(
                        "Deletion journal contains an invalid integrity digest."
                    )
                if instance_id != self.instance_id:
                    raise DeletionJournalError(
                        "Deletion journal tombstone belongs to another instance."
                    )
                if account_id in seen_accounts:
                    raise DeletionJournalError(
                        "Deletion journal contains a duplicate Account tombstone."
                    )

                unsigned = dict(payload)
                del unsigned["digest"]
                calculated = _digest(unsigned)
                if not hmac.compare_digest(stored_digest, calculated):
                    raise DeletionJournalError("Deletion journal integrity validation failed.")

                records.append(
                    DeletionTombstone(
                        instance_id=instance_id,
                        account_id=account_id,
                        accepted_at=accepted_at,
                        previous_digest=previous_digest,
                        digest=stored_digest,
                    )
                )
                seen_accounts.add(account_id)
                expected_previous = stored_digest
            return records

    def read_all(self) -> tuple[DeletionTombstone, ...]:
        """Validate the complete journal and return tombstones in acceptance order."""
        descriptor = self._open_locked(writable=False)
        try:
            return tuple(self._read_locked(descriptor))
        finally:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            finally:
                os.close(descriptor)

    def accept(self, account_id: UUID, *, accepted_at: datetime) -> DeletionTombstone:
        """Durably accept one Account deletion, idempotently by Account UUID."""
        normalized_timestamp = _timestamp(accepted_at)
        descriptor = self._open_locked(writable=True)
        try:
            records = self._read_locked(descriptor)
            for record in records:
                if record.account_id == account_id:
                    return record

            previous_digest = records[-1].digest if records else _GENESIS_DIGEST
            unsigned = {
                "acceptedAt": normalized_timestamp,
                "accountId": str(account_id),
                "formatVersion": JOURNAL_VERSION,
                "instanceId": str(self.instance_id),
                "previousDigest": previous_digest,
                "type": _TOMBSTONE_TYPE,
            }
            digest = _digest(unsigned)
            payload = dict(unsigned)
            payload["digest"] = digest
            encoded = _canonical_json(payload) + b"\n"
            try:
                _write_all(descriptor, encoded)
                os.fsync(descriptor)
            except OSError as exc:
                raise DeletionJournalError(
                    "Deletion tombstone could not be durably recorded."
                ) from exc

            return DeletionTombstone(
                instance_id=self.instance_id,
                account_id=account_id,
                accepted_at=_parse_timestamp(normalized_timestamp),
                previous_digest=previous_digest,
                digest=digest,
            )
        finally:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            finally:
                os.close(descriptor)
