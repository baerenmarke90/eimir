"""HTTP contract for M9 partner location and distance (#1792).

Coordinates travel only in request bodies, never in URLs or query strings.
Responses are ``no-store`` so no intermediary or client HTTP cache keeps them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from fastapi import APIRouter, Header, Path, Response, status
from pydantic import ConfigDict, Field, model_validator

from eimir.api.deps import Authorization, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import ErrorCode, UnauthenticatedError
from eimir.presence import device, geo, service
from eimir.presence.models import SharingLevel

router = APIRouter(tags=["partner-location"])

_NO_STORE = "no-store"


class PartnerLocationSettingsView(ApiModel):
    """The caller's own sharing state; never the partner's."""

    available: bool = Field(
        description=(
            "Feature enabled on this deployment, Premium capability held and a partner present."
        )
    )
    level: SharingLevel
    state: service.SharingState
    indefinite: bool
    expires_at: datetime | None
    generation: int
    last_published_at: datetime | None


class PartnerLocationSettingsUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    level: SharingLevel
    indefinite: bool = False
    expires_at: datetime | None = Field(
        default=None,
        description="Server-authoritative end of a bounded share, at most 24 hours ahead.",
    )


class PresencePosition(ApiModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    captured_at: datetime

    @model_validator(mode="after")
    def _aware(self) -> Self:
        if self.captured_at.tzinfo is None:
            raise ValueError("capturedAt must include a timezone offset")
        return self


class PresencePublish(PresencePosition):
    accuracy_meters: float = Field(ge=0, le=geo.MAX_ACCEPTED_ACCURACY_METERS)
    consent_generation: int = Field(ge=1)


class DistanceBandView(ApiModel):
    kind: Literal["NEARBY", "RANGE", "APPROXIMATE"]
    min_km: int | None = None
    max_km: int | None = None
    approximate_km: int | None = None


class PartnerDistanceView(ApiModel):
    """Neutral when unavailable: no reason is ever disclosed."""

    available: bool
    band: DistanceBandView | None = None
    as_of: datetime | None = Field(
        default=None, description="The older capture time of the two positions."
    )


class PartnerMapView(ApiModel):
    """An approximate area, not a precise position. Neutral when unavailable."""

    available: bool
    latitude: float | None = None
    longitude: float | None = None
    radius_meters: int | None = None
    captured_at: datetime | None = None


def _settings(view: service.SettingsView) -> PartnerLocationSettingsView:
    return PartnerLocationSettingsView(
        available=view.available,
        level=view.level,
        state=view.state,
        indefinite=view.indefinite,
        expires_at=view.expires_at,
        generation=view.generation,
        last_published_at=view.last_published_at,
    )


@router.get(
    "/spaces/{spaceId}/partner-location/settings",
    response_model=PartnerLocationSettingsView,
    operation_id="getPartnerLocationSettings",
    responses=problem_responses(401, 403, 404),
)
def get_partner_location_settings(
    authorization: Authorization, session: DbSession, response: Response
) -> PartnerLocationSettingsView:
    """The caller's own sharing state; readable without Premium."""
    response.headers["Cache-Control"] = _NO_STORE
    return _settings(service.get_settings_view(session, authorization))


