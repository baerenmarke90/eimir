"""Premium-protected seams of the shared garden (#1907 H3, concept A).

Every route resolves authentication and Space membership first and then asks
the central entitlement authority for ``games.couple``. The garden holds closed
codes, dates, stages and slots only: no location, no distance, no free text.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.entitlements.models import Capability
from eimir.garden import service
from eimir.garden.models import GardenPlant, GardenSpecies, GardenWords

router = APIRouter(tags=["games"])

_BASE = "/spaces/{spaceId}/games/garden"


class GardenPlantView(ApiModel):
    id: UUID
    species: GardenSpecies
    words: GardenWords | None = Field(description="Fixed phrase the sender attached, if any.")
    sender_id: UUID
    sent_on: date
    stage: int = Field(description="`0` seed, `1` sprout, `2` bud, `3` bloom.")
    slot: int | None = Field(description="Position in the garden; absent while not planted.")


class GardenView(ApiModel):
    local_date: date = Field(description="The couple's shared calendar day.")
    plants: list[GardenPlantView] = Field(description="Planted plants in slot order.")
    incoming: GardenPlantView | None = Field(
        default=None, description="A seed that arrived for the reader and waits to be planted."
    )
    sent_today: GardenPlantView | None = Field(
        default=None, description="The reader's own seed of today, if sent."
    )
    partner_sent_today: bool
    shared_today: bool = Field(description="Both partners sent a seed today; the garden grew.")
    watered_today: UUID | None = Field(default=None, description="Plant the reader watered today.")
    partner_watered_today: UUID | None = Field(
        default=None, description="Plant the partner watered today."
    )
    offer: list[GardenSpecies] = Field(description="Seeds the reader can choose from today.")
    sleeping: bool = Field(
        description="Neither partner was in the garden for a few days; it wakes for the reader."
    )
    reunion_on: date | None = Field(
        default=None,
        description="First day of the next anticipated shared Plan, the couple's reunion.",
    )
    reunion_today: bool = Field(description="Today is a day of that reunion Plan.")


class GardenSeedInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    species: GardenSpecies
    words: GardenWords | None = None


class GardenWateringInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    plant_id: UUID


def _plant_view(plant: GardenPlant | None) -> GardenPlantView | None:
    if plant is None:
        return None
    return GardenPlantView(
        id=plant.id,
        species=GardenSpecies(plant.species),
        words=GardenWords(plant.words) if plant.words else None,
        sender_id=plant.sender_id,
        sent_on=plant.sent_on,
        stage=plant.stage,
        slot=plant.slot,
    )


def _view(state: service.GardenState) -> GardenView:
    return GardenView(
        local_date=state.local_date,
        plants=[view for plant in state.plants if (view := _plant_view(plant)) is not None],
        incoming=_plant_view(state.incoming),
        sent_today=_plant_view(state.sent_today),
        partner_sent_today=state.partner_sent_today,
        shared_today=state.shared_today,
        watered_today=state.watered_today,
        partner_watered_today=state.partner_watered_today,
        offer=list(state.offer),
        sleeping=state.sleeping,
        reunion_on=state.reunion_on,
        reunion_today=state.reunion_today,
    )


def _ensure_games(session: DbSession, authorization: Authorization, *, write: bool) -> None:
    ensure_capability(
        session,
        authorization.space_id,
        Capability.GAMES_COUPLE.value,
        lock_grants=write,
    )


@router.get(
    _BASE,
    response_model=GardenView,
    operation_id="getGarden",
    responses=problem_responses(401, 403, 404, 409),
)
def get_garden(authorization: Authorization, session: DbSession, response: Response) -> GardenView:
    """The shared garden and today's step for the reader."""
    _ensure_games(session, authorization, write=False)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.state(session, authorization))


@router.post(
    f"{_BASE}/seeds",
    response_model=GardenView,
    operation_id="sendGardenSeed",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def send_garden_seed(
    body: GardenSeedInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> GardenView:
    """Send today's seed to the partner; one per partner and day."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.send_seed(session, authorization, species=body.species, words=body.words))


@router.post(
    f"{_BASE}/seeds/{{seedId}}/plant",
    response_model=GardenView,
    operation_id="plantGardenSeed",
    responses=problem_responses(401, 403, 404, 409),
)
def plant_garden_seed(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    seed_id: Annotated[str, Path(alias="seedId")],
) -> GardenView:
    """Plant a seed that arrived for the reader."""
    _ensure_games(session, authorization, write=True)
    try:
        seed = UUID(seed_id)
    except ValueError as error:
        raise NotFoundError("Seed not found.", "GARDEN_SEED_NOT_FOUND") from error
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.plant_seed(session, authorization, seed))


@router.post(
    f"{_BASE}/waterings",
    response_model=GardenView,
    operation_id="waterGardenPlant",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def water_garden_plant(
    body: GardenWateringInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> GardenView:
    """Water one plant; a daily gesture that never changes growth."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.water(session, authorization, body.plant_id))
