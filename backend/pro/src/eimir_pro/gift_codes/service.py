"""Operator side of gift code batches (ServerAdmin part 5, design sections 5.1-5.3).

A batch is created with all its codes at once. Each code is stored encrypted
(``GiftCode.payload``) with its keyed ``lookup_hash``; the plain code never goes
into logs or problem details. A code's state is derived from its timestamps and
its batch, so revoking or expiring a batch needs no per-code bookkeeping beyond
``revoked_at``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, cast
from uuid import UUID

from sqlalchemy import ColumnElement, CursorResult, and_, case, delete, exists, func, or_, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core.errors import NotFoundError, ValidationError
from eimir_pro.gift_codes.codes import add_months, generate_code, lookup_hash
from eimir_pro.gift_codes.models import (
    DURATION_MONTHS,
    GiftCode,
    GiftCodeBatch,
    GiftCodePayload,
)

CodeState = Literal["open", "handed_out", "redeemed", "revoked", "expired"]

BATCH_SIZE_MAX = 100
NOTE_LENGTH_MAX = 120
REDEEMABLE_MONTHS_DEFAULT = 12
REDEEMABLE_MONTHS_MAX = 24
RETENTION_MONTHS = 24
"""A finished batch is kept this long after its last change (design section 5.3)."""
_GENERATION_ATTEMPTS = 20


class GiftCodeErrorCode:
    """Stable problem codes of the operator gift code routes."""

    BATCH_INVALID = "GIFT_CODE_BATCH_INVALID"
    BATCH_NOT_FOUND = "GIFT_CODE_BATCH_NOT_FOUND"
    NOT_FOUND = "GIFT_CODE_NOT_FOUND"
    NOT_OPEN = "GIFT_CODE_NOT_OPEN"
    ALREADY_REDEEMED = "GIFT_CODE_ALREADY_REDEEMED"


@dataclass(frozen=True)
class BatchSummary:
    """One batch with the number of its codes in each state."""

    id: UUID
    note: str | None
    duration_months: int
    redeemable_until: datetime
    created_at: datetime
    revoked_at: datetime | None
    total: int
    open: int
    handed_out: int
    redeemed: int
    revoked: int
    expired: int


def _invalid(detail: str) -> ValidationError:
    return ValidationError(detail, GiftCodeErrorCode.BATCH_INVALID)


def create_batch(
    session: Session,
    *,
    actor_id: UUID,
    count: int,
    duration_months: int,
    redeemable_until: datetime | None,
    note: str | None,
) -> GiftCodeBatch:
    """Create a batch of ``count`` fresh codes.

    The deadline defaults to twelve months from now and must fall on a later
    (UTC) day than today and at most 24 months ahead.
    """
    at = clock.now()
    if not 1 <= count <= BATCH_SIZE_MAX:
        raise _invalid(f"A batch holds 1 to {BATCH_SIZE_MAX} codes.")
    if duration_months not in DURATION_MONTHS:
        raise _invalid("The duration is not one of the offered months.")
    cleaned_note = note.strip() if note is not None else None
    if cleaned_note is not None and len(cleaned_note) > NOTE_LENGTH_MAX:
        raise _invalid(f"The note holds at most {NOTE_LENGTH_MAX} characters.")
    if redeemable_until is None:
        deadline = add_months(at, REDEEMABLE_MONTHS_DEFAULT)
    else:
        deadline = clock.ensure_utc(redeemable_until)
        if deadline.date() <= at.date() or deadline > add_months(at, REDEEMABLE_MONTHS_MAX):
            raise _invalid(
                f"The deadline lies between tomorrow and {REDEEMABLE_MONTHS_MAX} months ahead."
            )

    batch = GiftCodeBatch(
        note=cleaned_note or None,
        duration_months=duration_months,
        redeemable_until=deadline,
        created_by=actor_id,
        created_at=at,
    )
    session.add(batch)
    session.flush()
    for code in _fresh_codes(session, count):
        session.add(
            GiftCode(
                batch_id=batch.id,
                payload=GiftCodePayload(code=code),
                lookup_hash=lookup_hash(code),
            )
        )
    session.flush()
    return batch


def _fresh_codes(session: Session, count: int) -> list[str]:
    """Draw ``count`` codes whose lookup hash is unused, here and in the database."""
    chosen: dict[str, str] = {}
    attempts = 0
    while len(chosen) < count:
        attempts += 1
        if attempts > count + _GENERATION_ATTEMPTS:
            # About 40 bits per code make this unreachable in practice; failing
            # loudly beats looping forever on a broken generator.
            raise RuntimeError("Could not draw unused gift codes.")
        code = generate_code()
        digest = lookup_hash(code)
        if digest in chosen:
            continue
        if session.scalar(select(exists().where(GiftCode.lookup_hash == digest))):
            continue
        chosen[digest] = code
    return list(chosen.values())


def code_state(code: GiftCode, batch: GiftCodeBatch, at: datetime) -> CodeState:
    """Derive a code's state; a redeemed code stays redeemed whatever happens to its batch."""
    if code.redeemed_at is not None:
        return "redeemed"
    if code.revoked_at is not None or batch.revoked_at is not None:
        return "revoked"
    if at > batch.redeemable_until:
        return "expired"
    if code.handed_out_at is not None:
        return "handed_out"
    return "open"


