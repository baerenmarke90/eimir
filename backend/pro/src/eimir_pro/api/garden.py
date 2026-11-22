"""Premium-protected seams of the shared garden (#1907 H3, concept A).

Every route resolves authentication and Space membership first and then asks
the central entitlement authority for ``games.couple``. The garden holds closed
codes, dates, stages and slots only: no location, no distance and no free text
apart from the garden's own short name and the short names of its visitors.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.entitlements.models import Capability
from eimir_pro.garden import growth, history, service
from eimir_pro.garden.models import (
    GardenBouquet,
    GardenForm,
    GardenHistoryKind,
    GardenPlant,
    GardenSpecies,
    GardenUnlock,
    GardenVisitor,
    GardenWords,
)

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
    in_pond: bool = Field(
        default=False, description="A water lily: the slot is a place in the pond."
    )


class GardenBouquetFlower(ApiModel):
    species: GardenSpecies
    sender_id: UUID = Field(description="Who once sent this flower's seed (its colour).")


class GardenBouquetView(ApiModel):
    id: UUID
    giver_id: UUID
    given_on: date
    flowers: list[GardenBouquetFlower] = Field(description="One to three flowers.")


class GardenVisitorNameView(ApiModel):
    animal: GardenVisitor
    name: str = Field(description="The couple's shared name for this visitor.")


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
    shared_days: int = Field(
        default=0,
        description="Days both partners sent a seed; drives growth, never shown as a number.",
    )
    form: GardenForm = Field(default=GardenForm.BED, description="The garden's overall form.")
    unlocks: list[GardenUnlock] = Field(
        default_factory=list, description="Everything the couple's care has unlocked."
    )
    news: list[GardenUnlock] = Field(
        default_factory=list, description="Unlocks the reader has not been shown yet."
    )
    discovered: list[GardenSpecies] = Field(
        default_factory=list, description="Species in the garden book."
    )
    name: str | None = Field(default=None, description="The couple's name for the garden.")
    visitor_names: list[GardenVisitorNameView] = Field(
        default_factory=list,
        description="Names the couple gave to visiting animals; unnamed visitors are absent.",
    )
    bouquet: GardenBouquetView | None = Field(
        default=None, description="A bouquet from the partner that waits on its card."
    )
    gave_bouquet_today: bool = Field(
        default=False, description="The reader already gave a bouquet today."
    )


class GardenHistoryEntry(ApiModel):
    key: str = Field(description="Stable identity of the entry within the history.")
    kind: GardenHistoryKind
    happened_on: date = Field(description="The couple's calendar day of the entry.")
    actor_id: UUID | None = Field(
        default=None,
        description=(
            "Who did it. Absent when both did (a shared day, watering together), "
            "for a first bloom and for a seed that found its place by itself."
        ),
    )
    sender_id: UUID | None = Field(
        default=None, description="Who once sent the seed the entry is about, if any."
    )
    species: GardenSpecies | None = Field(
        default=None, description="A surprise stays `SURPRISE` until it first blooms."
    )
    words: GardenWords | None = Field(
        default=None,
        description="The seed's words; absent while the seed still waits for the reader.",
    )
    flowers: list[GardenBouquetFlower] = Field(
        default_factory=list, description="A bouquet's flowers."
    )
    waiting: bool = Field(
        default=False, description="The seed still waits for the reader to plant it."
    )


class GardenHistoryPage(ApiModel):
    items: list[GardenHistoryEntry] = Field(description="Newest first.")
    next_cursor: str | None
    has_more: bool


class GardenSeedInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    species: GardenSpecies
    words: GardenWords | None = None


class GardenWateringInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    plant_id: UUID


class GardenNameInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(
        default=None,
        max_length=200,
        description="Up to 40 characters after trimming; empty restores the default title.",
    )


class GardenVisitorNameInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(
        default=None,
        max_length=200,
        description="Up to 40 characters after trimming; empty removes the name.",
    )


class GardenBouquetInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    plant_ids: list[UUID] = Field(
        min_length=1, max_length=growth.MAX_BOUQUET, description="Blooming flowers to pick."
    )


class GardenBouquetCloseInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    kept: bool = Field(default=False, description="The bouquet was put into Momente.")


def _plant_view(plant: GardenPlant | None) -> GardenPlantView | None:
    if plant is None:
        return None
    return GardenPlantView(
        id=plant.id,
        species=growth.shown_species(plant.species, plant.bloomed),
        words=GardenWords(plant.words) if plant.words else None,
        sender_id=plant.sender_id,
        sent_on=plant.sent_on,
        stage=plant.stage,
        slot=plant.slot,
        in_pond=plant.in_pond,
    )


def _bouquet_view(bouquet: GardenBouquet | None) -> GardenBouquetView | None:
    if bouquet is None:
        return None
    return GardenBouquetView(
        id=bouquet.id,
        giver_id=bouquet.giver_id,
        given_on=bouquet.given_on,
        flowers=[
            GardenBouquetFlower(species=GardenSpecies(species), sender_id=sender)
            for species, sender in zip(bouquet.flowers, bouquet.flower_senders, strict=True)
        ],
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
        shared_days=state.shared_days,
        form=state.form,
        unlocks=state.unlocks,
        news=state.news,
        discovered=state.discovered,
        name=state.name,
        visitor_names=[
            GardenVisitorNameView(animal=animal, name=name)
            for animal, name in state.visitor_names.items()
        ],
        bouquet=_bouquet_view(state.bouquet),
        gave_bouquet_today=state.gave_bouquet_today,
    )


def _history_entry(entry: history.HistoryEntry) -> GardenHistoryEntry:
    return GardenHistoryEntry(
        key=entry.key,
        kind=entry.kind,
        happened_on=entry.happened_on,
        actor_id=entry.actor_id,
        sender_id=entry.sender_id,
        species=entry.species,
        words=entry.words,
        flowers=[
            GardenBouquetFlower(species=species, sender_id=sender)
            for species, sender in entry.flowers
        ],
        waiting=entry.waiting,
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


@router.get(
    f"{_BASE}/history",
    response_model=GardenHistoryPage,
    operation_id="listGardenHistory",
    responses=problem_responses(400, 401, 403, 404, 409, 422),
)
def list_garden_history(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=history.MAX_LIMIT)] = 20,
) -> GardenHistoryPage:
    """What happened in the garden between the two partners, newest first."""
    _ensure_games(session, authorization, write=False)
    response.headers["Cache-Control"] = "private, no-store"
    page = history.history(session, authorization, cursor=cursor, limit=limit)
    return GardenHistoryPage(
        items=[_history_entry(entry) for entry in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


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


@router.post(
    f"{_BASE}/news/seen",
    response_model=GardenView,
    operation_id="acknowledgeGardenNews",
    responses=problem_responses(401, 403, 404, 409),
)
def acknowledge_garden_news(
    authorization: Authorization, session: DbSession, response: Response
) -> GardenView:
    """The reader saw what is new in the garden; each unlock is shown once."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.acknowledge_news(session, authorization))


