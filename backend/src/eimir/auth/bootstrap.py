"""One-time, atomic initialization of a self-hosted instance."""

from __future__ import annotations

from secrets import compare_digest

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.errors import ForbiddenError
from eimir.identity import service as accounts
from eimir.identity.models import Account, InstanceBootstrapState

# Transaction-scoped PostgreSQL lock for this single global invariant. It works
# before the singleton row exists.
_BOOTSTRAP_LOCK_KEY = 0x534253424F4F54
_SINGLETON_KEY = 1


class BootstrapErrorCode:
    INVALID = "BOOTSTRAP_INVALID"
    CLOSED = "REGISTRATION_REQUIRES_INVITATION"


def claim(
    session: Session,
    *,
    presented_token: str | None,
    configured_token: str | None,
) -> InstanceBootstrapState:
    """Claim the one-time bootstrap within the current transaction."""
    session.execute(select(func.pg_advisory_xact_lock(_BOOTSTRAP_LOCK_KEY))).scalar_one()

    state = session.get(InstanceBootstrapState, _SINGLETON_KEY)
    if state is None:
        state = InstanceBootstrapState(singleton_key=_SINGLETON_KEY)
        session.add(state)
        session.flush()

    # Fail closed for upgraded installations whose account predates the
    # bootstrap-state row.
    if state.completed_at is not None or accounts.account_count(session) > 0:
        raise ForbiddenError(
            "Registration on this instance requires an invitation.",
            BootstrapErrorCode.CLOSED,
        )

    if (
        configured_token is None
        or presented_token is None
        or not compare_digest(presented_token, configured_token)
    ):
        raise ForbiddenError(
            "A valid bootstrap proof is required for initial registration.",
            BootstrapErrorCode.INVALID,
        )

    return state


def complete(state: InstanceBootstrapState, account: Account) -> None:
    state.completed_at = now()
    state.completed_by = account.id
