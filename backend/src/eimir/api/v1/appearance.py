"""Authenticated personal app-icon selection; installed launchers are device-owned."""

from fastapi import APIRouter, Response

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.appearance import service
from eimir.appearance.models import AppIconId, AppIconPreference, WirDesignId
from eimir.authorization import AuthorizationContext
from eimir.entitlements.models import Capability

router = APIRouter(tags=["appearance"])
ETAG_HEADERS = {
    "ETag": {
        "description": "Opaque personal preference token; send unchanged as If-Match on writes.",
        "schema": {"type": "string"},
    }
}


class AppIconPreferenceView(ApiModel):
    icon_id: AppIconId
    version: int


class AppIconPreferencePatch(ApiModel):
    icon_id: AppIconId


def _view(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
    response: Response,
) -> AppIconPreferenceView:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(preference, authorization))
    response.headers["Cache-Control"] = "private, no-store"
    return AppIconPreferenceView(
        icon_id=AppIconId(preference.icon_id) if preference else AppIconId.ORIGINAL,
        version=preference.version if preference else 0,
    )


@router.get(
    "/spaces/{spaceId}/appearance/app-icon",
    response_model=AppIconPreferenceView,
    operation_id="getAppIconPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_app_icon_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> AppIconPreferenceView:
    """Read/export only the caller's selection, including after Pro expiry."""
    return _view(service.read_preference(session, authorization), authorization, response)


@router.patch(
    "/spaces/{spaceId}/appearance/app-icon",
    response_model=AppIconPreferenceView,
    operation_id="updateAppIconPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 403, 404, 409, 422)},
)
def update_app_icon_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: AppIconPreferencePatch,
    expected_token: IfMatchToken,
) -> AppIconPreferenceView:
    """Save a known preset. Original is Free; each alternative requires Pro.

    Membership precedes the capability check. Reads never delete or revert a
    previously saved cosmetic when a grant expires. No partner ID is accepted.
    """
    if body.icon_id != AppIconId.ORIGINAL:
        ensure_capability(session, authorization.space_id, Capability.THEME_BESPOKE_PACKS.value)
    saved = service.save_preference(session, authorization, body.icon_id, expected_token)
    return _view(saved, authorization, response)


class WirDesignPreferenceView(ApiModel):
    design_id: WirDesignId
    version: int


class WirDesignPreferencePatch(ApiModel):
    design_id: WirDesignId


def _design_view(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
    response: Response,
) -> WirDesignPreferenceView:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(preference, authorization))
    response.headers["Cache-Control"] = "private, no-store"
    return WirDesignPreferenceView(
        design_id=WirDesignId(preference.wir_design) if preference else WirDesignId.WARM,
        version=preference.version if preference else 0,
    )


@router.get(
    "/spaces/{spaceId}/appearance/wir-design",
    response_model=WirDesignPreferenceView,
    operation_id="getWirDesignPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_wir_design_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> WirDesignPreferenceView:
    """Read only the caller's personal composition, including after Pro expiry."""
    return _design_view(service.read_preference(session, authorization), authorization, response)


@router.patch(
    "/spaces/{spaceId}/appearance/wir-design",
    response_model=WirDesignPreferenceView,
    operation_id="updateWirDesignPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 403, 404, 409, 422)},
)
def update_wir_design_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: WirDesignPreferencePatch,
    expected_token: IfMatchToken,
) -> WirDesignPreferenceView:
    """Save a personal cosmetic. Warm is Free; new alternatives require Pro."""
    if body.design_id != WirDesignId.WARM:
        ensure_capability(session, authorization.space_id, Capability.THEME_BESPOKE_PACKS.value)
    saved = service.save_wir_design(session, authorization, body.design_id, expected_token)
    return _design_view(saved, authorization, response)
