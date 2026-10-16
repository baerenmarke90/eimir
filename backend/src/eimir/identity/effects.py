"""Current Account and Membership state checks for asynchronous side-effect boundaries."""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.identity.models import Account
from eimir.relationship.models import Membership, MembershipStatus


def lock_enabled_accounts(
    session: Session,
    account_ids: Iterable[UUID],
) -> dict[UUID, Account] | None:
    """Lock Accounts in deterministic order and reject deleted/disabled state.

    Account-deletion acceptance locks the same Account row. Holding these locks
    through a worker transaction therefore gives provider/DB side effects a
    strict ordering relative to the irreversible acceptance boundary: either
    the side effect commits first, or deletion acceptance commits first and the
    worker observes the disabled Account and becomes a no-op.
    """
    identifiers = sorted(set(account_ids))
    if not identifiers:
        return {}
    accounts = list(
        session.execute(
            select(Account)
            .where(Account.id.in_(identifiers))
            .order_by(Account.id)
            .with_for_update()
        ).scalars()
    )
    if len(accounts) != len(identifiers) or any(
        account.disabled_at is not None for account in accounts
    ):
        return None
    return {account.id: account for account in accounts}


def has_active_membership(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
) -> bool:
    """Share-lock the current Membership barrier and report active Space access.

    This is the asynchronous counterpart of ``require_membership``. Provider
    and background side effects keep the matching ACTIVE Membership row under a
    shared lock for their transaction. #518 self-offboarding takes the exclusive
    side of that same row before ``ACTIVE -> LEFT``. Therefore either an
    already-authorized side effect finishes before exit can become durable, or
    exit commits first and this recheck observes no active Membership.
    """
    return (
        session.execute(
            select(Membership.id)
            .where(
                Membership.space_id == space_id,
                Membership.account_id == account_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .with_for_update(read=True)
        ).scalar_one_or_none()
        is not None
    )
