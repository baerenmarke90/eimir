"""Invitations to a space."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, status

from eimir.api.deps import CurrentAccount, DbSession, Tenant
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir.relationship import invitations
from eimir.relationship.invitations import InvitationErrorCode

router = APIRouter(tags=["invitations"])


class InvitationView(ApiModel):
    id: UUID
    expires_at: datetime
    created_at: datetime


class IssuedInvitationView(InvitationView):
    token: str
    """Returned exactly once; only the token hash is stored afterwards."""


class AcceptRequest(ApiModel):
    token: str


class MembershipView(ApiModel):
    space_id: UUID
    role: str
    status: str


@router.post(
    "/spaces/{spaceId}/invitations",
    response_model=IssuedInvitationView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 404, 409),
)
def create_invitation(tenant: Tenant, session: DbSession) -> IssuedInvitationView:
    result = invitations.create(session, tenant.space_id, tenant.account)
    return IssuedInvitationView(
        id=result.invitation.id,
        expires_at=result.invitation.expires_at,
        created_at=result.invitation.created_at,
        token=result.token,
    )


@router.get(
    "/spaces/{spaceId}/invitations",
    response_model=list[InvitationView],
    responses=problem_responses(401, 404),
)
def list_invitations(tenant: Tenant, session: DbSession) -> list[InvitationView]:
    """Return open invitations without their one-time tokens."""
    return [
        InvitationView(id=e.id, expires_at=e.expires_at, created_at=e.created_at)
        for e in invitations.list_open(session, tenant.space_id)
    ]


@router.delete(
    "/spaces/{spaceId}/invitations/{invitationId}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=problem_responses(401, 404),
)
def revoke_invitation(
    tenant: Tenant,
    session: DbSession,
    invitation_id_raw: Annotated[str, Path(alias="invitationId")],
) -> None:
    invitation_id = parse_id(invitation_id_raw)
    if invitation_id is None:
        raise NotFoundError("Invitation not found.", InvitationErrorCode.NOT_FOUND)
    invitations.revoke(session, tenant.space_id, invitation_id)


@router.post(
    "/invitations/accept",
    response_model=MembershipView,
    status_code=status.HTTP_201_CREATED,
    responses=problem_responses(401, 409, 422),
)
def accept_invitation(
    body: AcceptRequest, account: CurrentAccount, session: DbSession
) -> MembershipView:
    """Accept an invitation.

    This endpoint lives outside ``/spaces/...`` because the caller does not
    know the space yet; the token identifies it.
    """
    membership = invitations.accept(session, body.token, account)
    return MembershipView(
        space_id=membership.space_id,
        role=membership.role,
        status=membership.status,
    )
