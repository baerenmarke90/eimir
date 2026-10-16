"""HTTP contract for M3 places.

Coordinates are sent as JSON numbers and stored internally as ``Decimal``.
Conversion passes through ``str`` so the binary representation of a float
does not shift the value at the final decimal place.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.places import service
from eimir.places.models import Place

router = APIRouter(tags=["places"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


def _as_number(value: Decimal | None) -> float | None:
    """Project a stored decimal coordinate as a JSON number.

    Six fractional digits with at most three integral digits are well within
    the range a double can round-trip accurately for this contract.
    """
    return None if value is None else float(value)


class PlaceCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str | SkipJsonSchema[None] = None
    address: str | SkipJsonSchema[None] = None
    latitude: float | SkipJsonSchema[None] = None
    longitude: float | SkipJsonSchema[None] = None

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("description", "address")
    @classmethod
    def _text_not_null(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("must not be null")
        return value


class PlaceUpdate(ApiModel):
    """Place correction payload.

    ``latitude`` and ``longitude`` may explicitly be ``null`` here, allowing a
    place to be reset to a name-only record. The service treats coordinates as
    a pair; sending only one results in ``PLACE_COORDINATE_PAIR_REQUIRED``.
    """

    model_config = ConfigDict(extra="forbid")

    name: str | SkipJsonSchema[None] = None
    description: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "name" in self.model_fields_set:
            if self.name is None or not self.name.strip():
                raise ValueError("name must not be null or blank")
            self.name = self.name.strip()
        return self


class PlaceDetail(ApiModel):
    id: UUID
    space_id: UUID
    created_by: UUID
    name: str
    description: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    version: int
    created_at: datetime
    updated_at: datetime
    creator: AuthorSummary
    capabilities: ResourceCapabilities


class PlacePage(ApiModel):
    items: list[PlaceDetail]
    next_cursor: str | None
    has_more: bool


def place_detail(
    session: DbSession,
    authorization: Authorization,
    place: Place,
    creator: AuthorSummary | None = None,
) -> PlaceDetail:
    if creator is None:
        creator = resolve_author_summary(session, place.owner_id, resource="Place creator")
    return PlaceDetail(
        id=place.id,
        space_id=place.space_id,
        created_by=place.owner_id,
        name=place.payload.name,
        description=place.payload.description,
        address=place.payload.address,
        latitude=_as_number(place.latitude),
        longitude=_as_number(place.longitude),
        version=place.version,
        created_at=place.created_at,
        updated_at=place.updated_at,
        creator=creator,
        capabilities=ResourceCapabilities(
            # M3-D01: a place belongs to the couple.
            can_edit=True,
            # A place can always be deleted; the service applies the
            # consequences defined by M3-D06 section 9.
            can_delete=True,
            can_comment=False,
        ),
    )


@router.post(
    "/spaces/{spaceId}/places",
    response_model=PlaceDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPlace",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_place(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlaceCreate,
) -> PlaceDetail:
    place = service.create_place(
        session,
        authorization,
        name=body.name,
        description=body.description,
        address=body.address,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    response.headers["ETag"] = etag_for(place.version)
    return place_detail(session, authorization, place)


@router.get(
    "/spaces/{spaceId}/places",
    response_model=PlacePage,
    operation_id="listPlaces",
    responses=problem_responses(400, 401, 404, 422),
)
def list_places(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> PlacePage:
    page = service.list_places(session, authorization, cursor=cursor, limit=limit)
    creators = resolve_author_summaries(session, {place.owner_id for place in page.items})
    return PlacePage(
        items=[
            place_detail(session, authorization, place, creator=creators.get(place.owner_id))
            for place in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/places/{placeId}",
    response_model=PlaceDetail,
    operation_id="getPlace",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_place(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    place_id: Annotated[str, Path(alias="placeId")],
) -> PlaceDetail:
    place = service.get_place(session, authorization, place_id)
    response.headers["ETag"] = etag_for(place.version)
    return place_detail(session, authorization, place)


@router.patch(
    "/spaces/{spaceId}/places/{placeId}",
    response_model=PlaceDetail,
    operation_id="updatePlace",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_place(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PlaceUpdate,
    expected_version: IfMatchVersion,
    place_id: Annotated[str, Path(alias="placeId")],
) -> PlaceDetail:
    place = service.update_place(
        session,
        authorization,
        place_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        name=body.name,
        description=body.description,
        address=body.address,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    response.headers["ETag"] = etag_for(place.version)
    return place_detail(session, authorization, place)


@router.delete(
    "/spaces/{spaceId}/places/{placeId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deletePlace",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_place(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    place_id: Annotated[str, Path(alias="placeId")],
) -> Response:
    service.delete_place(
        session,
        authorization,
        place_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
