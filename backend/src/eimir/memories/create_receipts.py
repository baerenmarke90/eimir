"""Request-identity receipts for Memory create reconciliation (decision 0012).

A client that loses the response of ``POST /spaces/{id}/memories`` after the
server committed cannot tell whether the Memory exists. Repeating the request
with the same ``Idempotency-Key`` must therefore return the original Memory
instead of creating another one.

The receipt is claimed with ``INSERT ... ON CONFLICT DO NOTHING`` inside the
create's own transaction. Committed, the receipt proves the Memory exists;
rolled back, both vanish. Two simultaneous equivalent requests serialize on the
unique index: the loser waits for the winner's commit and then replays, or
proceeds if the winner rolled back.

Only a fingerprint of the normalized request is retained, never its content,
and only for ``RECEIPT_RETENTION``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core import clock
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError
from eimir.memories.models import Memory, MemoryCreateReceipt

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult

RECEIPT_RETENTION = timedelta(hours=24)
"""How long a request identity can be replayed.

Clients stop replaying a key after half of this window (decision 0012), so
clock skew cannot turn an expired identity into a duplicate create.
"""


def fingerprint(*, title: str, body: str, happened_on: date | None) -> str:
    """Hash the normalized create request without retaining any of its content."""
    canonical = json.dumps(
        {
            "v": 1,
            "title": title,
            "body": body,
            "happenedOn": happened_on.isoformat() if happened_on else None,
        },
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def claim(
    session: Session,
    context: AuthorizationContext,
    key: UUID,
    request_fingerprint: str,
) -> UUID | None:
    """Claim the request identity for the creating transaction.

    Returns the receipt ID for the first request, or ``None`` when the identity
    already has a committed receipt. A concurrent claimant blocks here until
    the other transaction ends, which is what serializes equivalent requests.
    """
    statement = (
        postgresql.insert(MemoryCreateReceipt)
        .values(
            space_id=context.space_id,
            account_id=context.account_id,
            idempotency_key=key,
            request_fingerprint=request_fingerprint,
            # Assigned once the Memory exists, within the same transaction.
            memory_id=None,
        )
        .on_conflict_do_nothing(index_elements=["space_id", "account_id", "idempotency_key"])
        .returning(MemoryCreateReceipt.id)
    )
    return session.execute(statement).scalar_one_or_none()


def attach(session: Session, receipt_id: UUID, memory_id: UUID) -> None:
    """Bind the claimed receipt to the Memory created in the same transaction."""
    session.execute(
        update(MemoryCreateReceipt)
        .where(MemoryCreateReceipt.id == receipt_id)
        .values(memory_id=memory_id)
    )


def replay(
    session: Session,
    context: AuthorizationContext,
    key: UUID,
    request_fingerprint: str,
) -> Memory:
    """Return the original Memory for an already committed request identity.

    The lookup is bound to the caller's own Space and Account by construction;
    another Account's identity is indistinguishable from an unknown one.
    """
    receipt = session.execute(
        select(MemoryCreateReceipt).where(
            MemoryCreateReceipt.space_id == context.space_id,
            MemoryCreateReceipt.account_id == context.account_id,
            MemoryCreateReceipt.idempotency_key == key,
        )
    ).scalar_one()
    if not hmac.compare_digest(receipt.request_fingerprint, request_fingerprint):
        raise ConflictError(
            "The Idempotency-Key was already used for a different request.",
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
        )
    memory = None
    if receipt.memory_id is not None:
        memory = session.execute(
            readable(Memory, context).where(Memory.id == receipt.memory_id)
        ).scalar_one_or_none()
    if memory is None:
        # Never recreate: the original was committed and has since been removed.
        raise NotFoundError(
            "The Memory created by this request no longer exists.",
            ErrorCode.MEMORY_CREATE_RESULT_DELETED,
        )
    return memory


def _delete(session: Session, *criteria: Any) -> int:
    result = cast(
        "CursorResult[object]",
        session.execute(delete(MemoryCreateReceipt).where(*criteria)),
    )
    return int(result.rowcount or 0)


def purge_account_in_space(session: Session, *, space_id: UUID, account_id: UUID) -> int:
    """Drop one departing member's receipts for one Space."""
    return _delete(
        session,
        MemoryCreateReceipt.space_id == space_id,
        MemoryCreateReceipt.account_id == account_id,
    )


def purge_account(session: Session, *, account_id: UUID) -> int:
    """Drop every receipt of an Account subject to deletion."""
    return _delete(session, MemoryCreateReceipt.account_id == account_id)


def prune_expired(session: Session, *, at: datetime | None = None) -> int:
    """Remove receipts older than ``RECEIPT_RETENTION``."""
    instant = clock.ensure_utc(at if at is not None else clock.now())
    return _delete(session, MemoryCreateReceipt.created_at < instant - RECEIPT_RETENTION)
