"""Migration, rotation, and verification of encrypted content (issue #797).

Everything here is resumable and idempotent:

- A payload row is converted by ONE guarded ``UPDATE`` that swaps the plaintext
  JSON for its envelope and sets ``crypto_version`` together. A crash leaves each
  row wholly plaintext or wholly encrypted; a re-run picks up the rest. The
  guard (``payload = <value that was read>``) makes a concurrent application
  write win instead of being overwritten.
- A media object is replaced by one atomic object write of the finished
  ciphertext (``EncryptingMediaStore.encrypt_legacy``).
- Rotation re-wraps data keys only; payload and media bodies are not rewritten.

No function returns or logs content. Reports contain table names, counts, and
key ids only.
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, Engine, Table, text
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import TextClause

from eimir.db.base import Base
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.db.registry import load_all_models
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.media.encrypted import EncryptingMediaStore
from eimir.security.errors import EncryptionError
from eimir.security.keyring import EncryptionMode, KeyWrapper
from eimir.security.payload_envelope import MARKER, PayloadProtector

DEFAULT_BATCH_SIZE = 200


@dataclass(frozen=True)
class PayloadTable:
    table: Table
    payload_type: type[Any]

    @property
    def name(self) -> str:
        return self.table.name

    @property
    def context(self) -> str:
        return str(self.payload_type.crypto_context())


def payload_tables() -> list[PayloadTable]:
    """Every table with a ``ProtectedPayloadJSON`` column, discovered from the metadata."""
    load_all_models()
    found: list[PayloadTable] = []
    for table in sorted(Base.metadata.tables.values(), key=lambda item: item.name):
        column = table.columns.get("payload")
        if column is None or "crypto_version" not in table.columns:
            continue
        if isinstance(column.type, ProtectedPayloadJSON):
            found.append(PayloadTable(table, column.type.payload_type))
    return found


@dataclass
class TableReport:
    table: str
    by_crypto_version: Counter[int] = field(default_factory=Counter)
    by_key_id: Counter[str] = field(default_factory=Counter)
    inconsistent: int = 0

    @property
    def plaintext(self) -> int:
        return self.by_crypto_version.get(CRYPTO_VERSION_PLAINTEXT, 0)


def payload_status(session: Session) -> list[TableReport]:
    """Count rows per scheme and key id. Needs no key and reads no content."""
    reports: list[TableReport] = []
    for entry in payload_tables():
        report = TableReport(entry.name)
        rows = session.execute(
            text(
                f"SELECT crypto_version, payload->>'kid', "
                f"((payload ? '{MARKER}') <> (crypto_version = {CRYPTO_VERSION_SERVER_AEAD})), "
                f"count(*) FROM {entry.name} GROUP BY 1, 2, 3"
            )
        ).all()
        for crypto_version, key_id, mismatch, count in rows:
            report.by_crypto_version[int(crypto_version)] += count
            if key_id is not None:
                report.by_key_id[key_id] += count
            if mismatch:
                report.inconsistent += count
        reports.append(report)
    return reports


@dataclass
class BatchResult:
    converted: int = 0
    skipped_concurrent: int = 0

    def merge(self, other: BatchResult) -> None:
        self.converted += other.converted
        self.skipped_concurrent += other.skipped_concurrent


def _keyed_batches(
    session: Session,
    entry: PayloadTable,
    where: str,
    batch_size: int,
    parameters: dict[str, Any] | None = None,
) -> Iterator[list[tuple[UUID, dict[str, Any]]]]:
    last: UUID | None = None
    while True:
        rows = session.execute(
            text(
                f"SELECT id, payload FROM {entry.name} "
                f"WHERE {where} AND (CAST(:last AS uuid) IS NULL OR id > CAST(:last AS uuid)) "
                "ORDER BY id LIMIT :limit"
            ),
            {**(parameters or {}), "last": last, "limit": batch_size},
        ).all()
        if not rows:
            return
        last = rows[-1][0]
        yield [(row[0], row[1]) for row in rows]


_GUARDED_UPDATE = (
    "UPDATE {table} SET payload = CAST(:new AS jsonb), crypto_version = :version "
    "WHERE id = :id AND payload = CAST(:old AS jsonb)"
)


def _swap_payload(
    session: Session,
    update: TextClause,
    row_id: UUID,
    old: dict[str, Any],
    new: dict[str, Any],
) -> bool:
    """Run the guarded swap; ``False`` means the row changed since it was read."""
    result = cast(
        "CursorResult[Any]",
        session.execute(
            update,
            {
                "id": row_id,
                "old": json.dumps(old),
                "new": json.dumps(new),
                "version": CRYPTO_VERSION_SERVER_AEAD,
            },
        ),
    )
    return result.rowcount > 0


def migrate_payloads(
    session: Session,
    wrapper: KeyWrapper,
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> dict[str, BatchResult]:
    """Encrypt every legacy plaintext row. Safe to interrupt and to repeat."""
    protector = PayloadProtector(EncryptionMode.MIGRATING, wrapper)
    results: dict[str, BatchResult] = {}
    for entry in payload_tables():
        result = results.setdefault(entry.name, BatchResult())
        where = f"crypto_version = {CRYPTO_VERSION_PLAINTEXT} AND NOT (payload ? '{MARKER}')"
        update = text(_GUARDED_UPDATE.format(table=entry.name))
        for batch in _keyed_batches(session, entry, where, batch_size):
            for row_id, old in batch:
                sealed = protector.protect(old, context=entry.context)
                # Verify before it can replace anything.
                if protector.reveal(sealed, context=entry.context) != old:
                    raise EncryptionError("Round-trip verification failed during migration.")
                changed = _swap_payload(session, update, row_id, old, sealed)
                if changed:
                    result.converted += 1
                else:
                    result.skipped_concurrent += 1
            session.commit()
    return results


def rewrap_payloads(
    session: Session,
    wrapper: KeyWrapper,
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> dict[str, BatchResult]:
    """Re-wrap data keys of rows still under a non-active KEK. Payloads are untouched."""
    protector = PayloadProtector(EncryptionMode.REQUIRED, wrapper)
    results: dict[str, BatchResult] = {}
    for entry in payload_tables():
        result = results.setdefault(entry.name, BatchResult())
        where = f"payload ? '{MARKER}' AND payload->>'kid' <> :active"
        update = text(_GUARDED_UPDATE.format(table=entry.name))
        for batch in _keyed_batches(
            session, entry, where, batch_size, {"active": wrapper.active_key_id}
        ):
            for row_id, old in batch:
                rewrapped = protector.rewrap(old, context=entry.context)
                if rewrapped is None:
                    continue
                changed = _swap_payload(session, update, row_id, old, rewrapped)
                if changed:
                    result.converted += 1
                else:
                    result.skipped_concurrent += 1
            session.commit()
    return results


@dataclass
class VerifyReport:
    checked: Counter[str] = field(default_factory=Counter)
    unreadable: Counter[str] = field(default_factory=Counter)
    plaintext: Counter[str] = field(default_factory=Counter)
    inconsistent: Counter[str] = field(default_factory=Counter)

    @property
    def ok(self) -> bool:
        return not (self.unreadable or self.inconsistent)


def verify_payloads(
    session: Session,
    wrapper: KeyWrapper,
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> VerifyReport:
    """Authenticate and schema-validate every row. Content is never returned or logged."""
    protector = PayloadProtector(EncryptionMode.MIGRATING, wrapper)
    report = VerifyReport()
    statuses = {status.table: status for status in payload_status(session)}
    for entry in payload_tables():
        for batch in _keyed_batches(session, entry, "TRUE", batch_size):
            for _, stored in batch:
                report.checked[entry.name] += 1
                if MARKER not in stored:
                    report.plaintext[entry.name] += 1
                try:
                    entry.payload_type.model_validate(
                        protector.reveal(stored, context=entry.context)
                    )
                except Exception:
                    report.unreadable[entry.name] += 1
        if statuses[entry.name].inconsistent:
            report.inconsistent[entry.name] = statuses[entry.name].inconsistent
    return report


@dataclass
class MediaResult:
    encrypted: int = 0
    already_encrypted: int = 0
    # Candidate storage homes holding no object. An attachment lives in exactly one
    # of its (up to) two possible homes, so a non-zero count is normal.
    absent: int = 0
    rewrapped: int = 0
    current: int = 0
    unreadable: int = 0


def _attachment_keys(session: Session) -> Iterator[str]:
    from eimir.media.base import build_account_storage_key, build_storage_key

    rows = session.execute(
        text("SELECT id, space_id, owner_id, has_thumbnail FROM attachments ORDER BY id")
    ).all()
    for attachment_id, space_id, owner_id, has_thumbnail in rows:
        variants = ["original", "thumbnail"] if has_thumbnail else ["original"]
        for variant in variants:
            # An attachment has at most two possible homes; see storage_homes_for.
            if space_id is not None:
                yield build_storage_key(space_id, attachment_id, variant)
            yield build_account_storage_key(owner_id, attachment_id, variant)


def migrate_media(session: Session, store: EncryptingMediaStore) -> MediaResult:
    """Encrypt every legacy plaintext media object referenced by an attachment row."""
    result = MediaResult()
    for key in _attachment_keys(session):
        if not store.exists(key):
            result.absent += 1
        elif store.encrypt_legacy(key):
            result.encrypted += 1
        else:
            result.already_encrypted += 1
    return result


def rewrap_media(session: Session, store: EncryptingMediaStore) -> MediaResult:
    result = MediaResult()
    for key in _attachment_keys(session):
        if not store.exists(key):
            result.absent += 1
        elif store.rewrap(key):
            result.rewrapped += 1
        else:
            result.current += 1
    return result


def verify_media(session: Session, store: EncryptingMediaStore) -> MediaResult:
    """Authenticate every object end to end without keeping or printing any byte."""
    result = MediaResult()
    for key in _attachment_keys(session):
        if not store.exists(key):
            result.absent += 1
            continue
        try:
            with store.open(key) as handle:
                while handle.read(1 << 20):
                    pass
        except EncryptionError:
            result.unreadable += 1
        else:
            if store.is_encrypted(key):
                result.already_encrypted += 1
            else:
                result.current += 1  # readable legacy plaintext (migrating mode)
    return result


def engine_session(engine: Engine) -> Session:
    return Session(engine)
