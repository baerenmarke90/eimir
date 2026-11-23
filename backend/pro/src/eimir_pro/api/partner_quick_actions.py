"""HTTP contract of the Premium extended partner gestures (Decision 0017).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
route. Tag, path, ``operation_id`` and schema names are those of the former Core
route, so the full OpenAPI contract and the generated clients are unchanged.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Response
from fastapi import status as http_status
from pydantic import ConfigDict

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.engagement import thinking
from eimir.engagement.models import SupportGestureKind
from eimir.entitlements.models import Capability
from eimir_pro.partner_quick_actions.service import send_support_gesture

router = APIRouter()


class PartnerQuickActionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    kind: SupportGestureKind
    client_request_id: UUID


class PartnerQuickActionAccepted(ApiModel):
    kind: SupportGestureKind
    client_request_id: UUID
    available_at: datetime


@router.post(
    "/spaces/{spaceId}/partner-quick-actions",
    response_model=PartnerQuickActionAccepted,
    status_code=http_status.HTTP_202_ACCEPTED,
    operation_id="sendPartnerQuickAction",
    responses=problem_responses(401, 403, 404, 422, 429),
    tags=["notifications"],
)
def send_partner_quick_action(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PartnerQuickActionCreate,
) -> PartnerQuickActionAccepted:
    ensure_capability(
        session,
        authorization.space_id,
        Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value,
    )
    request = send_support_gesture(
        session,
        authorization,
        kind=body.kind,
        client_request_id=body.client_request_id,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return PartnerQuickActionAccepted(
        kind=body.kind,
        client_request_id=request.client_request_id,
        available_at=request.created_at
        + timedelta(seconds=thinking.SUPPORT_GESTURE_COOLDOWN_SECONDS),
    )
