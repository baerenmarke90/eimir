"""Endpoints for related people and important dates."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import Field, field_validator

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.authorization import ContentVisibility, visibility_of
from eimir.people import service
from eimir.people.models import (
    DateRepeat,
    ImportantDate,
    ImportantDateType,
    PersonRelationship,
    RelatedPerson,
)

router = APIRouter(tags=["people"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class RelatedPersonFields(ApiModel):
    display_name: str = Field(min_length=1, max_length=120)
    relationship: PersonRelationship
    birthday: date | None = None
    birthday_year_known: bool = False
    visibility: ContentVisibility
    show_birthday_on_dashboard: bool = False
    """Explicit opt-in for this birthday to appear on the shared Dashboard.

    Independent of ``visibility`` and of Reminder preferences (#699): default
    off, and requires ``birthday`` to be set.
    """
    avatar_attachment_id: UUID | None = None

    @field_validator("display_name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class RelatedPersonView(ApiModel):
    id: UUID
    display_name: str
    relationship: PersonRelationship
    birthday: date | None
    birthday_year_known: bool
    """When the year is unknown, ``birthday`` contains a placeholder year.

    Clients then display only the day and month.
    """
    visibility: ContentVisibility
    show_birthday_on_dashboard: bool
    avatar_attachment_id: UUID | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class ImportantDateFields(ApiModel):
    label: str = Field(min_length=1, max_length=120)
    type: ImportantDateType
    date: date
    repeats: DateRepeat = DateRepeat.NONE
    visibility: ContentVisibility
    related_person_id: UUID | None = None

    @field_validator("label")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class ImportantDateView(ApiModel):
    id: UUID
    label: str
    type: ImportantDateType
    date: date
    repeats: DateRepeat
    visibility: ContentVisibility
    related_person_id: UUID | None
    version: int
    created_at: datetime
    updated_at: datetime


def _person_view(person: RelatedPerson) -> RelatedPersonView:
    return RelatedPersonView(
        id=person.id,
        display_name=person.payload.display_name,
        relationship=PersonRelationship(person.relationship),
        birthday=person.birthday,
        birthday_year_known=person.birthday_year_known,
        visibility=visibility_of(person.privacy_class),
        show_birthday_on_dashboard=person.show_birthday_on_dashboard,
        avatar_attachment_id=person.avatar_attachment_id,
        version=person.version,
        created_at=person.created_at,
        updated_at=person.updated_at,
    )


def _date_view(important_date: ImportantDate) -> ImportantDateView:
    return ImportantDateView(
        id=important_date.id,
        label=important_date.payload.label,
        type=ImportantDateType(important_date.type),
        date=important_date.date,
        repeats=DateRepeat(important_date.repeats),
        visibility=visibility_of(important_date.privacy_class),
        related_person_id=important_date.related_person_id,
        version=important_date.version,
        created_at=important_date.created_at,
        updated_at=important_date.updated_at,
    )


@router.get(
    "/spaces/{spaceId}/related-persons",
    response_model=list[RelatedPersonView],
    responses=problem_responses(401, 404),
)
def list_related_persons(
    authorization: Authorization,
    session: DbSession,
) -> list[RelatedPersonView]:
    return [_person_view(person) for person in service.list_persons(session, authorization)]


@router.post(
    "/spaces/{spaceId}/related-persons",
    response_model=RelatedPersonView,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 422),
    },
)
def create_related_person(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: RelatedPersonFields,
) -> RelatedPersonView:
    person = service.create_person(
        session,
        authorization,
        display_name=body.display_name,
        relationship=body.relationship,
        birthday=body.birthday,
        birthday_year_known=body.birthday_year_known,
        visibility=body.visibility,
        show_birthday_on_dashboard=body.show_birthday_on_dashboard,
        avatar_attachment_id=body.avatar_attachment_id,
    )
    response.headers["ETag"] = etag_for(person.version)
    return _person_view(person)


@router.get(
    "/spaces/{spaceId}/related-persons/{personId}",
    response_model=RelatedPersonView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_related_person(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    person_id: Annotated[str, Path(alias="personId")],
) -> RelatedPersonView:
    person = service.get_person(session, authorization, person_id)
    response.headers["ETag"] = etag_for(person.version)
    return _person_view(person)


@router.put(
    "/spaces/{spaceId}/related-persons/{personId}",
    response_model=RelatedPersonView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_related_person(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: RelatedPersonFields,
    expected_version: IfMatchVersion,
    person_id: Annotated[str, Path(alias="personId")],
) -> RelatedPersonView:
    person = service.update_person(
        session,
        authorization,
        person_id,
        expected_version=expected_version,
        display_name=body.display_name,
        relationship=body.relationship,
        birthday=body.birthday,
        birthday_year_known=body.birthday_year_known,
        visibility=body.visibility,
        show_birthday_on_dashboard=body.show_birthday_on_dashboard,
        avatar_attachment_id=body.avatar_attachment_id,
    )
    response.headers["ETag"] = etag_for(person.version)
    return _person_view(person)


@router.delete(
    "/spaces/{spaceId}/related-persons/{personId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_related_person(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    person_id: Annotated[str, Path(alias="personId")],
    delete_policy: Annotated[
        service.RelatedPersonDeletePolicy,
        Query(
            alias="deletePolicy",
            description=(
                "Explicit handling of linked dates: preserve removes only the person "
                "link; cascade deletes all linked dates."
            ),
        ),
    ],
) -> Response:
    service.delete_person(
        session,
        authorization,
        person_id,
        expected_version=expected_version,
        delete_policy=delete_policy,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/spaces/{spaceId}/important-dates",
    response_model=list[ImportantDateView],
    responses=problem_responses(401, 404),
)
def list_important_dates(
    authorization: Authorization,
    session: DbSession,
    related_person_id: Annotated[str | None, Query(alias="relatedPersonId")] = None,
) -> list[ImportantDateView]:
    return [
        _date_view(important_date)
        for important_date in service.list_dates(
            session, authorization, related_person_id=related_person_id
        )
    ]


@router.post(
    "/spaces/{spaceId}/important-dates",
    response_model=ImportantDateView,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404, 422),
    },
)
def create_important_date(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ImportantDateFields,
) -> ImportantDateView:
    important_date = service.create_date(
        session,
        authorization,
        label=body.label,
        date_type=body.type,
        day=body.date,
        repeats=body.repeats,
        visibility=body.visibility,
        related_person_id=body.related_person_id,
    )
    response.headers["ETag"] = etag_for(important_date.version)
    return _date_view(important_date)


@router.get(
    "/spaces/{spaceId}/important-dates/{dateId}",
    response_model=ImportantDateView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_important_date(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    date_id: Annotated[str, Path(alias="dateId")],
) -> ImportantDateView:
    important_date = service.get_date(session, authorization, date_id)
    response.headers["ETag"] = etag_for(important_date.version)
    return _date_view(important_date)


@router.put(
    "/spaces/{spaceId}/important-dates/{dateId}",
    response_model=ImportantDateView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_important_date(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ImportantDateFields,
    expected_version: IfMatchVersion,
    date_id: Annotated[str, Path(alias="dateId")],
) -> ImportantDateView:
    important_date = service.update_date(
        session,
        authorization,
        date_id,
        expected_version=expected_version,
        label=body.label,
        date_type=body.type,
        day=body.date,
        repeats=body.repeats,
        visibility=body.visibility,
        related_person_id=body.related_person_id,
    )
    response.headers["ETag"] = etag_for(important_date.version)
    return _date_view(important_date)


@router.delete(
    "/spaces/{spaceId}/important-dates/{dateId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_important_date(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    date_id: Annotated[str, Path(alias="dateId")],
) -> Response:
    service.delete_date(session, authorization, date_id, expected_version=expected_version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
