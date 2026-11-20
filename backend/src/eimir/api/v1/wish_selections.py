"""Current-round API; personal selections never have a partner-addressable route.

Candidates are typed. ``candidates`` keeps its original Wish-only shape for
existing clients; curated date ideas (Pro ``planning.date_inspiration``) are
listed separately in ``dateIdeaCandidates`` and carry catalog content only while
the Space holds the capability.
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response
from pydantic import ConfigDict, Field, StringConstraints

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.wish_selections import service
from eimir.wish_selections.date_idea_contract import IDEA_ID_PATTERN, DateIdea
from eimir.wishes.models import WishStatus

router = APIRouter(tags=["wish-selections"])


DateIdeaId = Annotated[str, StringConstraints(pattern=IDEA_ID_PATTERN, max_length=32)]
_PRO_DENIAL = (
    "`PREMIUM_ENTITLEMENT_REQUIRED`: the round contains curated date ideas and the "
    "Space lacks the Pro capability `planning.date_inspiration`."
)


class WishSelectionRoundUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    wish_ids: list[UUID] = Field(
        default_factory=list,
        max_length=5,
        description="Space Wishes. Together with `dateIdeaIds`: two to five candidates.",
    )
    date_idea_ids: list[DateIdeaId] = Field(
        default_factory=list,
        max_length=5,
        description="Curated catalog ideas; requires `planning.date_inspiration`.",
    )
    title: str | None = Field(default=None, max_length=60)


class WishSelectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    favorite_wish_ids: list[UUID] = Field(max_length=5)
    favorite_date_idea_ids: list[DateIdeaId] | None = Field(
        default=None,
        max_length=5,
        description="Required when the round has date-idea candidates.",
    )
    published: bool


class WishSelectionDecisionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    action: service.DecisionAction = Field(
        description=(
            "`REQUEST_RANDOM` asks the partner whether chance may decide (a request from"
            " each partner is consent); `ACCEPT_RANDOM` lets the server draw once;"
            " `DECLINE_RANDOM` keeps deciding together; `WITHDRAW_RANDOM` removes the own"
            " request; `CHOOSE` decides one of several common favourites; `CLEAR`"
            " undoes the decision."
        )
    )
    wish_id: UUID | None = Field(default=None, description="For `CHOOSE`: a common Wish.")
    date_idea_id: DateIdeaId | None = Field(
        default=None, description="For `CHOOSE`: a common date idea."
    )


class WishSelectionDecisionView(ApiModel):
    wish_id: UUID | None
    date_idea_id: str | None
    method: Literal["RANDOM", "MANUAL"]


class WishSelectionRandomRequestView(ApiModel):
    mine: bool = Field(description="True when the caller asked; false when the partner did.")
    declined: bool = Field(description="The partner would rather decide together.")


class WishSelectionCandidateView(ApiModel):
    wish_id: UUID
    title: str
    version: int
    status: WishStatus
    plan_id: UUID | None


class WishSelectionDateIdeaCandidateView(ApiModel):
    date_idea_id: str = Field(description="Persistent catalog ID. Never a Wish or Plan ID.")
    current: bool = Field(
        description="False when the catalog removed or changed this idea; review the round."
    )
    idea: DateIdea | None = Field(
        description="Current catalog content; null without the Pro capability or when removed."
    )


class WishSelectionOwnView(ApiModel):
    favorite_wish_ids: list[UUID]
    favorite_date_idea_ids: list[str]
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
    date_idea_candidates: list[WishSelectionDateIdeaCandidateView]
    common_date_idea_ids: list[str]
    decision: WishSelectionDecisionView | None = Field(
        default=None, description="The decided candidate, the same on both devices."
    )
    random_request: WishSelectionRandomRequestView | None = None
    random_pool: service.RandomPool | None = Field(
        default=None,
        description=(
            "Whether chance may decide and from what kind of pool; the pool itself"
            " is never returned. Null when chance is not offered."
        ),
    )


def _view(
    projection: service.SelectionProjection,
    response: Response,
    locale: str | None,
    viewer: UUID,
) -> WishSelectionView:
    round = projection.round
    own = projection.own
    eligible = {candidate.wish.id for candidate in projection.candidates}
    eligible_ideas = {idea.date_idea_id for idea in projection.date_idea_candidates}
    catalog = service.date_idea_source() if projection.date_ideas_allowed else None

    def idea_content(idea_id: str) -> DateIdea | None:
        # Catalog content only for an entitled Space; IDs alone carry no copy.
        if catalog is None:
            return None
        return catalog.view(idea_id, locale)

    random_request = None
    if round is not None and round.random_requested_by is not None:
        random_request = WishSelectionRandomRequestView(
            mine=round.random_requested_by == viewer, declined=round.random_declined
        )
    decision = projection.decision
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
            favorite_date_idea_ids=[
                item for item in own.payload.favorite_date_idea_ids if item in eligible_ideas
            ]
            if own
            else [],
            published=own.published if own else False,
            version=own.version if own else 0,
        ),
        selection_token=projection.selection_token,
        round_token=projection.round_token,
        result_state=projection.result_state,
        common_wish_ids=projection.common_wish_ids,
        date_idea_candidates=[
            WishSelectionDateIdeaCandidateView(
                date_idea_id=idea.date_idea_id,
                current=idea.current,
                idea=idea_content(idea.date_idea_id),
            )
            for idea in projection.date_idea_candidates
        ],
        common_date_idea_ids=projection.common_date_idea_ids,
        decision=WishSelectionDecisionView(
            wish_id=decision.wish_id,
            date_idea_id=decision.date_idea_id,
            method=decision.method.value,
        )
        if decision
        else None,
        random_request=random_request if projection.result_state == "READY" else None,
        random_pool=projection.random_pool,
    )


Locale = Annotated[
    str | None,
    Query(max_length=16, description="Preferred locale for date-idea content."),
]


@router.get(
    "/spaces/{spaceId}/wish-selection",
    response_model=WishSelectionView,
    operation_id="getWishSelection",
    responses=problem_responses(401, 404),
)
def get_wish_selection(
    authorization: Authorization, session: DbSession, response: Response, locale: Locale = None
) -> WishSelectionView:
    return _view(
        service.get_selection(session, authorization), response, locale, authorization.account_id
    )


@router.put(
    "/spaces/{spaceId}/wish-selection",
    response_model=WishSelectionView,
    operation_id="replaceWishSelectionRound",
    responses=problem_responses(401, 403, 404, 409, 422, descriptions={403: _PRO_DENIAL}),
)
def replace_wish_selection_round(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_token: IfMatchToken,
    body: WishSelectionRoundUpdate,
    locale: Locale = None,
) -> WishSelectionView:
    return _view(
        service.replace_round(
            session,
            authorization,
            expected_token=expected_token,
            wish_ids=body.wish_ids,
            title=body.title,
            date_idea_ids=body.date_idea_ids,
        ),
        response,
        locale,
        authorization.account_id,
    )


@router.put(
    "/spaces/{spaceId}/wish-selection/own",
    response_model=WishSelectionView,
    operation_id="updateOwnWishSelection",
    responses=problem_responses(401, 403, 404, 409, 422, descriptions={403: _PRO_DENIAL}),
)
def update_own_wish_selection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_token: IfMatchToken,
    body: WishSelectionUpdate,
    locale: Locale = None,
) -> WishSelectionView:
    return _view(
        service.update_own_selection(
            session,
            authorization,
            expected_token=expected_token,
            favorite_wish_ids=body.favorite_wish_ids,
            published=body.published,
            favorite_date_idea_ids=body.favorite_date_idea_ids,
        ),
        response,
        locale,
        authorization.account_id,
    )


@router.put(
    "/spaces/{spaceId}/wish-selection/decision",
    response_model=WishSelectionView,
    operation_id="decideWishSelection",
    responses=problem_responses(401, 403, 404, 409, 422, descriptions={403: _PRO_DENIAL}),
)
def decide_wish_selection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_token: IfMatchToken,
    body: WishSelectionDecisionUpdate,
    locale: Locale = None,
) -> WishSelectionView:
    # Decide a revealed round; If-Match is the caller's current selection token.
    return _view(
        service.decide(
            session,
            authorization,
            expected_token=expected_token,
            action=body.action,
            wish_id=body.wish_id,
            date_idea_id=body.date_idea_id,
        ),
        response,
        locale,
        authorization.account_id,
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
