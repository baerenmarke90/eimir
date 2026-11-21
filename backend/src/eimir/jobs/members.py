"""The member a background job acts for.

A queued job names the account it acts for, or falls back to the Space's first
active member. Before it reads anything the account must still exist, must not
be disabled and must still belong to the Space; otherwise the job does nothing.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.errors import NotFoundError
from eimir.identity.models import Account
from eimir.relationship.models import Membership, MembershipStatus
from eimir.relationship.service import require_membership


def authorized_context(
    session: Session, account_id: UUID, space_id: UUID
) -> AuthorizationContext | None:
    account = session.get(Account, account_id)
    if account is None or account.disabled_at:
        return None
    try:
        require_membership(session, account, space_id)
    except NotFoundError:
        return None
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def first_member(session: Session, space_id: UUID) -> UUID | None:
    return session.scalar(
        select(Membership.account_id)
        .join(Account, Account.id == Membership.account_id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Account.disabled_at.is_(None),
        )
        .order_by(Membership.created_at, Membership.id)
        .limit(1)
    )
