"""HTTP contract for the shared current-day Daily Check-in foundation."""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Self

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field, RootModel, model_validator

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.daily_checkins import service
from eimir.daily_checkins.context import DailyCheckInErrorCode
from eimir.relationship.models import DailyCheckInVisibilityMode

router = APIRouter(tags=["daily-check-ins"])

ETAG_HEADERS = {
    "ETag": {
        "description": (
            "Opaque owner-state concurrency token. Send it unchanged in the next "
            "Daily Check-in write request's `If-Match` header."
        ),
        "schema": {"type": "string"},
    }
}


class DailyCheckInOwnView(ApiModel):
    """Only the caller's current-day state; partner row metadata is never exposed."""

    version: int
    energy_level: int | None


class PartnerEnergyHidden(ApiModel):
    """Mutual Reveal is closed and intentionally carries no partner side channel."""

    state: Literal[service.PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN]


class PartnerEnergyNoCheckIn(ApiModel):
    state: Literal[service.PartnerRevealState.NO_CHECK_IN]


class PartnerEnergyVisible(ApiModel):
    state: Literal[service.PartnerRevealState.VISIBLE]
    value: int


PartnerEnergyVariant = Annotated[
    PartnerEnergyHidden | PartnerEnergyNoCheckIn | PartnerEnergyVisible,
    Field(discriminator="state"),
]


class PartnerEnergyProjection(RootModel[PartnerEnergyVariant]):
    """Named discriminated partner Energy state without hidden optional fields."""

    root: PartnerEnergyVariant


class DailyCheckInEnergyView(ApiModel):
    visibility_mode: DailyCheckInVisibilityMode
    partner: PartnerEnergyProjection


class DailyCheckInTodayView(ApiModel):
    checked_on: date
    daily_context_timezone: str
    own: DailyCheckInOwnView
    energy: DailyCheckInEnergyView | None


EnergyLevel = Literal[10, 20, 30, 40, 50, 60, 70, 80, 90, 100]


class DailyCheckInUpdate(ApiModel):
    """Partial owner mutation for dimensions whose product values are decided.

    Vibe is intentionally absent: #429 has not yet frozen the product enum, so
    accepting a string here would turn an implementation guess into API state.
    """

    model_config = ConfigDict(extra="forbid")

    energy_level: EnergyLevel | None = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one Daily Check-in dimension must be supplied")
        return self


def _partner_energy_view(
    projection: service.PartnerDimensionProjection,
) -> PartnerEnergyProjection:
    if projection.state is service.PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN:
        return PartnerEnergyProjection(PartnerEnergyHidden(state=projection.state))
    if projection.state is service.PartnerRevealState.NO_CHECK_IN:
        return PartnerEnergyProjection(PartnerEnergyNoCheckIn(state=projection.state))
    if projection.value is None:
        raise RuntimeError("VISIBLE partner Energy is missing its value.")
    return PartnerEnergyProjection(
        PartnerEnergyVisible(state=projection.state, value=projection.value)
    )


def _view(projection: service.TodayProjection) -> DailyCheckInTodayView:
    own = projection.own
    energy = None
    if projection.energy_enabled:
        partner = projection.partner_energy
        if partner is None:
            raise RuntimeError("Enabled Energy projection is missing partner state.")
        energy = DailyCheckInEnergyView(
            visibility_mode=projection.energy_visibility_mode,
            partner=_partner_energy_view(partner),
        )
    return DailyCheckInTodayView(
        checked_on=projection.checked_on,
        daily_context_timezone=projection.daily_context_timezone,
        own=DailyCheckInOwnView(
            version=own.version if own is not None else 0,
            energy_level=own.energy_level if own is not None else None,
        ),
        energy=energy,
    )


def _headers(response: Response, projection: service.TodayProjection) -> None:
    response.headers["ETag"] = etag_for_token(service.concurrency_token(projection.own))
    response.headers["Cache-Control"] = "private, no-store"


@router.get(
    "/spaces/{spaceId}/daily-check-in/today",
    response_model=DailyCheckInTodayView,
    operation_id="getDailyCheckInToday",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            404,
            409,
            descriptions={
                409: (
                    f"`{DailyCheckInErrorCode.CONTEXT_UNAVAILABLE}`: the Space has no "
                    "valid authoritative Daily Check-in time zone."
                )
            },
        ),
    },
)
def get_daily_check_in_today(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> DailyCheckInTodayView:
    projection = service.get_today(session, authorization)
    _headers(response, projection)
    return _view(projection)


@router.patch(
    "/spaces/{spaceId}/daily-check-in/today",
    response_model=DailyCheckInTodayView,
    operation_id="updateDailyCheckInToday",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            403,
            404,
            409,
            422,
            descriptions={
                403: "`SPACE_MODULE_DISABLED`: new Energy participation is disabled.",
                409: (
                    "`RESOURCE_VERSION_CONFLICT`: the owner state changed, or "
                    f"`{DailyCheckInErrorCode.CONTEXT_UNAVAILABLE}`: the shared day "
                    "cannot be resolved."
                ),
            },
        ),
    },
)
def update_daily_check_in_today(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: DailyCheckInUpdate,
    expected_token: IfMatchToken,
) -> DailyCheckInTodayView:
    projection = service.set_energy(
        session,
        authorization,
        expected_token=expected_token,
        energy_level=body.energy_level,
    )
    _headers(response, projection)
    return _view(projection)
