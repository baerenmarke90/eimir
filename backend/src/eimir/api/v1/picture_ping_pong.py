"""Premium-protected picture ping-pong seams (#1907 H3, concept B).

Every route resolves authentication and Space membership first and then asks
the central entitlement authority for ``games.couple``; the client's own
knowledge of the tier is never trusted. The picture holds strokes and turn
state only: no location, no distance and no rendered image.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.entitlements.models import Capability
from eimir.picture_ping_pong import service
from eimir.picture_ping_pong.models import (
    MAX_STROKE_VALUES,
    MAX_STROKES_PER_TURN,
    MAX_TURNS,
    MIN_STROKE_VALUES,
    PictureColour,
    PicturePingPong,
    PictureStarter,
)

router = APIRouter(tags=["games"])

_BASE = "/spaces/{spaceId}/games/picture-ping-pong"


class PictureStrokeView(ApiModel):
    turn: int = Field(description="`0` is the starting squiggle; `1` to `6` are the turns.")
    author_id: UUID | None = Field(description="Absent for the starting squiggle.")
    # `PERSON` resolves to the author's own person colour on each device.
    colour: PictureColour
    points: list[int] = Field(
        description="Flat `x0, y0, x1, y1, ...` list on a 0 to 1000 grid.",
    )


class PicturePingPongView(ApiModel):
    id: UUID
    status: str = Field(description="`DRAWING` while turns remain, then `FINISHED`.")
    drawer_id: UUID | None = Field(description="Whose turn it is; absent once finished.")
    started_by: UUID
    turns_done: int
    max_turns: int
    finished_early: bool
    saved_memory_id: UUID | None = Field(
        description="The Memory the finished picture was saved to, if the couple chose so."
    )
    strokes: list[PictureStrokeView]
    updated_at: datetime


class PicturePingPongState(ApiModel):
    picture: PicturePingPongView | None = None


class PictureStartInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    starter: PictureStarter = Field(
        default=PictureStarter.SQUIGGLE,
        description="`SQUIGGLE` begins with a small seed line, `BLANK` with an empty page.",
    )


class PictureStrokeInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    colour: PictureColour
    points: list[int] = Field(
        min_length=MIN_STROKE_VALUES,
        max_length=MAX_STROKE_VALUES,
        description="Flat `x0, y0, x1, y1, ...` list on a 0 to 1000 grid.",
    )


class PictureTurnInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    turns_done: int = Field(
        ge=0,
        le=MAX_TURNS,
        description="The turn count this client saw; a mismatch is a conflict.",
    )
    strokes: list[PictureStrokeInput] = Field(min_length=1, max_length=MAX_STROKES_PER_TURN)


class PictureFinishInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    turns_done: int = Field(ge=0, le=MAX_TURNS)


class PictureSavedInput(ApiModel):
    model_config = ConfigDict(extra="forbid")

    memory_id: UUID


def _view(picture: PicturePingPong | None) -> PicturePingPongState:
    if picture is None:
        return PicturePingPongState()
    return PicturePingPongState(
        picture=PicturePingPongView(
            id=picture.id,
            status=picture.status,
            drawer_id=picture.drawer_id,
            started_by=picture.started_by,
            turns_done=picture.turns_done,
            max_turns=MAX_TURNS,
            finished_early=picture.finished_early,
            saved_memory_id=picture.saved_memory_id,
            strokes=[
                PictureStrokeView(
                    turn=stroke.turn,
                    author_id=stroke.author_id,
                    colour=PictureColour(stroke.colour),
                    points=stroke.points,
                )
                for stroke in picture.payload.strokes
            ],
            updated_at=picture.updated_at,
        )
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
    response_model=PicturePingPongState,
    operation_id="getPicturePingPong",
    responses=problem_responses(401, 403, 404),
)
def get_picture_ping_pong(
    authorization: Authorization, session: DbSession, response: Response
) -> PicturePingPongState:
    """The current shared picture, or `null` when none was started."""
    _ensure_games(session, authorization, write=False)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.get_picture(session, authorization))


@router.post(
    _BASE,
    response_model=PicturePingPongState,
    operation_id="startPicturePingPong",
    responses=problem_responses(401, 403, 404, 409),
)
def start_picture_ping_pong(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PictureStartInput | None = None,
) -> PicturePingPongState:
    """Open a new picture; the partner who opens it draws first.

    Without a body the picture begins with the seed squiggle.
    """
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    starter = body.starter if body is not None else PictureStarter.SQUIGGLE
    return _view(service.start(session, authorization, starter=starter))


@router.post(
    f"{_BASE}/turns",
    response_model=PicturePingPongState,
    operation_id="handOverPicturePingPongTurn",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def hand_over_picture_ping_pong_turn(
    body: PictureTurnInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PicturePingPongState:
    """Add up to three strokes for the current turn and pass the picture on."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(
        service.hand_over(
            session,
            authorization,
            expected_turns_done=body.turns_done,
            strokes=[
                service.StrokeInput(colour=stroke.colour.value, points=list(stroke.points))
                for stroke in body.strokes
            ],
        )
    )


@router.post(
    f"{_BASE}/finish",
    response_model=PicturePingPongState,
    operation_id="finishPicturePingPong",
    responses=problem_responses(401, 403, 404, 409),
)
def finish_picture_ping_pong(
    body: PictureFinishInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PicturePingPongState:
    """Either partner may call the picture finished early."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.finish(session, authorization, expected_turns_done=body.turns_done))


@router.post(
    f"{_BASE}/saved",
    response_model=PicturePingPongState,
    operation_id="markPicturePingPongSaved",
    responses=problem_responses(401, 403, 404, 409),
)
def mark_picture_ping_pong_saved(
    body: PictureSavedInput,
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> PicturePingPongState:
    """Record the Memory the finished picture was saved to (explicit tap only)."""
    _ensure_games(session, authorization, write=True)
    response.headers["Cache-Control"] = "private, no-store"
    return _view(service.mark_saved(session, authorization, memory_id=body.memory_id))
