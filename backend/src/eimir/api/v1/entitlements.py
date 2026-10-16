"""Space entitlement endpoints.

Provides the effective commercial capability state of a Space.
Client state is for presentation/UX only; backend authority enforces
capabilities independently on guarded operations.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter

from eimir.api.deps import DbSession, Tenant
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import EntitlementStatus, EntitlementTier

router = APIRouter(tags=["entitlements"])


class SpaceEntitlementView(ApiModel):
    """Effective commercial entitlement representation for a Space."""

    space_id: UUID
    tier: EntitlementTier
    status: EntitlementStatus
    effective_until: datetime | None = None
    is_in_grace_period: bool
    capabilities: list[str]


@router.get(
    "/spaces/{spaceId}/entitlements",
    response_model=SpaceEntitlementView,
    responses=problem_responses(401, 404),
)
def get_space_entitlements(
    tenant: Tenant,
    session: DbSession,
) -> SpaceEntitlementView:
    """Return the effective commercial capability entitlement state for the Space."""
    effective = entitlement_service.get_effective_space_entitlement(session, tenant.space_id)
    return SpaceEntitlementView(
        space_id=effective.space_id,
        tier=effective.tier,
        status=effective.status,
        effective_until=effective.effective_until,
        is_in_grace_period=effective.is_in_grace_period,
        capabilities=effective.capabilities,
    )
