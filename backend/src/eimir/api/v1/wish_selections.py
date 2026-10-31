"""Current-round API; personal selections never have a partner-addressable route."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.wish_selections import service
from eimir.wishes.models import WishStatus

router = APIRouter(tags=["wish-selections"])


class WishSelectionRoundUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    wish_ids: list[UUID] = Field(min_length=2, max_length=5)
    title: str | None = Field(default=None, max_length=60)


class WishSelectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    favorite_wish_ids: list[UUID] = Field(max_length=5)
    published: bool


class WishSelectionCandidateView(ApiModel):
    wish_id: UUID
    title: str
    version: int
    status: WishStatus
    plan_id: UUID | None


class WishSelectionOwnView(ApiModel):
    favorite_wish_ids: list[UUID]
    published: bool
    version: int


class WishSelectionView(ApiModel):
    id: UUID | None
    version: int
    title: str | None
    candidates: list[WishSelectionCandidateView]
    own: WishSelectionOwnView
    selection_token: str | None
    round_token: str
    result_state: service.ResultState
    common_wish_ids: list[UUID]


def _view(projection: service.SelectionProjection, response: Response) -> WishSelectionView:
    round = projection.round
    own = projection.own
    eligible = {candidate.wish.id for candidate in projection.candidates}
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["ETag"] = etag_for_token(projection.round_token)
    return WishSelectionView(
        id=round.id if round else None,
        version=round.version if round else 0,
        title=round.payload.title if round else None,
        candidates=[
            WishSelectionCandidateView(
                wish_id=candidate.wish.id,
                title=candidate.wish.payload.title,
                version=candidate.wish.version,
                status=WishStatus(candidate.wish.status),
                plan_id=candidate.plan_id,
            )
            for candidate in projection.candidates
        ],
        own=WishSelectionOwnView(
            favorite_wish_ids=[item for item in own.payload.favorite_wish_ids if item in eligible]
            if own
            else [],
            published=own.published if own else False,
            version=own.version if own else 0,
        ),
        selection_token=projection.selection_token,
        round_token=projection.round_token,
        result_state=projection.result_state,
        common_wish_ids=projection.common_wish_ids,
    )


@router.get(
    "/spaces/{spaceId}/wish-selection",
    response_model=WishSelectionView,
    operation_id="getWishSelection",
    responses=problem_responses(401, 404),
)
def get_wish_selection(
    authorization: Authorization, session: DbSession, response: Response
) -> WishSelectionView:
    return _view(service.get_selection(session, authorization), response)


@router.put(
    "/spaces/{spaceId}/wish-selection",
    response_model=WishSelectionView,
    operation_id="replaceWishSelectionRound",
    responses=problem_responses(401, 404, 409, 422),
)
def replace_wish_selection_round(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_token: IfMatchToken,
    body: WishSelectionRoundUpdate,
) -> WishSelectionView:
    return _view(
        service.replace_round(
            session,
            authorization,
            expected_token=expected_token,
            wish_ids=body.wish_ids,
            title=body.title,
        ),
        response,
    )


@router.put(
    "/spaces/{spaceId}/wish-selection/own",
    response_model=WishSelectionView,
    operation_id="updateOwnWishSelection",
    responses=problem_responses(401, 404, 409, 422),
)
def update_own_wish_selection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_token: IfMatchToken,
    body: WishSelectionUpdate,
) -> WishSelectionView:
    return _view(
        service.update_own_selection(
            session,
            authorization,
            expected_token=expected_token,
            favorite_wish_ids=body.favorite_wish_ids,
            published=body.published,
        ),
        response,
    )


@router.delete(
    "/spaces/{spaceId}/wish-selection",
    status_code=204,
    operation_id="closeWishSelectionRound",
    responses=problem_responses(401, 404, 409, 422),
)
def close_wish_selection_round(
    authorization: Authorization, session: DbSession, expected_token: IfMatchToken
) -> None:
    service.close_round(session, authorization, expected_token=expected_token)
