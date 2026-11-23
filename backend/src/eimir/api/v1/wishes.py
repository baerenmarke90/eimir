"""HTTP contract for M3 wishes."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from fastapi import status as http_status
from pydantic import AwareDatetime, ConfigDict, Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.core.context_tags import ContextTags, unique_tags
from eimir.plans.models import PlanStatus
from eimir.wishes import concealment, date_proposals, reminders, service
from eimir.wishes.journey import NO_JOURNEY, WishJourney, journey_for, journeys_for
from eimir.wishes.models import Wish, WishStatus

router = APIRouter(tags=["wishes"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class WishCreate(ApiModel):
    """A wish is created from authored title and optional shared context labels.

    ``extra=\"forbid\"`` is more than hygiene here: M3-D01/D02 make
    ``status``, ``createdBy``, ``spaceId``, and ``version`` server-controlled.
    A request supplying those fields is rejected rather than silently stripped,
    so the client cannot believe it successfully set them.
    """

    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | SkipJsonSchema[None] = None
    tags: ContextTags = Field(default_factory=list)

    _unique_tags = field_validator("tags")(unique_tags)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("description")
    @classmethod
    def _description_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("description must not be null")
        return value


class WishRepeat(ApiModel):
    """Optional overrides for "Nochmal erleben" (#1816).

    Anything omitted is copied from the completed source Wish. Status, the
    follow-up link, and the series fields are server-controlled and rejected.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | SkipJsonSchema[None] = None
    tags: ContextTags | SkipJsonSchema[None] = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("tags")
    @classmethod
    def _tags_unique(cls, value: ContextTags | None) -> ContextTags | None:
        if value is not None:
            unique_tags(value)
        return value


class WishUpdate(ApiModel):
    """Wish content correction. Explicit null clears the description.

    There is deliberately no ``status`` field. Wish status is controlled only
    by explicit lifecycle commands; an arbitrary status PATCH would provide a
    way around those transitions.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | None = None
    tags: ContextTags | SkipJsonSchema[None] = None

    @field_validator("tags")
    @classmethod
    def _tags_not_null(cls, value: ContextTags | None) -> ContextTags:
        if value is None:
            raise ValueError("tags must not be null")
        unique_tags(value)
        return value

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        return self


class WishPlanReference(ApiModel):
    """The Plan that originated from this Wish (``Plan.sourceWishId``).

    Read-only journey context for presentation (#1790 F2). It carries only
    what a Wish surface needs to point to the Plan and show when it happens;
    the Plan itself stays the source of truth. ``plannedOn`` is a date-only
    schedule and ``plannedStart`` an exact instant; at most one is set, and
    both are null for a Plan without a date. ``experiencedOn`` is set once
    the Plan was completed.
    """

    id: UUID
    status: PlanStatus
    planned_on: date | None
    planned_until: date | None = None
    planned_start: datetime | None
    experienced_on: date | None


class WishDetail(ApiModel):
    id: UUID
    space_id: UUID
    created_by: UUID
    title: str
    description: str | None = None
    tags: ContextTags = Field(default_factory=list)
    status: WishStatus
    version: int
    created_at: datetime
    updated_at: datetime
    creator: AuthorSummary
    capabilities: ResourceCapabilities
    followed_from_wish_id: UUID | None = Field(
        description=(
            'The completed Wish this one repeats ("Nochmal erleben"); null for a first '
            "Wish or after the source was deleted."
        ),
    )
    series_id: UUID = Field(
        description="Groups a Wish with its repeats; equals the first Wish's ID.",
    )
    series_position: int = Field(
        ge=1,
        description="1 for the first Wish of a series, 2 for its first repeat, and so on.",
    )
    plan: WishPlanReference | None = Field(
        description=(
            "Originating Plan of a PLANNED or COMPLETED Wish; null for OPEN, "
            "directly completed, or returned Wishes."
        ),
    )
    has_memory: bool = Field(
        description=(
            "Whether a Memory is linked to this PLANNED or COMPLETED Wish or to "
            "its originating Plan; always false for OPEN Wishes."
        ),
    )
    hidden_during_game: bool = Field(
        default=False,
        description=(
            "True while an open game hides this Wish from the reader, for example a "
            "partner's Wish that may still be the answer in Wish detective. Title, "
            "description and tags are then empty, the series fields point to the Wish "
            "itself, every capability is false and writes are refused with "
            "`WISH_HIDDEN_DURING_GAME`. The game reveals it with its round or at the end."
        ),
    )


class WishPage(ApiModel):
    items: list[WishDetail]
    next_cursor: str | None
    has_more: bool


class WishDateProposalWrite(ApiModel):
    """A particular instant and the identity of a retryable send."""

    model_config = ConfigDict(extra="forbid")

    planned_start: AwareDatetime
    client_request_id: UUID


class WishDateProposal(ApiModel):
    id: UUID
    proposed_by: UUID
    recipient_id: UUID
    planned_start: datetime
    counter: bool


class WishDateProposalState(ApiModel):
    can_propose: bool
    proposal: WishDateProposal | None


class WishDateProposalAcceptance(ApiModel):
    plan_id: UUID


_WISH_DATE_PROPOSAL_PATH = "/spaces/{spaceId}/wishes/{wishId}/date-proposal"
_WISH_DATE_PROPOSAL_ITEM = f"{_WISH_DATE_PROPOSAL_PATH}/{{proposalId}}"
_PROPOSAL_WRITE_ERRORS = problem_responses(401, 404, 409, 422)
_WISH_ID = Annotated[str, Path(alias="wishId")]
_PROPOSAL_ID = Annotated[UUID, Path(alias="proposalId")]


def _date_proposal_state(
    state: date_proposals.ProposalState, response: Response
) -> WishDateProposalState:
    response.headers["Cache-Control"] = "private, no-store"
    proposal = state.proposal
    return WishDateProposalState(
        can_propose=state.can_propose,
        proposal=(
            WishDateProposal(
                id=proposal.id,
                proposed_by=proposal.proposed_by,
                recipient_id=proposal.recipient_id,
                planned_start=proposal.planned_start,
                counter=proposal.counter,
            )
            if proposal is not None
            else None
        ),
    )


@router.get(
    _WISH_DATE_PROPOSAL_PATH,
    operation_id="getWishDateProposal",
    responses=problem_responses(401, 404, 422),
)
def get_wish_date_proposal(
    authorization: Authorization, session: DbSession, response: Response, wish_id: _WISH_ID
) -> WishDateProposalState:
    return _date_proposal_state(date_proposals.get_state(session, authorization, wish_id), response)


@router.post(
    _WISH_DATE_PROPOSAL_PATH,
    operation_id="createWishDateProposal",
    responses=_PROPOSAL_WRITE_ERRORS,
)
def create_wish_date_proposal(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: _WISH_ID,
    body: WishDateProposalWrite,
) -> WishDateProposalState:
    state = date_proposals.propose(
        session,
        authorization,
        wish_id,
        planned_start=body.planned_start,
        client_request_id=body.client_request_id,
    )
    return _date_proposal_state(state, response)


@router.post(
    f"{_WISH_DATE_PROPOSAL_ITEM}/counter",
    operation_id="counterWishDateProposal",
    responses=_PROPOSAL_WRITE_ERRORS,
)
def counter_wish_date_proposal(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: _WISH_ID,
    proposal_id: _PROPOSAL_ID,
    body: WishDateProposalWrite,
) -> WishDateProposalState:
    state = date_proposals.propose(
        session,
        authorization,
        wish_id,
        planned_start=body.planned_start,
        client_request_id=body.client_request_id,
        counter_against=proposal_id,
    )
    return _date_proposal_state(state, response)


@router.post(
    f"{_WISH_DATE_PROPOSAL_ITEM}/accept",
    operation_id="acceptWishDateProposal",
    responses=_PROPOSAL_WRITE_ERRORS,
)
def accept_wish_date_proposal(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: _WISH_ID,
    proposal_id: _PROPOSAL_ID,
) -> WishDateProposalAcceptance:
    plan_id = date_proposals.accept(session, authorization, wish_id, proposal_id)
    response.headers["Cache-Control"] = "private, no-store"
    return WishDateProposalAcceptance(plan_id=plan_id)


@router.post(
    f"{_WISH_DATE_PROPOSAL_ITEM}/decline",
    operation_id="declineWishDateProposal",
    status_code=http_status.HTTP_204_NO_CONTENT,
    responses=_PROPOSAL_WRITE_ERRORS,
)
def decline_wish_date_proposal(
    authorization: Authorization,
    session: DbSession,
    wish_id: _WISH_ID,
    proposal_id: _PROPOSAL_ID,
) -> Response:
    date_proposals.dismiss(session, authorization, wish_id, proposal_id, decline=True)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


@router.post(
    f"{_WISH_DATE_PROPOSAL_ITEM}/withdraw",
    operation_id="withdrawWishDateProposal",
    status_code=http_status.HTTP_204_NO_CONTENT,
    responses=_PROPOSAL_WRITE_ERRORS,
)
def withdraw_wish_date_proposal(
    authorization: Authorization,
    session: DbSession,
    wish_id: _WISH_ID,
    proposal_id: _PROPOSAL_ID,
) -> Response:
    date_proposals.dismiss(session, authorization, wish_id, proposal_id, decline=False)
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


class PersonalWishReminder(ApiModel):
    """Current pending schedule visible only to its owner."""

    due_at: datetime | None


class PersonalWishReminderUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    due_at: AwareDatetime


_PERSONAL_REMINDER_PATH = "/spaces/{spaceId}/wishes/{wishId}/reminder"


@router.get(
    _PERSONAL_REMINDER_PATH,
    operation_id="getPersonalWishReminder",
    responses=problem_responses(401, 404, 422),
)
def get_personal_wish_reminder(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> PersonalWishReminder:
    reminder = reminders.get_own(session, authorization, wish_id)
    response.headers["Cache-Control"] = "private, no-store"
    return PersonalWishReminder(due_at=reminder.due_at if reminder is not None else None)


@router.put(
    _PERSONAL_REMINDER_PATH,
    operation_id="setPersonalWishReminder",
    responses=problem_responses(401, 404, 409, 422),
)
def set_personal_wish_reminder(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: Annotated[str, Path(alias="wishId")],
    body: PersonalWishReminderUpdate,
) -> PersonalWishReminder:
    reminder = reminders.set_own(session, authorization, wish_id, body.due_at)
    response.headers["Cache-Control"] = "private, no-store"
    return PersonalWishReminder(due_at=reminder.due_at)


@router.delete(
    _PERSONAL_REMINDER_PATH,
    operation_id="clearPersonalWishReminder",
    status_code=http_status.HTTP_204_NO_CONTENT,
    responses=problem_responses(401, 404, 422),
)
def clear_personal_wish_reminder(
    authorization: Authorization,
    session: DbSession,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> Response:
    reminders.clear_own(session, authorization, wish_id)
    return Response(
        status_code=http_status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "private, no-store"}
    )


def _hidden_wish_detail(wish: Wish, creator: AuthorSummary) -> WishDetail:
    """A placeholder that keeps the list's shape but names nothing (#2158 H)."""
    return WishDetail(
        id=wish.id,
        space_id=wish.space_id,
        created_by=wish.owner_id,
        title="",
        description=None,
        tags=[],
        status=WishStatus(wish.status),
        version=wish.version,
        created_at=wish.created_at,
        updated_at=wish.updated_at,
        creator=creator,
        # A repeat would point to the completed Wish it copies, title included.
        followed_from_wish_id=None,
        series_id=wish.id,
        series_position=1,
        capabilities=ResourceCapabilities(can_edit=False, can_delete=False, can_comment=False),
        plan=None,
        has_memory=False,
        hidden_during_game=True,
    )


def wish_detail(
    session: DbSession,
    authorization: Authorization,
    wish: Wish,
    creator: AuthorSummary | None = None,
    journey: WishJourney | None = None,
    hidden: frozenset[UUID] | None = None,
) -> WishDetail:
    if creator is None:
        creator = resolve_author_summary(session, wish.owner_id, resource="Wish creator")
    if hidden is None:
        hidden = concealment.hidden_wish_ids(session, authorization)
    if wish.id in hidden:
        return _hidden_wish_detail(wish, creator)
    if journey is None:
        journey = journey_for(session, authorization, wish)
    plan = journey.plan
    return WishDetail(
        id=wish.id,
        space_id=wish.space_id,
        created_by=wish.owner_id,
        title=wish.payload.title,
        description=wish.payload.description,
        tags=wish.payload.tags,
        status=WishStatus(wish.status),
        version=wish.version,
        created_at=wish.created_at,
        updated_at=wish.updated_at,
        creator=creator,
        followed_from_wish_id=wish.followed_from_wish_id,
        series_id=wish.series_id,
        series_position=wish.series_position,
        capabilities=ResourceCapabilities(
            # M3-D01: a wish belongs to the couple. ``createdBy`` is
            # attribution, not an ACL; both partners may edit it.
            can_edit=True,
            # A PLANNED wish is resolved through its plan rather than deleted
            # directly (M3-D05).
            can_delete=wish.status != WishStatus.PLANNED.value,
            # M3 does not introduce Wish as a comment target.
            can_comment=False,
        ),
        plan=(
            WishPlanReference(
                id=plan.id,
                status=PlanStatus(plan.status),
                planned_on=plan.planned_on,
                planned_until=plan.planned_until,
                planned_start=plan.planned_start,
                experienced_on=plan.experienced_on,
            )
            if plan is not None
            else None
        ),
        has_memory=journey.has_memory,
    )


@router.post(
    "/spaces/{spaceId}/wishes",
    response_model=WishDetail,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="createWish",
    responses={
        200: {
            "description": (
                "The request identity (`Idempotency-Key`) was already used for an "
                "equivalent request. The response returns the original Wish in its "
                "current state; no second Wish is created."
            ),
            "headers": ETAG_HEADERS,
            "model": WishDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def create_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: WishCreate,
    idempotency_key: IdempotencyKey,
) -> WishDetail:
    result = service.create_wish_once(
        session,
        authorization,
        idempotency_key=idempotency_key,
        title=body.title,
        description=body.description,
        tags=body.tags,
    )
    if not result.created:
        response.status_code = http_status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.wish.version)
    return wish_detail(session, authorization, result.wish)


@router.get(
    "/spaces/{spaceId}/wishes",
    response_model=WishPage,
    operation_id="listWishes",
    responses=problem_responses(400, 401, 404, 422),
)
def list_wishes(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    status: Annotated[WishStatus | None, Query()] = None,
) -> WishPage:
    page = service.list_wishes(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        status=status,
    )
    creators = resolve_author_summaries(session, {wish.owner_id for wish in page.items})
    journeys = journeys_for(session, authorization, page.items)
    hidden = concealment.hidden_wish_ids(session, authorization)
    return WishPage(
        items=[
            wish_detail(
                session,
                authorization,
                wish,
                creator=creators.get(wish.owner_id),
                journey=journeys.get(wish.id, NO_JOURNEY),
                hidden=hidden,
            )
            for wish in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/wishes/{wishId}",
    response_model=WishDetail,
    operation_id="getWish",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> WishDetail:
    wish = service.get_wish(session, authorization, wish_id)
    response.headers["ETag"] = etag_for(wish.version)
    return wish_detail(session, authorization, wish)


@router.post(
    "/spaces/{spaceId}/wishes/{wishId}/complete",
    response_model=WishDetail,
    operation_id="completeWish",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def complete_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> WishDetail:
    wish = service.complete_direct_wish(
        session,
        authorization,
        wish_id,
        expected_version=expected_version,
    )
    response.headers["ETag"] = etag_for(wish.version)
    return wish_detail(session, authorization, wish)


@router.post(
    "/spaces/{spaceId}/wishes/{wishId}/repeat",
    response_model=WishDetail,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="repeatWish",
    responses={
        200: {
            "description": (
                "The request identity (`Idempotency-Key`) was already used for an "
                "equivalent request. The response returns the Wish the first request "
                "created; no second Wish is created."
            ),
            "headers": ETAG_HEADERS,
            "model": WishDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def repeat_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    idempotency_key: IdempotencyKey,
    wish_id: Annotated[str, Path(alias="wishId")],
    body: WishRepeat | None = None,
) -> WishDetail:
    repeat = body or WishRepeat()
    result = service.repeat_wish_once(
        session,
        authorization,
        wish_id,
        idempotency_key=idempotency_key,
        title=repeat.title,
        description=repeat.description,
        tags=repeat.tags,
    )
    if not result.created:
        response.status_code = http_status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.wish.version)
    return wish_detail(session, authorization, result.wish)


@router.patch(
    "/spaces/{spaceId}/wishes/{wishId}",
    response_model=WishDetail,
    operation_id="updateWish",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def update_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: WishUpdate,
    expected_version: IfMatchVersion,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> WishDetail:
    wish = service.update_wish(
        session,
        authorization,
        wish_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        description=body.description,
        tags=body.tags,
    )
    response.headers["ETag"] = etag_for(wish.version)
    return wish_detail(session, authorization, wish)


@router.delete(
    "/spaces/{spaceId}/wishes/{wishId}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteWish",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_wish(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> Response:
    service.delete_wish(
        session,
        authorization,
        wish_id,
        expected_version=expected_version,
    )
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)