def list_codes(session: Session, batch_id: UUID) -> list[GiftCode]:
    """The codes of a batch in creation order."""
    return list(
        session.scalars(select(GiftCode).where(GiftCode.batch_id == batch_id).order_by(GiftCode.id))
    )


def list_batches(session: Session, at: datetime) -> list[BatchSummary]:
    """All batches, newest first, with their codes counted per state in one query."""
    redeemed = GiftCode.redeemed_at.is_not(None)
    revoked = and_(
        GiftCode.redeemed_at.is_(None),
        or_(GiftCode.revoked_at.is_not(None), GiftCodeBatch.revoked_at.is_not(None)),
    )
    unfinished = and_(
        GiftCode.redeemed_at.is_(None),
        GiftCode.revoked_at.is_(None),
        GiftCodeBatch.revoked_at.is_(None),
    )
    expired = and_(unfinished, GiftCodeBatch.redeemable_until < at)
    running = and_(unfinished, GiftCodeBatch.redeemable_until >= at)

    def counted(condition: ColumnElement[bool]) -> ColumnElement[int]:
        return func.count(GiftCode.id).filter(condition)

    rows = session.execute(
        select(
            GiftCodeBatch,
            func.count(GiftCode.id),
            counted(and_(running, GiftCode.handed_out_at.is_(None))),
            counted(and_(running, GiftCode.handed_out_at.is_not(None))),
            counted(redeemed),
            counted(revoked),
            counted(expired),
        )
        .outerjoin(GiftCode, GiftCode.batch_id == GiftCodeBatch.id)
        .group_by(GiftCodeBatch.id)
        .order_by(GiftCodeBatch.created_at.desc(), GiftCodeBatch.id.desc())
    ).all()
    return [
        BatchSummary(
            id=batch.id,
            note=batch.note,
            duration_months=batch.duration_months,
            redeemable_until=batch.redeemable_until,
            created_at=batch.created_at,
            revoked_at=batch.revoked_at,
            total=total,
            open=open_count,
            handed_out=handed_out,
            redeemed=redeemed_count,
            revoked=revoked_count,
            expired=expired_count,
        )
        for (
            batch,
            total,
            open_count,
            handed_out,
            redeemed_count,
            revoked_count,
            expired_count,
        ) in rows
    ]


def get_batch(session: Session, batch_id: UUID) -> GiftCodeBatch:
    batch = session.get(GiftCodeBatch, batch_id)
    if batch is None:
        raise NotFoundError("Gift code batch not found.", GiftCodeErrorCode.BATCH_NOT_FOUND)
    return batch


def _get_code(session: Session, code_id: UUID) -> GiftCode:
    code = session.get(GiftCode, code_id, with_for_update=True)
    if code is None:
        raise NotFoundError("Gift code not found.", GiftCodeErrorCode.NOT_FOUND)
    return code