@router.put(
    "/spaces/{spaceId}/partner-location/settings",
    response_model=PartnerLocationSettingsView,
    operation_id="updatePartnerLocationSettings",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def update_partner_location_settings(
    body: PartnerLocationSettingsUpdate,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PartnerLocationSettingsView:
    """Start, change or stop sharing. ``OFF`` never requires Premium."""
    response.headers["Cache-Control"] = _NO_STORE
    return _settings(
        service.update_settings(
            session,
            authorization,
            level=body.level,
            indefinite=body.indefinite,
            expires_at=body.expires_at,
        )
    )


@router.put(
    "/spaces/{spaceId}/partner-location/snapshot",
    response_model=PartnerLocationSettingsView,
    operation_id="publishPartnerLocationSnapshot",
    responses=problem_responses(401, 403, 404, 409, 422, 429),
)
def publish_partner_location_snapshot(
    body: PresencePublish,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PartnerLocationSettingsView:
    """Replace the caller's snapped snapshot; returns the caller's settings."""
    response.headers["Cache-Control"] = _NO_STORE
    return _settings(
        service.publish_snapshot(
            session,
            authorization,
            latitude=body.latitude,
            longitude=body.longitude,
            accuracy_meters=body.accuracy_meters,
            captured_at=body.captured_at,
            consent_generation=body.consent_generation,
        )
    )


@router.post(
    "/spaces/{spaceId}/partner-location/distance",
    response_model=PartnerDistanceView,
    operation_id="getPartnerDistance",
    responses=problem_responses(401, 403, 404, 422, 429),
)
def get_partner_distance(
    body: PresencePosition,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PartnerDistanceView:
    """Coarse distance band. The caller's position is a transient input only."""
    response.headers["Cache-Control"] = _NO_STORE
    view = service.partner_distance(
        session,
        authorization,
        latitude=body.latitude,
        longitude=body.longitude,
        captured_at=body.captured_at,
    )
    if not view.available or view.band is None:
        return PartnerDistanceView(available=False)
    return PartnerDistanceView(
        available=True,
        band=DistanceBandView(
            kind=view.band.kind.value,
            min_km=view.band.min_km,
            max_km=view.band.max_km,
            approximate_km=view.band.approximate_km,
        ),
        as_of=view.as_of,
    )


@router.get(
    "/spaces/{spaceId}/partner-location/map",
    response_model=PartnerMapView,
    operation_id="getPartnerLocationMap",
    responses=problem_responses(401, 403, 404, 429),
)
def get_partner_location_map(
    authorization: Authorization, session: DbSession, response: Response
) -> PartnerMapView:
    """Approximate partner area when the partner shares the map level."""
    response.headers["Cache-Control"] = _NO_STORE
    view = service.partner_map(session, authorization)
    if not view.available:
        return PartnerMapView(available=False)
    return PartnerMapView(
        available=True,
        latitude=view.latitude,
        longitude=view.longitude,
        radius_meters=view.radius_meters,
        captured_at=view.captured_at,
    )


class PresenceDeviceCredentialRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")

    device_id: UUID = Field(description="Random installation identifier generated on the device.")


class PresenceDeviceCredentialView(ApiModel):
    """Returned once; only its hash is stored. It can only publish this owner's snapshot."""

    credential: str
    expires_at: datetime
    consent_generation: int


class PresenceDevicePublish(PresencePosition):
    accuracy_meters: float = Field(ge=0, le=geo.MAX_ACCEPTED_ACCURACY_METERS)


class PresenceDevicePublishResult(ApiModel):
    active: bool = Field(
        description="False when sharing stopped; the device must disable background updates."
    )


PRESENCE_SCHEME = "Presence "


@router.put(
    "/spaces/{spaceId}/partner-location/device-credential",
    response_model=PresenceDeviceCredentialView,
    operation_id="issuePartnerLocationDeviceCredential",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def issue_partner_location_device_credential(
    body: PresenceDeviceCredentialRequest,
    authorization: Authorization,
    device_session: CurrentSession,
    session: DbSession,
    response: Response,
) -> PresenceDeviceCredentialView:
    """Issue this device's background-upload credential for the caller's active share."""
    response.headers["Cache-Control"] = _NO_STORE
    issued = device.issue(session, authorization, device_session, device_id=body.device_id)
    return PresenceDeviceCredentialView(
        credential=issued.credential,
        expires_at=issued.expires_at,
        consent_generation=issued.consent_generation,
    )


@router.delete(
    "/spaces/{spaceId}/partner-location/device-credential/{deviceId}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="revokePartnerLocationDeviceCredential",
    responses=problem_responses(401, 403, 404, 422),
)
def revoke_partner_location_device_credential(
    device_id: Annotated[UUID, Path(alias="deviceId")],
    authorization: Authorization,
    session: DbSession,
) -> Response:
    """Stop background uploads from this device; never requires Premium."""
    device.revoke(session, authorization, device_id=device_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/partner-location/device-snapshot",
    response_model=PresenceDevicePublishResult,
    operation_id="publishPartnerLocationDeviceSnapshot",
    responses=problem_responses(401, 422, 429),
)
def publish_partner_location_device_snapshot(
    body: PresenceDevicePublish,
    session: DbSession,
    response: Response,
    credential_header: Annotated[
        str | None,
        Header(
            alias="Authorization",
            description="`Presence <credential>` from issuePartnerLocationDeviceCredential.",
        ),
    ] = None,
) -> PresenceDevicePublishResult:
    """Background upload authorized only by a scoped presence device credential."""
    response.headers["Cache-Control"] = _NO_STORE
    if not credential_header or not credential_header.startswith(PRESENCE_SCHEME):
        raise UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)
    active = device.publish_with_credential(
        session,
        credential=credential_header[len(PRESENCE_SCHEME) :].strip(),
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_meters=body.accuracy_meters,
        captured_at=body.captured_at,
    )
    return PresenceDevicePublishResult(active=active)
