"""Authenticated Account-level actions."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import ConfigDict, StrictBool

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import CurrentAccount, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import recent_auth
from eimir.core.errors import ConflictError, ErrorCode
from eimir.identity.deletion_models import AccountDeletionStatus
from eimir.identity.deletion_self_service import accept_self_deletion

router = APIRouter(prefix="/account", tags=["account"])


class PhotoLocationPreferences(ApiModel):
    enabled: bool
    version: int


class PhotoLocationPreferencesUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    enabled: StrictBool


@router.get(
    "/photo-location-preferences",
    response_model=PhotoLocationPreferences,
    operation_id="getPhotoLocationPreferences",
    responses=problem_responses(401),
)
def photo_location_preferences(
    account: CurrentAccount, response: Response
) -> PhotoLocationPreferences:
    response.headers["ETag"] = etag_for(account.version)
    return PhotoLocationPreferences(enabled=account.auto_photo_locations, version=account.version)


@router.put(
    "/photo-location-preferences",
    response_model=PhotoLocationPreferences,
    operation_id="updatePhotoLocationPreferences",
    responses=problem_responses(401, 409, 422),
)
def update_photo_location_preferences(
    body: PhotoLocationPreferencesUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
) -> PhotoLocationPreferences:
    session.refresh(account, with_for_update=True)
    if account.version != expected_version:
        raise ConflictError(
            "Preferences changed. Reload before saving.", ErrorCode.RESOURCE_VERSION_CONFLICT
        )
    account.auto_photo_locations = body.enabled
    session.flush()
    return photo_location_preferences(account, response)


class AccountDeletionRequest(ApiModel):
    """Explicit destructive confirmation; the target is always the caller."""

    model_config = ConfigDict(extra="forbid")

    confirmation: Literal["DELETE_ACCOUNT"]


class AccountDeletionAccepted(ApiModel):
    """Safe client state after irreversible deletion acceptance."""

    accepted_at: datetime
    status: AccountDeletionStatus


@router.post(
    "/deletion",
    response_model=AccountDeletionAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    responses=problem_responses(401, 403, 422, 503),
    summary="Delete the authenticated Account",
)
def delete_own_account(
    payload: AccountDeletionRequest,
    account: CurrentAccount,
    device_session: CurrentSession,
    session: DbSession,
) -> AccountDeletionAccepted:
    """Accept deletion only after confirmation and recent authentication.

    The confirmation literal prevents accidental UI activation; it is not an
    authentication factor. A separate server-side recent-authentication grant
    must therefore authorize this exact Account, DeviceSession, and deletion
    purpose before the existing irreversible deletion pipeline is entered.

    No Account identifier or recent-auth proof is accepted from the client, so
    neither cross-account deletion nor client-forged step-up state is possible.
    Once the external tombstone and fail-closed state commit, cleanup continues
    through the existing worker even if the client disconnects.
    """
    del payload  # Pydantic already enforced the exact confirmation literal.
    recent_auth.require_grant(
        session,
        account,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.ACCOUNT_DELETION,
    )
    result = accept_self_deletion(account.id)
    return AccountDeletionAccepted(
        accepted_at=result.accepted_at,
        status=result.status,
    )
