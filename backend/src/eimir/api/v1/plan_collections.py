"""Canonical shared lists linked to Plans through the typed relation lifecycle."""

from typing import Annotated

from fastapi import APIRouter, Path, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.collections import CollectionDetail, collection_details
from eimir.authorization import readable
from eimir.collections.models import Collection
from eimir.relations import service

router = APIRouter(tags=["plans"])
_PATH = "/spaces/{spaceId}/plans/{planId}/collections"


@router.get(
    _PATH,
    response_model=list[CollectionDetail],
    operation_id="listPlanCollections",
    responses=problem_responses(401, 404),
)
def list_plan_collections(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
) -> list[CollectionDetail]:
    ids = service.list_targets(session, authorization, plan_id, service.PLAN_COLLECTIONS)
    collections = list(
        session.scalars(readable(Collection, authorization).where(Collection.id.in_(ids)))
    )
    return collection_details(session, collections)


@router.put(
    _PATH + "/{collectionId}",
    status_code=204,
    response_class=Response,
    operation_id="linkPlanCollection",
    responses=problem_responses(401, 404),
)
def link_plan_collection(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> Response:
    service.link(session, authorization, plan_id, collection_id, service.PLAN_COLLECTIONS)
    return Response(status_code=204)


@router.delete(
    _PATH + "/{collectionId}",
    status_code=204,
    response_class=Response,
    operation_id="unlinkPlanCollection",
    responses=problem_responses(401, 404),
)
def unlink_plan_collection(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
    collection_id: Annotated[str, Path(alias="collectionId")],
) -> Response:
    service.unlink(session, authorization, plan_id, collection_id, service.PLAN_COLLECTIONS)
    return Response(status_code=204)
