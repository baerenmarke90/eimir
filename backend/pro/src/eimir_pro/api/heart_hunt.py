"""Herzversteck: Premium hide-and-seek rounds under the Games area (#1907 H3)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, PhotoBindingAuthorization, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.ids import parse_id
from eimir.entitlements.models import Capability
from eimir_pro.heart_hunt import service
from eimir_pro.heart_hunt.models import HeartHuntRound, HeartRoundState

router = APIRouter(tags=["games"])


def require_round_id(round_id: Annotated[str, Path(alias="roundId")]) -> UUID:
    parsed = parse_id(round_id)
    if parsed is None:
        raise service.absent()
    return parsed


RoundId = Annotated[UUID, Depends(require_round_id)]

PER_MILLE = Field(ge=0, le=service.SCALE, description="Position in the photo frame, 0..1000.")


class HeartPoint(ApiModel):
    x: int = PER_MILLE
    y: int = PER_MILLE


class HeartHuntRoundView(ApiModel):
    """One round as the caller may see it.

    `heart` is present for the hider and, for the seeker, only after the round
    is FOUND. The seeker's search never receives it earlier.
    """

    id: UUID
    role: Literal["HIDER", "SEEKER"]
    state: Literal["HIDDEN", "FOUND"]
    partner_id: UUID
    attachment_id: UUID | None = Field(
        description="Photo of the round; read it with parentType HEART_HUNT_ROUND."
    )
    taps: list[HeartPoint] = Field(description="Bounded marks of the search so far.")
    tap_count: int
    best_level: int = Field(ge=0, le=3, description="Warmest word reached: 0 cold .. 3 hot.")
    heart: HeartPoint | None = None
    created_at: datetime
    found_at: datetime | None
    delete_after: datetime = Field(description="When the photo is deleted for good.")
    kept: bool = Field(description="Whether the photo was saved as a shared Moment.")


class HeartHuntState(ApiModel):
    rounds: list[HeartHuntRoundView] = Field(description="Newest first, at most six.")


class HeartHuntRoundCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    request_id: UUID
    attachment_id: UUID
    heart: HeartPoint


class HeartHuntTap(ApiModel):
    model_config = ConfigDict(extra="forbid")

    x: int = PER_MILLE
    y: int = PER_MILLE


class HeartHuntTapResult(ApiModel):
    level: int = Field(ge=0, le=3, description="0 Noch kalt, 1 Lauwarm, 2 Warm, 3 Ganz heiß.")
    meter: int = Field(ge=0, le=100, description="Coarse warmth in steps of five.")
    found: bool
    round: HeartHuntRoundView


class HeartHuntKept(ApiModel):
    model_config = ConfigDict(extra="forbid")

    memory_id: UUID


def _view(heart_round: HeartHuntRound, account_id: UUID) -> HeartHuntRoundView:
    hider = heart_round.hider_id == account_id
    found = heart_round.state == HeartRoundState.FOUND.value
    reveal = hider or found
    return HeartHuntRoundView(
        id=heart_round.id,
        role="HIDER" if hider else "SEEKER",
        state="FOUND" if found else "HIDDEN",
        partner_id=heart_round.seeker_id if hider else heart_round.hider_id,
        attachment_id=heart_round.attachment_id,
        taps=[HeartPoint(x=tap[0], y=tap[1]) for tap in heart_round.taps],
        tap_count=heart_round.tap_count,
        best_level=heart_round.best_level,
        heart=HeartPoint(x=heart_round.heart_x, y=heart_round.heart_y) if reveal else None,
        created_at=heart_round.created_at,
        found_at=heart_round.found_at,
        delete_after=heart_round.purge_after,
        kept=heart_round.kept_memory_id is not None,
    )


def _premium(session: DbSession, space_id: UUID, *, lock: bool) -> None:
    ensure_capability(session, space_id, Capability.GAMES_COUPLE.value, lock_grants=lock)


@router.get(
    "/spaces/{spaceId}/games/heart-hunt",
    response_model=HeartHuntState,
    operation_id="getHeartHunt",
    responses=problem_responses(401, 403, 404),
)
def get_heart_hunt(
    authorization: Authorization, session: DbSession, response: Response
) -> HeartHuntState:
    """Open rounds of the two partners; the seeker never receives the heart early."""
    _premium(session, authorization.space_id, lock=False)
    response.headers["Cache-Control"] = "private, no-store"
    return HeartHuntState(
        rounds=[
            _view(heart_round, authorization.account_id)
            for heart_round in service.list_rounds(session, authorization)
        ]
    )


@router.post(
    "/spaces/{spaceId}/games/heart-hunt/rounds",
    response_model=HeartHuntRoundView,
    status_code=201,
    operation_id="createHeartHuntRound",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_round(
    authorization: PhotoBindingAuthorization,
    session: DbSession,
    response: Response,
    body: HeartHuntRoundCreate,
) -> HeartHuntRoundView:
    """Hide a heart in an uploaded photo and send it to the partner."""
    _premium(session, authorization.space_id, lock=True)
    response.headers["Cache-Control"] = "private, no-store"
    heart_round = service.create_round(
        session,
        authorization,
        request_id=body.request_id,
        attachment_id=body.attachment_id,
        heart_x=body.heart.x,
        heart_y=body.heart.y,
    )
    return _view(heart_round, authorization.account_id)


@router.post(
    "/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/taps",
    response_model=HeartHuntTapResult,
    operation_id="tapHeartHuntRound",
    responses=problem_responses(401, 403, 404, 422),
)
def tap_round(
    round_id: RoundId,
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: HeartHuntTap,
) -> HeartHuntTapResult:
    """Clear fog at a tap; the answer is a coarse warmth and whether the heart was found."""
    _premium(session, authorization.space_id, lock=True)
    response.headers["Cache-Control"] = "private, no-store"
    outcome = service.tap(session, authorization, round_id, x=body.x, y=body.y)
    return HeartHuntTapResult(
        level=outcome.level,
        meter=outcome.meter,
        found=outcome.found,
        round=_view(outcome.round, authorization.account_id),
    )


@router.post(
    "/spaces/{spaceId}/games/heart-hunt/rounds/{roundId}/kept",
    response_model=HeartHuntRoundView,
    operation_id="keepHeartHuntRound",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def keep_round(
    round_id: RoundId,
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: HeartHuntKept,
) -> HeartHuntRoundView:
    """Record that the found photo was saved as a shared Moment by explicit tap."""
    _premium(session, authorization.space_id, lock=True)
    response.headers["Cache-Control"] = "private, no-store"
    heart_round = service.mark_kept(session, authorization, round_id, memory_id=body.memory_id)
    return _view(heart_round, authorization.account_id)
