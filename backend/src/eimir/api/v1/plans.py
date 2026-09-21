"""HTTP contract for M3 plans and the Wish-to-Plan lifecycle.

Conversion is nested under ``/wishes/{wishId}/plan`` in the path but lives in
this module because it creates a plan and returns both resources. The reverse
placement would make ``api.v1.wishes`` depend on this module while this module
already depends on wishes. The dependency direction follows the domain: Plan
knows Wish; Wish does not know Plan.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from fastapi import status as http_status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.api.v1.wishes import ETAG_HEADERS, WishDetail, wish_detail
from eimir.plans import service
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship import configuration as relationship_configuration

router = APIRouter(tags=["plans"])


class PlanSchedule(ApiModel):
    """One explicit Plan schedule representation.

    ``plannedOn`` is a calendar day. ``plannedStart`` is a timezone-aware
    instant. Exactly one of those semantic starts must be supplied; clients may
    never synthesize a wall-clock time merely to encode ``plannedOn``.
    """

    model_config = ConfigDict(extra="forbid")

    planned_on: date | SkipJsonSchema[None] = None
    planned_start: datetime | SkipJsonSchema[None] = None
    planned_end: datetime | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_schedule(self) -> Self:
        if "planned_on" in self.model_fields_set and self.planned_on is None:
            raise ValueError("plannedOn must not be null")
        if "planned_start" in self.model_fields_set and self.planned_start is None:
            raise ValueError("plannedStart must not be null")
        if "planned_end" in self.model_fields_set and self.planned_end is None:
            raise ValueError("plannedEnd must not be null")
        if self.planned_on is None and self.planned_start is None:
            raise ValueError("plannedOn or plannedStart is required")
        if self.planned_on is not None and self.planned_start is not None:
            raise ValueError("plannedOn and plannedStart are mutually exclusive")
        if self.planned_on is not None and self.planned_end is not None:
            raise ValueError("plannedEnd requires plannedStart")
        return self


class PlanCreate(ApiModel):
    """Direct Plan creation with an optional atomic schedule.

    Lifecycle state remains server-owned. Omitting ``schedule`` creates an
    ``IDEA``; supplying a valid date-only or timed schedule creates a
    ``PLANNED`` Plan in the same transaction.
    """

    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | SkipJsonSchema[None] = None
    place_id: UUID | SkipJsonSchema[None] = None
    schedule: PlanSchedule | SkipJsonSchema[None] = None

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

    @field_validator("schedule")
    @classmethod
    def _schedule_not_null(cls, value: PlanSchedule | None) -> PlanSchedule:
        if value is None:
            raise ValueError("schedule must not be null")
        return value


class PlanUpdate(ApiModel):
    """Domain correction without changing lifecycle status.

    Schedule fields remain owned by ``/schedule`` and ``/unschedule``.
    ``experiencedOn`` is the one exception: it may be corrected on a completed
    Plan without reopening it (M3-D04).
    """

    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | None = None
    place_id: UUID | None = None
    experienced_on: date | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "experienced_on" in self.model_fields_set and self.experienced_on is None:
            raise ValueError("experiencedOn must not be null")
        return self


class PlanComplete(ApiModel):
    model_config = ConfigDict(extra="forbid")

    experienced_on: date


class WishToPlan(ApiModel):
    """Wish-to-Plan conversion request with an optional atomic schedule.

    Without an explicit title the Plan inherits the Wish title. Supplying
    ``schedule`` makes the new Plan date-only or timed without a second
    lifecycle request; omitting it preserves the existing unscheduled flow.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    description: str | SkipJsonSchema[None] = None
    place_id: UUID | SkipJsonSchema[None] = None
    schedule: PlanSchedule | SkipJsonSchema[None] = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("title must not be null or blank")
        return value.strip()

    @field_validator("description")
    @classmethod
    def _description_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("description must not be null")
        return value

    @field_validator("schedule")
    @classmethod
    def _schedule_not_null(cls, value: PlanSchedule | None) -> PlanSchedule:
        if value is None:
            raise ValueError("schedule must not be null")
        return value


class PlanDetail(ApiModel):
    id: UUID
    space_id: UUID
    created_by: UUID
    source_wish_id: UUID | None
    place_id: UUID | None
    title: str
    description: str | None
    status: PlanStatus
    planned_on: date | None = None
    planned_start: datetime | None
    planned_end: datetime | None
    experienced_on: date | None
    version: int
    created_at: datetime
    updated_at: datetime
    creator: AuthorSummary
    capabilities: ResourceCapabilities


class PlanPage(ApiModel):
    items: list[PlanDetail]
    next_cursor: str | None
    has_more: bool


class WishToPlanResponse(ApiModel):
    """Both resources returned from a conversion."""

    wish: WishDetail
    plan: PlanDetail


class PlanReturnToWishResponse(ApiModel):
    wish: WishDetail
    removed_plan_id: UUID


def _plan_detail(
    session: DbSession,
    authorization: Authorization,
    plan: Plan,
    creator: AuthorSummary | None = None,
) -> PlanDetail:
    if creator is None:
        creator = resolve_author_summary(session, plan.owner_id, resource="Plan creator")
    is_completed = plan.status == PlanStatus.COMPLETED.value
    return PlanDetail(
        id=plan.id,
        space_id=plan.space_id,
        created_by=plan.owner_id,
        source_wish_id=plan.source_wish_id,
        place_id=plan.place_id,
        title=plan.payload.title,
        description=plan.payload.description,
        status=PlanStatus(plan.status),
        planned_on=plan.planned_on,
        planned_start=plan.planned_start,
        planned_end=plan.planned_end,
        experienced_on=plan.experienced_on,
        version=plan.version,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        creator=creator,
        capabilities=ResourceCapabilities(
            can_edit=True,
            can_delete=plan.source_wish_id is None or is_completed,
            can_comment=False,
        ),
    )


def _schedule_values(
    schedule: PlanSchedule | None,
) -> tuple[date | None, datetime | None, datetime | None]:
    if schedule is None:
        return None, None, None
    return schedule.planned_on, schedule.planned_start, schedule.planned_end


@router.post(
    "/spaces/{spaceId}/plans",
    response_model=PlanDetail,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="createPlan",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlanCreate,
) -> PlanDetail:
    planned_on, planned_start, planned_end = _schedule_values(body.schedule)
    plan = service.create_plan(
        session,
        authorization,
        title=body.title,
        description=body.description,
        place_id=body.place_id,
        planned_on=planned_on,
        planned_start=planned_start,
        planned_end=planned_end,
    )
    response.headers["ETag"] = etag_for(plan.version)
    return _plan_detail(session, authorization, plan)


@router.get(
    "/spaces/{spaceId}/plans",
    response_model=PlanPage,
    operation_id="listPlans",
    responses=problem_responses(400, 401, 404, 422),
)
def list_plans(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    status: Annotated[PlanStatus | None, Query()] = None,
) -> PlanPage:
    page = service.list_plans(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        status=status,
    )
    creators = resolve_author_summaries(session, {plan.owner_id for plan in page.items})
    return PlanPage(
        items=[
            _plan_detail(session, authorization, plan, creator=creators.get(plan.owner_id))
            for plan in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/plans/{planId}",
    response_model=PlanDetail,
    operation_id="getPlan",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanDetail:
    plan = service.get_plan(session, authorization, plan_id)
    response.headers["ETag"] = etag_for(plan.version)
    return _plan_detail(session, authorization, plan)


@router.patch(
    "/spaces/{spaceId}/plans/{planId}",
    response_model=PlanDetail,
    operation_id="updatePlan",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlanUpdate,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanDetail:
    plan = service.update_plan(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        description=body.description,
        place_id=body.place_id,
        experienced_on=body.experienced_on,
    )
    response.headers["ETag"] = etag_for(plan.version)
    return _plan_detail(session, authorization, plan)


@router.delete(
    "/spaces/{spaceId}/plans/{planId}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deletePlan",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_plan(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> Response:
    service.delete_plan(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
    )
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


@router.post(
    "/spaces/{spaceId}/plans/{planId}/schedule",
    response_model=PlanDetail,
    operation_id="schedulePlan",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def schedule_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlanSchedule,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanDetail:
    plan = service.schedule_plan(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
        planned_on=body.planned_on,
        planned_start=body.planned_start,
        planned_end=body.planned_end,
    )
    response.headers["ETag"] = etag_for(plan.version)
    return _plan_detail(session, authorization, plan)


@router.post(
    "/spaces/{spaceId}/plans/{planId}/unschedule",
    response_model=PlanDetail,
    operation_id="unschedulePlan",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def unschedule_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanDetail:
    plan = service.unschedule_plan(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
    )
    response.headers["ETag"] = etag_for(plan.version)
    return _plan_detail(session, authorization, plan)


@router.post(
    "/spaces/{spaceId}/plans/{planId}/complete",
    response_model=PlanDetail,
    operation_id="completePlan",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def complete_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlanComplete,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanDetail:
    shared_achievement_enabled = relationship_configuration.is_module_enabled(
        session,
        authorization.space_id,
        relationship_configuration.SpaceModule.SHARED_ACHIEVEMENTS,
        lock_space=True,
    )
    plan, _wish = service.complete_plan(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
        experienced_on=body.experienced_on,
    )
    response.headers["ETag"] = etag_for(plan.version)
    if shared_achievement_enabled:
        response.headers["X-Eimir-Shared-Achievement"] = "plan-completed"
    return _plan_detail(session, authorization, plan)


@router.post(
    "/spaces/{spaceId}/plans/{planId}/return-to-wish",
    response_model=PlanReturnToWishResponse,
    operation_id="returnPlanToWish",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def return_plan_to_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    expected_version: IfMatchVersion,
    plan_id: Annotated[str, Path(alias="planId")],
) -> PlanReturnToWishResponse:
    result = service.return_to_wish(
        session,
        authorization,
        plan_id,
        expected_version=expected_version,
    )
    response.headers["ETag"] = etag_for(result.wish.version)
    return PlanReturnToWishResponse(
        wish=wish_detail(session, authorization, result.wish),
        removed_plan_id=result.removed_plan_id,
    )


@router.post(
    "/spaces/{spaceId}/wishes/{wishId}/plan",
    response_model=WishToPlanResponse,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="convertWishToPlan",
    responses={
        200: {
            "description": (
                "The wish was already converted. The response returns the same original "
                "plan; no second plan is created."
            ),
            "headers": ETAG_HEADERS,
            "model": WishToPlanResponse,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def convert_wish_to_plan(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: WishToPlan,
    expected_version: IfMatchVersion,
    wish_id: Annotated[str, Path(alias="wishId")],
) -> WishToPlanResponse:
    planned_on, planned_start, planned_end = _schedule_values(body.schedule)
    result = service.convert_wish_to_plan(
        session,
        authorization,
        wish_id,
        expected_version=expected_version,
        title=body.title,
        description=body.description,
        place_id=body.place_id,
        planned_on=planned_on,
        planned_start=planned_start,
        planned_end=planned_end,
    )
    if not result.created:
        response.status_code = http_status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.plan.version)
    return WishToPlanResponse(
        wish=wish_detail(session, authorization, result.wish),
        plan=_plan_detail(session, authorization, result.plan),
    )
