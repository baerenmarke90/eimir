"""HTTP contract for owner-only M3 PrivateCollections."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response, status
from pydantic import ConfigDict, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, ResourceCapabilities
from eimir.private_collections import service
from eimir.private_collections.models import PrivateCollection, PrivateCollectionItem

router = APIRouter(tags=["private-area"])

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class PrivateCollectionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class PrivateCollectionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        return self


class PrivateCollectionItemCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    completed: bool = False

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class PrivateCollectionItemUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    title: str | SkipJsonSchema[None] = None
    completed: bool | SkipJsonSchema[None] = None

    @model_validator(mode="after")
    def _validate_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        if "title" in self.model_fields_set:
            if self.title is None or not self.title.strip():
                raise ValueError("title must not be null or blank")
            self.title = self.title.strip()
        if "completed" in self.model_fields_set and self.completed is None:
            raise ValueError("completed must not be null")
        return self


class PrivateCollectionOrder(ApiModel):
    model_config = ConfigDict(extra="forbid")

    item_ids: list[UUID]


class PrivateCollectionItemDetail(ApiModel):
    id: UUID
    collection_id: UUID
    title: str
    completed: bool
    position: int
    version: int
    created_at: datetime
    updated_at: datetime
    capabilities: ResourceCapabilities


class PrivateCollectionDetail(ApiModel):
    id: UUID
    space_id: UUID
    owner_id: UUID
    title: str
    version: int
    created_at: datetime
    updated_at: datetime
    capabilities: ResourceCapabilities
    items: list[PrivateCollectionItemDetail]


class PrivateCollectionPage(ApiModel):
    items: list[PrivateCollectionDetail]
    next_cursor: str | None
    has_more: bool


def _capabilities() -> ResourceCapabilities:
    return ResourceCapabilities(can_edit=True, can_delete=True, can_comment=False)


def private_collection_item_detail(item: PrivateCollectionItem) -> PrivateCollectionItemDetail:
    return PrivateCollectionItemDetail(
        id=item.id,
        collection_id=item.collection_id,
        title=item.payload.title,
        completed=item.completed,
        position=item.position,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
        capabilities=_capabilities(),
    )


def private_collection_detail(
    session: DbSession, collection: PrivateCollection
) -> PrivateCollectionDetail:
    return PrivateCollectionDetail(
        id=collection.id,
        space_id=collection.space_id,
        owner_id=collection.owner_id,
        title=collection.payload.title,
        version=collection.version,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
        capabilities=_capabilities(),
        items=[
            private_collection_item_detail(item) for item in service.list_items(session, collection)
        ],
    )


@router.post(
    "/spaces/{spaceId}/private/collections",
    response_model=PrivateCollectionDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPrivateCollection",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_private_collection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateCollectionCreate,
) -> PrivateCollectionDetail:
    collection = service.create_collection(
        session,
        authorization,
        title=body.title,
    )
    response.headers["ETag"] = etag_for(collection.version)
    return private_collection_detail(session, collection)


@router.get(
    "/spaces/{spaceId}/private/collections",
    response_model=PrivateCollectionPage,
    operation_id="listPrivateCollections",
    responses=problem_responses(400, 401, 404, 422),
)
def list_private_collections(
    authorization: Authorization,
    session: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> PrivateCollectionPage:
    page = service.list_collections(session, authorization, cursor=cursor, limit=limit)
    return PrivateCollectionPage(
        items=[private_collection_detail(session, collection) for collection in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/private/collections/{collectionId}",
    response_model=PrivateCollectionDetail,
    operation_id="getPrivateCollection",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_private_collection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> PrivateCollectionDetail:
    collection = service.get_collection(session, authorization, collection_id)
    response.headers["ETag"] = etag_for(collection.version)
    return private_collection_detail(session, collection)


@router.patch(
    "/spaces/{spaceId}/private/collections/{collectionId}",
    response_model=PrivateCollectionDetail,
    operation_id="updatePrivateCollection",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_private_collection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateCollectionUpdate,
    expected_version: IfMatchVersion,
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> PrivateCollectionDetail:
    collection = service.update_collection(
        session,
        authorization,
        collection_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
    )
    response.headers["ETag"] = etag_for(collection.version)
    return private_collection_detail(session, collection)


@router.delete(
    "/spaces/{spaceId}/private/collections/{collectionId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deletePrivateCollection",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_private_collection(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> Response:
    service.delete_collection(
        session,
        authorization,
        collection_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/spaces/{spaceId}/private/collections/{collectionId}/items",
    response_model=PrivateCollectionItemDetail,
    status_code=status.HTTP_201_CREATED,
    operation_id="createPrivateCollectionItem",
    responses={201: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 422)},
)
def create_private_collection_item(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateCollectionItemCreate,
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> PrivateCollectionItemDetail:
    item = service.create_item(
        session,
        authorization,
        collection_id,
        title=body.title,
        completed=body.completed,
    )
    response.headers["ETag"] = etag_for(item.version)
    return private_collection_item_detail(item)


@router.get(
    "/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
    response_model=PrivateCollectionItemDetail,
    operation_id="getPrivateCollectionItem",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_private_collection_item(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    collection_id: Annotated[str, Path(alias="collectionId")],
    item_id: Annotated[str, Path(alias="itemId")],
) -> PrivateCollectionItemDetail:
    item = service.get_item(session, authorization, collection_id, item_id)
    response.headers["ETag"] = etag_for(item.version)
    return private_collection_item_detail(item)


@router.patch(
    "/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
    response_model=PrivateCollectionItemDetail,
    operation_id="updatePrivateCollectionItem",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_private_collection_item(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateCollectionItemUpdate,
    expected_version: IfMatchVersion,
    collection_id: Annotated[str, Path(alias="collectionId")],
    item_id: Annotated[str, Path(alias="itemId")],
) -> PrivateCollectionItemDetail:
    item = service.update_item(
        session,
        authorization,
        collection_id,
        item_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        title=body.title,
        completed=body.completed,
    )
    response.headers["ETag"] = etag_for(item.version)
    return private_collection_item_detail(item)


@router.delete(
    "/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    operation_id="deletePrivateCollectionItem",
    responses=problem_responses(401, 404, 409, 422),
)
def delete_private_collection_item(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    collection_id: Annotated[str, Path(alias="collectionId")],
    item_id: Annotated[str, Path(alias="itemId")],
) -> Response:
    service.delete_item(
        session,
        authorization,
        collection_id,
        item_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/spaces/{spaceId}/private/collections/{collectionId}/order",
    response_model=PrivateCollectionDetail,
    operation_id="reorderPrivateCollectionItems",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def reorder_private_collection_items(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PrivateCollectionOrder,
    expected_version: IfMatchVersion,
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> PrivateCollectionDetail:
    collection = service.reorder_items(
        session,
        authorization,
        collection_id,
        expected_version=expected_version,
        item_ids=body.item_ids,
    )
    response.headers["ETag"] = etag_for(collection.version)
    return private_collection_detail(session, collection)