def set_handed_out(session: Session, code_id: UUID, handed_out: bool) -> GiftCode:
    """Mark or unmark a code as passed on; only open or handed-out codes change.

    Marking an already handed-out code keeps its first timestamp.
    """
    code = _get_code(session, code_id)
    batch = get_batch(session, code.batch_id)
    if code_state(code, batch, clock.now()) not in ("open", "handed_out"):
        raise ValidationError(
            "Only an open code can be marked as handed out.", GiftCodeErrorCode.NOT_OPEN
        )
    if not handed_out:
        code.handed_out_at = None
    elif code.handed_out_at is None:
        code.handed_out_at = clock.now()
    session.flush()
    return code


def revoke_code(session: Session, code_id: UUID, actor_id: UUID) -> GiftCode:
    """Revoke one unredeemed code; revoking twice keeps the first actor and timestamp."""
    code = _get_code(session, code_id)
    if code.redeemed_at is not None:
        raise ValidationError(
            "A redeemed code cannot be revoked.", GiftCodeErrorCode.ALREADY_REDEEMED
        )
    if code.revoked_at is None:
        code.revoked_at = clock.now()
        code.revoked_by = actor_id
        session.flush()
    return code


def revoke_batch(session: Session, batch_id: UUID, actor_id: UUID) -> GiftCodeBatch:
    """Revoke every unredeemed code of a batch; redeemed codes and their grants stay."""
    batch = session.get(GiftCodeBatch, batch_id, with_for_update=True)
    if batch is None:
        raise NotFoundError("Gift code batch not found.", GiftCodeErrorCode.BATCH_NOT_FOUND)
    at = clock.now()
    if batch.revoked_at is None:
        batch.revoked_at = at
        batch.revoked_by = actor_id
    for code in session.scalars(
        select(GiftCode)
        .where(
            GiftCode.batch_id == batch_id,
            GiftCode.redeemed_at.is_(None),
            GiftCode.revoked_at.is_(None),
        )
        .with_for_update()
    ):
        code.revoked_at = at
        code.revoked_by = actor_id
    session.flush()
    return batch


def prune_batches(session: Session, at: datetime) -> int:
    """Delete finished batches whose last change is older than the retention period.

    A batch is finished when no code can still be redeemed: every code is
    redeemed or revoked, or the deadline has passed. Its last change is the
    latest of creation, revocation and the codes' own events; the deadline counts
    only when a code expired unused. The codes go with their batch (cascade).
    Returns the number of deleted batches.
    """
    cutoff = add_months(at, -RETENTION_MONTHS)
    unused = and_(GiftCode.redeemed_at.is_(None), GiftCode.revoked_at.is_(None))
    last_change = (
        select(
            GiftCodeBatch.id,
            func.greatest(
                GiftCodeBatch.created_at,
                GiftCodeBatch.revoked_at,
                func.max(GiftCode.handed_out_at),
                func.max(GiftCode.redeemed_at),
                func.max(GiftCode.revoked_at),
                case(
                    (
                        func.bool_or(and_(unused, GiftCodeBatch.revoked_at.is_(None))),
                        GiftCodeBatch.redeemable_until,
                    )
                ),
            ).label("last_change"),
            func.bool_or(
                and_(
                    unused,
                    GiftCodeBatch.revoked_at.is_(None),
                    GiftCodeBatch.redeemable_until >= at,
                )
            ).label("redeemable"),
        )
        .outerjoin(GiftCode, GiftCode.batch_id == GiftCodeBatch.id)
        .group_by(GiftCodeBatch.id)
        .subquery()
    )
    finished = select(last_change.c.id).where(
        func.coalesce(last_change.c.redeemable, False).is_(False),
        last_change.c.last_change < cutoff,
    )
    result = cast(
        "CursorResult[Any]",
        session.execute(
            delete(GiftCodeBatch)
            .where(GiftCodeBatch.id.in_(finished))
            .execution_options(synchronize_session=False)
        ),
    )
    return int(result.rowcount or 0)
