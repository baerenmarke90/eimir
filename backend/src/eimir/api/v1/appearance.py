"""Authenticated personal app-icon selection; installed launchers are device-owned."""

from fastapi import APIRouter, Response
from pydantic import Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.appearance import service
from eimir.appearance.models import (
    DEFAULT_MEMORY_WORLD,
    DEFAULT_WIR_DESIGN,
    FREE_MEMORY_WORLDS,
    FREE_WIR_DESIGNS,
    AppIconId,
    AppIconPreference,
    MemoryWorldId,
    PersonColoursId,
    WirDesignId,
)
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
    palette_id: WirDesignId | SkipJsonSchema[None] = Field(
        default=None, exclude_if=lambda palette: palette is None
    )
    version: int


class WirDesignPreferencePatch(ApiModel):
    """Set the app design, the palette, or both. A null palette follows the app design."""

    design_id: WirDesignId | SkipJsonSchema[None] = None
    palette_id: WirDesignId | None = None

    @model_validator(mode="after")
    def require_selection(self) -> "WirDesignPreferencePatch":
        fields = self.model_fields_set
        if not fields or ("design_id" in fields and self.design_id is None):
            raise ValueError("An appearance patch must select a design or palette.")
        return self


def _design_view(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
    response: Response,
) -> WirDesignPreferenceView:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(preference, authorization))
    response.headers["Cache-Control"] = "private, no-store"
    return WirDesignPreferenceView(
        design_id=preference.effective_wir_design if preference else DEFAULT_WIR_DESIGN,
        palette_id=preference.effective_palette if preference else None,
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
    """Save personal design choices. Following the design and Free palettes never need Pro."""
    if any(
        value is not None and value not in FREE_WIR_DESIGNS
        for value in (body.design_id, body.palette_id)
    ):
        ensure_capability(session, authorization.space_id, Capability.THEME_BESPOKE_PACKS.value)
    changes = body.model_dump(exclude_unset=True)
    saved = service.save_wir_design(session, authorization, expected_token, **changes)
    return _design_view(saved, authorization, response)


class PersonColoursPreferenceView(ApiModel):
    """The caller's own colour pair; ``colours`` is null while automatic."""

    colours: PersonColoursId | None
    version: int


class PersonColoursPreferencePatch(ApiModel):
    colours: PersonColoursId | None


def _colours_view(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
    response: Response,
) -> PersonColoursPreferenceView:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(preference, authorization))
    response.headers["Cache-Control"] = "private, no-store"
    return PersonColoursPreferenceView(
        colours=(
            PersonColoursId(preference.person_colours)
            if preference and preference.person_colours
            else None
        ),
        version=preference.version if preference else 0,
    )


@router.get(
    "/spaces/{spaceId}/appearance/person-colours",
    response_model=PersonColoursPreferenceView,
    operation_id="getPersonColoursPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_person_colours_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PersonColoursPreferenceView:
    """Read only the caller's own colour pair. No partner value is ever returned."""
    return _colours_view(service.read_preference(session, authorization), authorization, response)


@router.patch(
    "/spaces/{spaceId}/appearance/person-colours",
    response_model=PersonColoursPreferenceView,
    operation_id="updatePersonColoursPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 403, 404, 409, 422)},
)
def update_person_colours_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PersonColoursPreferencePatch,
    expected_token: IfMatchToken,
) -> PersonColoursPreferenceView:
    """Save a known colour pair (Pro) or return to automatic (always Free).

    Membership precedes the capability check. Reads never delete or revert a
    saved pair when a grant expires, and going back to automatic stays free.
    The pair is a personal view of the people in this Space. It is not shared
    and carries no gender statement.
    """
    if body.colours is not None:
        ensure_capability(session, authorization.space_id, Capability.THEME_BESPOKE_PACKS.value)
    saved = service.save_person_colours(session, authorization, body.colours, expected_token)
    return _colours_view(saved, authorization, response)


class MemoryWorldPreferenceView(ApiModel):
    """The caller's own memory world for the rediscovered memories in Momente."""

    world_id: MemoryWorldId
    version: int


class MemoryWorldPreferencePatch(ApiModel):
    world_id: MemoryWorldId


def _world_view(
    preference: AppIconPreference | None,
    authorization: AuthorizationContext,
    response: Response,
) -> MemoryWorldPreferenceView:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(preference, authorization))
    response.headers["Cache-Control"] = "private, no-store"
    return MemoryWorldPreferenceView(
        world_id=preference.effective_memory_world if preference else DEFAULT_MEMORY_WORLD,
        version=preference.version if preference else 0,
    )


@router.get(
    "/spaces/{spaceId}/appearance/memory-world",
    response_model=MemoryWorldPreferenceView,
    operation_id="getMemoryWorldPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_memory_world_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> MemoryWorldPreferenceView:
    """Read only the caller's own memory world, including after Pro expiry."""
    return _world_view(service.read_preference(session, authorization), authorization, response)


@router.patch(
    "/spaces/{spaceId}/appearance/memory-world",
    response_model=MemoryWorldPreferenceView,
    operation_id="updateMemoryWorldPreference",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 403, 404, 409, 422)},
)
def update_memory_world_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: MemoryWorldPreferencePatch,
    expected_token: IfMatchToken,
) -> MemoryWorldPreferenceView:
    """Save a known world. Story and Stapel are Free; every other world requires Pro.

    Membership precedes the capability check. Reads never delete or revert a
    saved world when a grant expires, and returning to a Free world stays free.
    The world is a personal presentation and is not shared with the partner.
    """
    if body.world_id not in FREE_MEMORY_WORLDS:
        ensure_capability(session, authorization.space_id, Capability.THEME_BESPOKE_PACKS.value)
    saved = service.save_memory_world(session, authorization, body.world_id, expected_token)
    return _world_view(saved, authorization, response)
