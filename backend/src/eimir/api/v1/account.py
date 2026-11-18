"""Authenticated Account-level actions."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Response, status
from pydantic import ConfigDict, Field
from sqlalchemy import select

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import CurrentAccount, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments import photo_locations
from eimir.auth import recent_auth
from eimir.i18n import account_locale
from eimir.identity.deletion_models import AccountDeletionStatus
from eimir.identity.deletion_self_service import accept_self_deletion
from eimir.identity.models import Account
from eimir.identity.preferences import set_language_preference as write_language_preference
from eimir.identity.preferences import set_preferences, validate_timezone
from eimir.relationship.configuration import sync_system_timezone
from eimir.relationship.service import require_membership

router = APIRouter(prefix="/account", tags=["account"])


class LanguagePreferenceView(ApiModel):
    preference: str
    effective_locale: str
    version: int


class LanguagePreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    preference: str = Field(min_length=2, max_length=16)
    device_languages: list[Annotated[str, Field(max_length=64)]] = Field(
        default_factory=list, max_length=20
    )


def _language_view(account: Account, response: Response) -> LanguagePreferenceView:
    response.headers["ETag"] = etag_for(account.language_version)
    response.headers["Cache-Control"] = "private, no-store"
    return LanguagePreferenceView(
        preference=account.language_preference,
        effective_locale=account_locale(account),
        version=account.language_version,
    )


@router.get(
    "/language-preference",
    response_model=LanguagePreferenceView,
    operation_id="getLanguagePreference",
    responses=problem_responses(401),
)
def get_language_preference(account: CurrentAccount, response: Response) -> LanguagePreferenceView:
    return _language_view(account, response)


@router.put(
    "/language-preference",
    response_model=LanguagePreferenceView,
    operation_id="setLanguagePreference",
    responses=problem_responses(401, 409, 422),
)
def set_language_preference(
    payload: LanguagePreferenceUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
) -> LanguagePreferenceView:
    updated = write_language_preference(
        session,
        account,
        preference=payload.preference,
        device_languages=payload.device_languages,
        expected_version=expected_version,
    )
    return _language_view(updated, response)


class DeviceContextUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str
    space_id: UUID


class DeviceContextView(ApiModel):
    timezone: str
    shared_day_pending: bool


@router.put(
    "/device-context",
    response_model=DeviceContextView,
    operation_id="updateOwnDeviceContext",
    responses=problem_responses(401, 404, 422),
)
def update_own_device_context(
    body: DeviceContextUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> DeviceContextView:
    timezone = validate_timezone(body.timezone)
    membership = require_membership(session, account, body.space_id)
    pending = sync_system_timezone(session, body.space_id, membership, timezone)
    locked = session.scalars(
        select(Account).where(Account.id == account.id).with_for_update()
    ).one()
    if locked.timezone != timezone:
        set_preferences(session, locked, timezone=timezone)
    response.headers["Cache-Control"] = "private, no-store"
    return DeviceContextView(timezone=locked.timezone, shared_day_pending=pending)


class PhotoLocationPreference(ApiModel):
    enabled: bool
    version: int


class PhotoLocationPreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    enabled: bool


@router.get(
    "/photo-location-preference",
    response_model=PhotoLocationPreference,
    operation_id="getPhotoLocationPreference",
    responses=problem_responses(401),
)
def get_photo_location_preference(
    account: CurrentAccount, session: DbSession, response: Response
) -> PhotoLocationPreference:
    enabled, version = photo_locations.preference(session, account.id)
    response.headers["ETag"] = etag_for(version)
    response.headers["Cache-Control"] = "no-store"
    return PhotoLocationPreference(enabled=enabled, version=version)


@router.put(
    "/photo-location-preference",
    response_model=PhotoLocationPreference,
    operation_id="setPhotoLocationPreference",
    responses=problem_responses(401, 409, 422),
)
def set_photo_location_preference(
    payload: PhotoLocationPreferenceUpdate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
) -> PhotoLocationPreference:
    enabled, version = photo_locations.set_preference(
        session, account.id, enabled=payload.enabled, expected_version=expected_version
    )
    response.headers["ETag"] = etag_for(version)
    response.headers["Cache-Control"] = "no-store"
    return PhotoLocationPreference(enabled=enabled, version=version)


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