@router.put(
    f"{_BASE}/name",
    response_model=GardenView,
    operation_id="renameGarden",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def rename_garden(
    body: GardenNameInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> GardenView:
    """Name the shared garden; it becomes the page title for both partners."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.rename(session, authorization, body.name))


@router.put(
    f"{_BASE}/visitors/{{animal}}/name",
    response_model=GardenView,
    operation_id="nameGardenVisitor",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def name_garden_visitor(
    body: GardenVisitorNameInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
    animal: Annotated[GardenVisitor, Path()],
) -> GardenView:
    """Name a visiting animal; both partners see the same name (the duck pair shares one)."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.name_visitor(session, authorization, animal, body.name))


@router.post(
    f"{_BASE}/bouquets",
    response_model=GardenView,
    operation_id="giveGardenBouquet",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def give_garden_bouquet(
    body: GardenBouquetInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> GardenView:
    """Give up to three blooming flowers to the partner; a seed stays in each place."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.give_bouquet(session, authorization, body.plant_ids))


@router.post(
    f"{_BASE}/bouquets/{{bouquetId}}/close",
    response_model=GardenView,
    operation_id="closeGardenBouquet",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def close_garden_bouquet(
    body: GardenBouquetCloseInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
    bouquet_id: Annotated[str, Path(alias="bouquetId")],
) -> GardenView:
    """Close a received bouquet's card, optionally noting it went into Momente."""
    _ensure_games(session, authorization, write=True)
    try:
        bouquet = UUID(bouquet_id)
    except ValueError as error:
        raise NotFoundError("Bouquet not found.", "GARDEN_BOUQUET_NOT_FOUND") from error
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.close_bouquet(session, authorization, bouquet, kept=body.kept))
