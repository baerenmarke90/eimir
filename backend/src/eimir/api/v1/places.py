"""HTTP contract for M3 places.

Coordinates are sent as JSON numbers and stored internally as ``Decimal``.
Conversion passes through ``str`` so the binary representation of a float
does not shift the value at the final decimal place.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.authors import resolve_author_summaries, resolve_author_summary
from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary, ResourceCapabilities
from eimir.attachments.binding import attachments_of_memories
from eimir.attachments.models import AttachmentStatus, MediaType
from eimir.auth import rate_limit
from eimir.config import get_settings
from eimir.core.errors import ServiceUnavailableError
from eimir.core.ids import parse_id
from eimir.entitlements.models import Capability
from eimir.places import service
from eimir.places.memory_map import list_memory_map
from eimir.places.models import Place
from eimir.providers.photon import GeocodingUnavailableError
from eimir.providers.place_search import search_places
from eimir.relations.service import target_not_found

router = APIRouter(tags=["places"])


class MemoryMapEntry(ApiModel):
    memory_id: UUID
    title: str
    happened_on: date
    place_id: UUID
    place_name: str
    latitude: float
    longitude: float
    preview_attachment_id: UUID | None = None
    preview_is_sensitive: bool = False


class MemoryMapPage(ApiModel):
    items: list[MemoryMapEntry]
    next_cursor: str | None


@router.get(
    "/spaces/{spaceId}/memory-map",
    response_model=MemoryMapPage,
    operation_id="listMemoryMap",
    responses=problem_responses(400, 401, 403, 404, 422),
)
def get_memory_map(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> MemoryMapPage:
    """Pro map over readable saved memories and places; no location tracking."""
    ensure_capability(
        session, authorization.space_id, Capability.MEMORIES_MAP.value, lock_grants=False
    )
    response.headers["Cache-Control"] = "no-store"
    result = list_memory_map(session, authorization, cursor=cursor, limit=limit)
    galleries = attachments_of_memories(session, [memory.id for memory, _ in result.items])
    previews = {
        memory_id: next(
            (
                bound.attachment
                for bound in gallery
                if bound.attachment.status == AttachmentStatus.READY
                and bound.attachment.media_type == MediaType.IMAGE
            ),
            None,
        )
        for memory_id, gallery in galleries.items()
    }
    entries = []
    for memory, place in result.items:
        if place.latitude is None or place.longitude is None:
            continue
        preview = previews.get(memory.id)
        entries.append(
            MemoryMapEntry(
                memory_id=memory.id,
                title=memory.payload.title,
                happened_on=memory.happened_on or memory.created_at.astimezone(UTC).date(),
                place_id=place.id,
                place_name=place.payload.name,
                latitude=float(place.latitude),
                longitude=float(place.longitude),
                preview_attachment_id=preview.id if preview is not None else None,
                preview_is_sensitive=preview.payload.is_sensitive if preview is not None else False,
            )
        )
    return MemoryMapPage(items=entries, next_cursor=result.next_cursor)


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
    geocoding_source: str | None = None
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


class PlaceLookupRequest(ApiModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    query: str = Field(min_length=2, max_length=200)
    locale: str = Field(default="en", max_length=16)


class PlaceLookupCandidate(ApiModel):
    name: str
    address: str | None
    latitude: float
    longitude: float


class PlaceLookupResult(ApiModel):
    items: list[PlaceLookupCandidate]
    attribution: str = "© OpenStreetMap contributors"


@router.post(
    "/spaces/{spaceId}/places/lookup",
    response_model=PlaceLookupResult,
    operation_id="lookupPlaces",
    responses=problem_responses(401, 404, 422, 429, 503),
)
def lookup_places(
    authorization: Authorization,
    session: DbSession,
    body: PlaceLookupRequest,
    response: Response,
) -> PlaceLookupResult:
    """Search only on explicit user intent; never persist or log query content."""
    rate_limit.check(
        session,
        "place-map-search",
        str(authorization.account_id),
        rate_limit.Limit(attempts=30, window=timedelta(minutes=15)),
    )
    response.headers["Cache-Control"] = "private, no-store"
    try:
        candidates = search_places(get_settings().place_search_url, body.query, body.locale)
    except GeocodingUnavailableError:
        raise ServiceUnavailableError(
            "Place lookup is unavailable.", "PLACE_LOOKUP_UNAVAILABLE"
        ) from None
    return PlaceLookupResult(
        items=[
            PlaceLookupCandidate(
                name=item.name,
                address=item.address,
                latitude=float(item.position.latitude),
                longitude=float(item.position.longitude),
            )
            for item in candidates
            if item.position is not None
        ]
    )


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
        geocoding_source=place.payload.geocoding_source,
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


@router.get(
    "/spaces/{spaceId}/moments/{kind}/{targetId}/places",
    response_model=PlacePage,
    operation_id="listMomentPlaces",
    responses=problem_responses(400, 401, 404, 422),
)
def list_moment_places(
    authorization: Authorization,
    session: DbSession,
    kind: Annotated[str, Path(pattern="^(memories|heart-moments)$")],
    target_id: Annotated[str, Path(alias="targetId")],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> PlacePage:
    parsed_target = parse_id(target_id)
    if parsed_target is None:
        raise target_not_found()
    page = service.list_places(
        session, authorization, cursor=cursor, limit=limit, related_to=(kind, parsed_target)
    )
    creators = resolve_author_summaries(session, {place.owner_id for place in page.items})
    return PlacePage(
        items=[
            place_detail(session, authorization, place, creators.get(place.owner_id))
            for place in page.items
        ],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )
