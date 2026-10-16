"""HTTP contract for M2 milestones."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.milestones import service
from eimir.milestones.models import Milestone

router = APIRouter(tags=["milestones"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class MilestoneCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    body: str | SkipJsonSchema[None] = None
    happened_on: date

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("body")
    @classmethod
    def _body_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("body must not be null")
        return value


class MilestoneUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    body: str | None = None
    happened_on: date | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "happened_on" in self.model_fields_set and self.happened_on is None:
            raise ValueError("happenedOn must not be null")
        return self


class MilestoneDetail(ApiModel):
    id: UUID
    space_id: UUID
    author_id: UUID
    title: str
    body: str | None
    happened_on: date
    version: int
    created_at: datetime
    updated_at: datetime
    author: AuthorSummary
    capabilities: ResourceCapabilities


class MilestonePage(ApiModel):
    items: list[MilestoneDetail]
    next_cursor: str | None
    has_more: bool


def _milestone_detail(
    session: DbSession,
    authorization: Authorization,
    milestone: Milestone,
    author: AuthorSummary | None = None,
) -> MilestoneDetail:
    if author is None:
        author = resolve_author_summary(session, milestone.owner_id, resource="Milestone author")
    is_author = milestone.owner_id == authorization.account_id
    return MilestoneDetail(
        id=milestone.id,
        space_id=milestone.space_id,
        author_id=milestone.owner_id,
        title=milestone.payload.title,
        body=milestone.payload.body,
        happened_on=milestone.happened_on,
        version=milestone.version,
        created_at=milestone.created_at,
        updated_at=milestone.updated_at,
        author=author,
        capabilities=ResourceCapabilities(
            # M2-D25: shared readability does not grant write authority.
            can_edit=is_author,
            can_delete=is_author,
            can_comment=True,
        ),
    )


@router.post(
    "/spaces/{spaceId}/milestones",
    response_model=MilestoneDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMilestone",
    responses={
        200: {
            "description": (
                "The request identity (`Idempotency-Key`) was already used for an "
                "equivalent request. The response returns the original Milestone in "
                "its current state; no second Milestone is created."
            ),
            "headers": ETAG_HEADERS,
            "model": MilestoneDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 409, 422),
    },
)
def create_milestone(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: MilestoneCreate,
    idempotency_key: IdempotencyKey,
) -> MilestoneDetail:
    result = service.create_milestone_once(
        session,
        authorization,
        idempotency_key=idempotency_key,
        title=body.title,
        body=body.body,
        happened_on=body.happened_on,
    )
    if not result.created:
        response.status_code = status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.milestone.version)
    return _milestone_detail(session, authorization, result.milestone)


@router.get(
    "/spaces/{spaceId}/milestones",
    response_model=MilestonePage,
    operation_id="listMilestones",
    responses=problem_responses(400, 401, 404, 422),
)
def list_milestones(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
) -> MilestonePage:
    page = service.list_milestones(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
        year=year,
    )
    authors = resolve_author_summaries(session, {milestone.owner_id for milestone in page.items})
    return MilestonePage(
        items=[
            _milestone_detail(
                session, authorization, milestone, author=authors.get(milestone.owner_id)
            )
            for milestone in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/milestones/{milestoneId}",
    response_model=MilestoneDetail,
    operation_id="getMilestone",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_milestone(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    milestone_id: Annotated[str, Path(alias="milestoneId")],
) -> MilestoneDetail:
    milestone = service.get_milestone(session, authorization, milestone_id)
    response.headers["ETag"] = etag_for(milestone.version)
    return _milestone_detail(session, authorization, milestone)


@router.patch(
    "/spaces/{spaceId}/milestones/{milestoneId}",
    response_model=MilestoneDetail,
    operation_id="updateMilestone",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_milestone(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: MilestoneUpdate,
    expected_version: IfMatchVersion,
    milestone_id: Annotated[str, Path(alias="milestoneId")],
) -> MilestoneDetail:
    milestone = service.update_milestone(
        session,
        authorization,
        milestone_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        body=body.body,
        happened_on=body.happened_on,
    )
    response.headers["ETag"] = etag_for(milestone.version)
    return _milestone_detail(session, authorization, milestone)


@router.delete(
    "/spaces/{spaceId}/milestones/{milestoneId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteMilestone",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_milestone(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    milestone_id: Annotated[str, Path(alias="milestoneId")],
) -> Response:
    service.delete_milestone(
        session,
        authorization,
        milestone_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
