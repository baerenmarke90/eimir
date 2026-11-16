"""Move sensitive values from legacy plain columns into protected payloads (#797).

Some values predate the protected-payload boundary and were stored in ordinary
columns, where encryption at rest does not reach them. Each ``ColumnMove`` names
such columns and the payload that is now their home.

New writes already store the value in the payload and leave the column NULL.
Rows written earlier keep it in the column until this module has visited them.
Readers therefore take the payload value first and fall back to the column.

A migration cannot do this work: Alembic runs without the encryption keys and
cannot seal a payload. It runs where the keys are, in the worker (a maintenance
job that repeats until nothing is left) and on demand through
``python -m eimir.security migrate-columns``.

Every row is converted by one guarded ``UPDATE`` that writes the merged payload
and clears the columns together, so a crash leaves a row wholly old or wholly
new. The guard (``payload = <value that was read>``) lets a concurrent
application write win. The row's ``version`` and ``updated_at`` are deliberately
not touched: a person did not change anything, and clients holding the current
version must not run into a conflict.

No function returns or logs content. Reports contain table names and counts.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import CursorResult, func, select, text
from sqlalchemy.orm import Session

from eimir.domain.payload import ProtectedPayload
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.security.errors import EncryptionError
from eimir.security.payload_envelope import PayloadProtector
from eimir.security.runtime import get_payload_protector

log = logging.getLogger(__name__)

JOB_KIND = "security_column_moves"
BATCH_SIZE = 200
# After a pass that left rows behind (unreadable or concurrently written).
RETRY_INTERVAL = timedelta(hours=6)
_LOCK_KEY = 7_970_146


@dataclass(frozen=True)
class ColumnMove:
    """Legacy plain columns of one table whose values belong in its payload.

    Each column name is also the payload field it moves into.
    """

    table: str
    payload_type: type[ProtectedPayload]
    columns: tuple[str, ...]
    # Extra assignments of plain, non-sensitive columns that must follow the move.
    also_set: str = ""

    @property
    def pending_filter(self) -> str:
        return " OR ".join(f"{column} IS NOT NULL" for column in self.columns)


def moves() -> tuple[ColumnMove, ...]:
    """Every registered move. Imported lazily: the models import this package."""
    from eimir.places.models import PlacePayload
    from eimir.profiles.models import ProfilePreferencePayload

    return (
        ColumnMove(
            "places",
            PlacePayload,
            ("latitude", "longitude"),
            also_set="has_coordinates = TRUE",
        ),
        ColumnMove("profile_preferences", ProfilePreferencePayload, ("topic",)),
    )


@dataclass
class MoveResult:
    converted: int = 0
    skipped_concurrent: int = 0
    # Rows whose payload could not be opened or whose merged form is invalid.
    failed: int = 0

    def merge(self, other: MoveResult) -> None:
        self.converted += other.converted
        self.skipped_concurrent += other.skipped_concurrent
        self.failed += other.failed


def pending(session: Session) -> dict[str, int]:
    """Rows per table that still hold a value in a legacy column. Needs no key."""
    return {
        move.table: int(
            session.execute(
                text(f"SELECT count(*) FROM {move.table} WHERE {move.pending_filter}")
            ).scalar_one()
        )
        for move in moves()
    }


def _move_batch(
    session: Session,
    protector: PayloadProtector,
    move: ColumnMove,
    *,
    after: UUID | None,
    limit: int,
) -> tuple[MoveResult, UUID | None]:
    """Convert up to ``limit`` rows after ``after``; return the last id visited."""
    context = move.payload_type.crypto_context()
    columns = ", ".join(move.columns)
    rows = session.execute(
        text(
            f"SELECT id, payload, {columns} FROM {move.table} "
            f"WHERE ({move.pending_filter}) "
            "AND (CAST(:after AS uuid) IS NULL OR id > CAST(:after AS uuid)) "
            "ORDER BY id LIMIT :limit"
        ),
        {"after": after, "limit": limit},
    ).all()
    cleared = ", ".join(f"{column} = NULL" for column in move.columns)
    extra = f", {move.also_set}" if move.also_set else ""
    update = text(
        f"UPDATE {move.table} SET payload = CAST(:new AS jsonb), crypto_version = :version, "
        f"{cleared}{extra} WHERE id = :id AND payload = CAST(:old AS jsonb)"
    )
    result = MoveResult()
    last: UUID | None = None
    for row in rows:
        row_id, stored = row[0], row[1]
        last = row_id
        try:
            merged = dict(protector.reveal(stored, context=context))
            for column, value in zip(move.columns, row[2:], strict=True):
                # A value already in the payload is newer than its legacy column.
                if value is not None and merged.get(column) is None:
                    merged[column] = value
            canonical = move.payload_type.unseal(merged).seal()
            sealed = protector.protect(canonical, context=context)
            # Verify before it can replace anything.
            if protector.reveal(sealed, context=context) != canonical:
                raise EncryptionError("Round-trip verification failed during a column move.")
        except (EncryptionError, ValidationError):
            result.failed += 1
            continue
        changed = cast(
            "CursorResult[Any]",
            session.execute(
                update,
                {
                    "id": row_id,
                    "old": json.dumps(stored),
                    "new": json.dumps(sealed),
                    "version": protector.write_crypto_version,
                },
            ),
        )
        if changed.rowcount > 0:
            result.converted += 1
        else:
            result.skipped_concurrent += 1
    return result, last if len(rows) == limit else None


def move_columns(
    session: Session,
    protector: PayloadProtector,
    *,
    batch_size: int = BATCH_SIZE,
) -> dict[str, MoveResult]:
    """Move every pending value. Commits per batch; safe to interrupt and to repeat."""
    results: dict[str, MoveResult] = {}
    for move in moves():
        result = results.setdefault(move.table, MoveResult())
        after: UUID | None = None
        while True:
            batch, after = _move_batch(session, protector, move, after=after, limit=batch_size)
            result.merge(batch)
            session.commit()
            if after is None:
                break
    return results


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(Job.kind == JOB_KIND, Job.status.in_([status.value for status in statuses]))
        ).scalar_one()
    )


def ensure_scheduled(session: Session) -> Job | None:
    """Queue the move job while legacy values remain and none is queued."""
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))
    if _open_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    if not any(pending(session).values()):
        return None
    return queue.enqueue(session, JOB_KIND)


def handle_moves(session: Session, payload: dict[str, Any]) -> None:
    """Convert one batch per table inside the job's own transaction.

    The job continues itself: immediately while a table has more rows after the
    cursor, later when a pass ended with rows it could not convert.
    """
    protector = get_payload_protector()
    stored_cursors = payload.get("after")
    cursors: dict[str, Any] = stored_cursors if isinstance(stored_cursors, dict) else {}
    next_cursors: dict[str, str] = {}
    totals = MoveResult()
    for move in moves():
        raw = cursors.get(move.table)
        result, last = _move_batch(
            session,
            protector,
            move,
            after=UUID(raw) if isinstance(raw, str) else None,
            limit=BATCH_SIZE,
        )
        totals.merge(result)
        if last is not None:
            next_cursors[move.table] = str(last)
    session.flush()
    log.info(
        "column move batch completed",
        extra={
            "converted": totals.converted,
            "skipped_concurrent": totals.skipped_concurrent,
            "failed": totals.failed,
        },
    )
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))
    if _open_jobs(session, JobStatus.PENDING):
        return
    if next_cursors:
        queue.enqueue(session, JOB_KIND, {"after": next_cursors})
    elif any(pending(session).values()):
        queue.enqueue(session, JOB_KIND, delay=RETRY_INTERVAL)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_moves)
