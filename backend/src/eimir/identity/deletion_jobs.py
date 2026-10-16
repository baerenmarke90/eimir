"""Background convergence for an already accepted Account deletion."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from eimir.identity.deletion_lifecycle import converge_accepted_deletion
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.worker import registry

CONVERGENCE_JOB = "account_deletion_converge"
CONVERGENCE_FAILED = "ACCOUNT_DELETION_CONVERGENCE_FAILED"


def enqueue_convergence(
    session: Session,
    *,
    account_id: UUID,
    accepted_at: datetime,
) -> None:
    """Queue retry-safe completion in the same transaction as fail-closed state."""
    queue.enqueue(
        session,
        CONVERGENCE_JOB,
        {
            "account_id": str(account_id),
            "accepted_at": accepted_at.isoformat(),
        },
        max_attempts=12,
    )


def _parse_payload(payload: dict[str, Any]) -> tuple[UUID, datetime]:
    account_id = UUID(str(payload["account_id"]))
    accepted_at = datetime.fromisoformat(str(payload["accepted_at"]))
    if accepted_at.tzinfo is None or accepted_at.utcoffset() is None:
        raise ValueError("Account deletion acceptance timestamp must be timezone-aware.")
    return account_id, accepted_at


def _handle(_: Session, payload: dict[str, Any]) -> None:
    try:
        account_id, accepted_at = _parse_payload(payload)
        converge_accepted_deletion(account_id, accepted_at=accepted_at)
    except Exception as exc:
        # Deletion jobs are privacy-sensitive. Queue state keeps only one bounded
        # technical code rather than provider exceptions, paths, or payload data.
        raise RetryableJobError(CONVERGENCE_FAILED) from exc


def register_handlers() -> None:
    if registry.get(CONVERGENCE_JOB) is None:
        registry.register(CONVERGENCE_JOB, _handle)
