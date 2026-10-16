"""Authenticated client context endpoints.

These endpoints expose only the current account's own authorization context.
They do not replace the tenant guard: every later Space-scoped request still
has to prove an active Membership for the requested Space.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy import select

from eimir.api.deps import CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth.policy import AuthCapabilities, AuthPolicy, resolve_auth_capabilities
from eimir.authorization.server_admin import is_server_admin
from eimir.relationship.models import Membership, MembershipStatus

router = APIRouter(tags=["auth"])


class AccountMembershipView(ApiModel):
    """Active Space membership belonging to the authenticated account."""

    space_id: UUID
    role: str
    status: str


class AccountCapabilitiesView(ApiModel):
    """Current account capabilities used only for client presentation."""

    server_admin: bool
    auth: AuthCapabilities = Field(default_factory=resolve_auth_capabilities)


@router.get(
    "/auth/capabilities",
    response_model=AccountCapabilitiesView,
    responses=problem_responses(401),
)
def get_account_capabilities(
    account: CurrentAccount,
    session: DbSession,
    auth_policy: AuthPolicy,
) -> AccountCapabilitiesView:
    """Return presentation capabilities without replacing endpoint authorization."""
    return AccountCapabilitiesView(
        server_admin=is_server_admin(session, account),
        auth=auth_policy,
    )


@router.get(
    "/auth/memberships",
    response_model=list[AccountMembershipView],
    responses=problem_responses(401),
)
def list_account_memberships(
    account: CurrentAccount,
    session: DbSession,
) -> list[AccountMembershipView]:
    """Return the caller's active Space memberships.

    Returning this small authorization projection lets official clients select
    an authorized Space without a build-time Space identifier or ID probing.
    It intentionally contains no partner or Space content; clients load the
    selected Space through the normal tenant-guarded endpoint afterward.
    """
    memberships = (
        session.execute(
            select(Membership)
            .where(
                Membership.account_id == account.id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.created_at, Membership.id)
        )
        .scalars()
        .all()
    )
    return [
        AccountMembershipView(
            space_id=membership.space_id,
            role=membership.role,
            status=membership.status,
        )
        for membership in memberships
    ]
