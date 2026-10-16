"""Write and resolve shared request-identity receipts (decision 0012, #961).

Generalizes ``eimir.memories.create_receipts`` for every other create
endpoint that wants the same reconciliation guarantee: a client that loses
the response of a create request after the server committed cannot tell
whether the resource exists. Repeating the request with the same
``Idempotency-Key`` must return the original resource instead of creating
another one.

The receipt is claimed with ``INSERT ... ON CONFLICT DO NOTHING`` inside the
create's own transaction. Committed, the receipt proves the resource exists;
rolled back, both vanish. Two simultaneous equivalent requests serialize on
the unique index: the loser waits for the winner's commit and then replays,
or proceeds if the winner rolled back.

Only a fingerprint of the normalized request is retained, never its content,
and only for ``RECEIPT_RETENTION``.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import (
    AuthorizationContext,
    PrivateResource,
    PrivateResourceMixin,
    readable,
)
from eimir.core import clock
from eimir.core.errors import ConflictError, DomainError, ErrorCode
from eimir.create_receipts.models import CreateReceipt

if TYPE_CHECKING:
    from sqlalchemy.engine import CursorResult

RECEIPT_RETENTION = timedelta(hours=24)
"""How long a request identity can be replayed.

Clients stop replaying a key after half of this window (decision 0012), so
clock skew cannot turn an expired identity into a duplicate create.
"""


def fingerprint(resource_type: str, payload: Mapping[str, Any]) -> str:
    """Hash the normalized create request without retaining any of its content.

    ``payload`` must already be reduced to JSON-primitive values (str, int,
    float, bool, ``None``); callers normalize dates/enums to their canonical
    string form before calling this, the same discipline
    ``memories.create_receipts.fingerprint`` uses.
    """
    canonical = json.dumps(
        {"v": 1, "type": resource_type, **payload},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def claim(
    session: Session,
    context: AuthorizationContext,
    *,
    resource_type: str,
    key: UUID,
    request_fingerprint: str,
) -> UUID | None:
    """Claim the request identity for the creating transaction.

    Returns the receipt ID for the first request, or ``None`` when the
    identity already has a committed receipt. A concurrent claimant blocks
    here until the other transaction ends, which is what serializes
    equivalent requests.
    """
    statement = (
        postgresql.insert(CreateReceipt)
        .values(
            space_id=context.space_id,
            account_id=context.account_id,
            resource_type=resource_type,
            idempotency_key=key,
            request_fingerprint=request_fingerprint,
            # Assigned once the resource exists, within the same transaction.
            resource_id=None,
        )
        .on_conflict_do_nothing(
            index_elements=["space_id", "account_id", "resource_type", "idempotency_key"]
        )
        .returning(CreateReceipt.id)
    )
    return session.execute(statement).scalar_one_or_none()


def attach(session: Session, receipt_id: UUID, resource_id: UUID) -> None:
    """Bind the claimed receipt to the resource created in the same transaction."""
    session.execute(
        update(CreateReceipt).where(CreateReceipt.id == receipt_id).values(resource_id=resource_id)
    )


def replay[ResourceT: PrivateResourceMixin](
    session: Session,
    context: AuthorizationContext,
    model: type[ResourceT],
    *,
    resource_type: str,
    key: UUID,
    request_fingerprint: str,
    deleted_error: DomainError,
) -> ResourceT:
    """Return the original resource for an already committed request identity.

    The lookup is bound to the caller's own Space and Account by
    construction; another Account's identity is indistinguishable from an
    unknown one. Raises ``deleted_error`` rather than recreating the
    resource when the committed row no longer exists or is no longer
    readable by the caller.
    """
    receipt = session.execute(
        select(CreateReceipt).where(
            CreateReceipt.space_id == context.space_id,
            CreateReceipt.account_id == context.account_id,
            CreateReceipt.resource_type == resource_type,
            CreateReceipt.idempotency_key == key,
        )
    ).scalar_one()
    if not hmac.compare_digest(receipt.request_fingerprint, request_fingerprint):
        raise ConflictError(
            "The Idempotency-Key was already used for a different request.",
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
        )
    resource = None
    if receipt.resource_id is not None:
        # Structural cast for `.id`, mirroring `authorization.guard._rule_model`:
        # SQLAlchemy exposes it at runtime, but the generic bound stays
        # `PrivateResourceMixin` so callers pass ordinary domain models.
        rule_model = cast("type[PrivateResource]", model)
        resource = session.execute(
            readable(model, context).where(rule_model.id == receipt.resource_id)
        ).scalar_one_or_none()
    if resource is None:
        # Never recreate: the original was committed and has since been removed.
        raise deleted_error
    return resource


def _delete(session: Session, *criteria: Any) -> int:
    result = cast(
        "CursorResult[object]",
        session.execute(delete(CreateReceipt).where(*criteria)),
    )
    return int(result.rowcount or 0)


def purge_account_in_space(session: Session, *, space_id: UUID, account_id: UUID) -> int:
    """Drop one departing member's receipts for one Space."""
    return _delete(
        session,
        CreateReceipt.space_id == space_id,
        CreateReceipt.account_id == account_id,
    )


def purge_account(session: Session, *, account_id: UUID) -> int:
    """Drop every receipt of an Account subject to deletion."""
    return _delete(session, CreateReceipt.account_id == account_id)


def prune_expired(session: Session, *, at: datetime | None = None) -> int:
    """Remove receipts older than ``RECEIPT_RETENTION``."""
    instant = clock.ensure_utc(at if at is not None else clock.now())
    return _delete(session, CreateReceipt.created_at < instant - RECEIPT_RETENTION)
