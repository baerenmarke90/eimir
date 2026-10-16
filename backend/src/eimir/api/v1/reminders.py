"""HTTP contract for M4-C Reminder definitions and preferences."""

from __future__ import annotations

from datetime import datetime, time
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Response
from fastapi import status as http_status
from pydantic import ConfigDict, Field, field_validator

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.reminders import service
from eimir.reminders.models import ReminderScheduleType, ReminderSource

router = APIRouter(tags=["reminders"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class OnceSchedule(ApiModel):
    type: Literal[ReminderScheduleType.ONCE]
    at: datetime


class AnnualSchedule(ApiModel):
    type: Literal[ReminderScheduleType.ANNUAL]
    month: int
    day: int
    local_time: time


class RelationshipDayCountSchedule(ApiModel):
    type: Literal[ReminderScheduleType.RELATIONSHIP_DAY_COUNT]
    day_count: int
    local_time: time


ReminderSchedule = Annotated[
    OnceSchedule | AnnualSchedule | RelationshipDayCountSchedule,
    Field(discriminator="type"),
]


class ReminderWrite(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    schedule: ReminderSchedule
    offsets: list[int] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class ReminderPreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    muted: bool


class ReminderPreferenceView(ApiModel):
    reminder_id: UUID
    muted: bool


class ReminderDetail(ApiModel):
    id: UUID
    space_id: UUID
    title: str
    description: str | None
    source: ReminderSource
    source_type: str | None
    source_id: UUID | None
    rule_key: str | None
    created_by: UUID
    schedule: ReminderSchedule
    offsets: list[int]
    muted: bool
    version: int
    created_at: datetime
    updated_at: datetime
    creator: AuthorSummary
    capabilities: ResourceCapabilities


class ReminderList(ApiModel):
    items: list[ReminderDetail]


def _schedule(view: service.ReminderView) -> ReminderSchedule:
    reminder = view.reminder
    schedule_type = ReminderScheduleType(reminder.schedule_type)
    if schedule_type is ReminderScheduleType.ONCE:
        if reminder.once_at is None:
            raise RuntimeError("ONCE Reminder is missing once_at despite database constraint.")
        return OnceSchedule(type=schedule_type, at=reminder.once_at)
    if schedule_type is ReminderScheduleType.ANNUAL:
        if (
            reminder.annual_month is None
            or reminder.annual_day is None
            or reminder.local_time is None
        ):
            raise RuntimeError("ANNUAL Reminder is incomplete despite database constraint.")
        return AnnualSchedule(
            type=schedule_type,
            month=reminder.annual_month,
            day=reminder.annual_day,
            local_time=reminder.local_time,
        )
    if reminder.relationship_day_count is None or reminder.local_time is None:
        raise RuntimeError("Relationship-day Reminder is incomplete despite database constraint.")
    return RelationshipDayCountSchedule(
        type=schedule_type,
        day_count=reminder.relationship_day_count,
        local_time=reminder.local_time,
    )


def _schedule_definition(value: ReminderSchedule) -> service.ScheduleDefinition:
    if isinstance(value, OnceSchedule):
        return service.ScheduleDefinition(type=value.type, once_at=value.at)
    if isinstance(value, AnnualSchedule):
        return service.ScheduleDefinition(
            type=value.type,
            annual_month=value.month,
            annual_day=value.day,
            local_time=value.local_time,
        )
    return service.ScheduleDefinition(
        type=value.type,
        relationship_day_count=value.day_count,
        local_time=value.local_time,
    )


def reminder_detail(
    session: DbSession,
    view: service.ReminderView,
    creator: AuthorSummary | None = None,
) -> ReminderDetail:
    reminder = view.reminder
    if creator is None:
        creator = resolve_author_summary(session, reminder.owner_id, resource="Reminder creator")
    manual = reminder.source == ReminderSource.MANUAL.value
    return ReminderDetail(
        id=reminder.id,
        space_id=reminder.space_id,
        title=reminder.payload.title,
        description=reminder.payload.description,
        source=ReminderSource(reminder.source),
        source_type=reminder.source_type,
        source_id=reminder.source_id,
        rule_key=reminder.rule_key,
        created_by=reminder.owner_id,
        schedule=_schedule(view),
        offsets=view.offsets,
        muted=view.muted,
        version=reminder.version,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
        creator=creator,
        capabilities=ResourceCapabilities(
            can_edit=manual,
            can_delete=manual,
            can_comment=False,
        ),
    )


@router.post(
    "/spaces/{spaceId}/reminders",
    response_model=ReminderDetail,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="createReminder",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_reminder(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ReminderWrite,
) -> ReminderDetail:
    view = service.create_reminder(
        session,
        authorization,
        title=body.title,
        description=body.description,
        schedule=_schedule_definition(body.schedule),
        offsets=body.offsets,
    )
    response.headers["ETag"] = etag_for(view.reminder.version)
    response.headers["Cache-Control"] = "private, no-store"
    return reminder_detail(session, view)


@router.get(
    "/spaces/{spaceId}/reminders",
    response_model=ReminderList,
    operation_id="listReminders",
    responses=problem_responses(401, 404, 422),
)
def list_reminders(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> ReminderList:
    response.headers["Cache-Control"] = "private, no-store"
    views = service.list_reminders(session, authorization)
    creators = resolve_author_summaries(session, {view.reminder.owner_id for view in views})
    return ReminderList(
        items=[
            reminder_detail(session, view, creator=creators.get(view.reminder.owner_id))
            for view in views
        ]
    )


@router.get(
    "/spaces/{spaceId}/reminders/{reminderId}",
    response_model=ReminderDetail,
    operation_id="getReminder",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_reminder(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    reminder_id: Annotated[str, Path(alias="reminderId")],
) -> ReminderDetail:
    view = service.get_reminder(session, authorization, reminder_id)
    response.headers["ETag"] = etag_for(view.reminder.version)
    response.headers["Cache-Control"] = "private, no-store"
    return reminder_detail(session, view)


@router.put(
    "/spaces/{spaceId}/reminders/{reminderId}",
    response_model=ReminderDetail,
    operation_id="updateReminder",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_reminder(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ReminderWrite,
    expected_version: IfMatchVersion,
    reminder_id: Annotated[str, Path(alias="reminderId")],
) -> ReminderDetail:
    view = service.update_reminder(
        session,
        authorization,
        reminder_id,
        expected_version=expected_version,
        title=body.title,
        description=body.description,
        schedule=_schedule_definition(body.schedule),
        offsets=body.offsets,
    )
    response.headers["ETag"] = etag_for(view.reminder.version)
    response.headers["Cache-Control"] = "private, no-store"
    return reminder_detail(session, view)


@router.delete(
    "/spaces/{spaceId}/reminders/{reminderId}",
    status_code=http_status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deleteReminder",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_reminder(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    reminder_id: Annotated[str, Path(alias="reminderId")],
) -> Response:
    service.delete_reminder(
        session,
        authorization,
        reminder_id,
        expected_version=expected_version,
    )
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)


@router.put(
    "/spaces/{spaceId}/reminders/{reminderId}/preference",
    response_model=ReminderPreferenceView,
    operation_id="setReminderPreference",
    responses=problem_responses(401, 404, 422),
)
def set_reminder_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ReminderPreferenceUpdate,
    reminder_id: Annotated[str, Path(alias="reminderId")],
) -> ReminderPreferenceView:
    view = service.set_preference(
        session,
        authorization,
        reminder_id,
        muted=body.muted,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return ReminderPreferenceView(reminder_id=view.reminder.id, muted=view.muted)
