"""HTTP contract for typed M3 content relations.

M3-D08 selects option A from ``docs/m3/API-DESIGN.md``: nested routes per
target type rather than one generic relation endpoint with a discriminator.
The target type therefore lives in the path instead of the body. A client
cannot name a type the contract does not already know, and the OpenAPI types
remain free of unions.

Routes are created through ``_register`` because they differ only by target
type. The registered paths and ``operation_id`` values are nevertheless
fixed: the generated schema is identical to nine separately written
functions, without nine opportunities to make one subtly different.

``PUT`` is idempotent and always returns ``204``. Whether the relation was
just created or already existed is irrelevant to the caller, and returning
``201`` versus ``200`` would reveal what another device had just done.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response, status

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.relations import service
from eimir.relations.service import RelationKind

router = APIRouter(tags=["place-relations"])


class RelationTargets(ApiModel):
    """Targets linked to a place.

    Only IDs are returned. Content is fetched through each target domain's own
    route and authorization guard; returning content here would create a
    second read path with separate authorization logic.
    """

    items: list[UUID]


def _register(kind: RelationKind, *, singular: str, plural: str) -> None:
    """Register the three routes for one relation kind.

    ``singular``/``plural`` are the name components used in ``operation_id``.
    They appear in generated clients and are therefore passed explicitly
    instead of being derived from the slug.
    """
    collection = f"/spaces/{{spaceId}}/places/{{placeId}}/{kind.slug}"
    item = f"{collection}/{{targetId}}"

    @router.get(
        collection,
        response_model=RelationTargets,
        operation_id=f"listPlace{plural}",
        responses=problem_responses(401, 404),
        name=f"list_place_{kind.slug}",
    )
    def list_targets(
        authorization: Authorization,
        session: DbSession,
        place_id: Annotated[str, Path(alias="placeId")],
    ) -> RelationTargets:
        return RelationTargets(
            items=list(service.list_targets(session, authorization, place_id, kind))
        )

    @router.put(
        item,
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
        operation_id=f"linkPlace{singular}",
        responses=problem_responses(401, 404),
        name=f"link_place_{kind.slug}",
    )
    def link(
        authorization: Authorization,
        session: DbSession,
        place_id: Annotated[str, Path(alias="placeId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.link(session, authorization, place_id, target_id, kind)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete(
        item,
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
        operation_id=f"unlinkPlace{singular}",
        responses=problem_responses(401, 404),
        name=f"unlink_place_{kind.slug}",
    )
    def unlink(
        authorization: Authorization,
        session: DbSession,
        place_id: Annotated[str, Path(alias="placeId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.unlink(session, authorization, place_id, target_id, kind)
        return Response(status_code=status.HTTP_204_NO_CONTENT)


_register(service.PLACE_MEMORIES, singular="Memory", plural="Memories")
_register(service.PLACE_HEART_MOMENTS, singular="HeartMoment", plural="HeartMoments")
_register(service.PLACE_MILESTONES, singular="Milestone", plural="Milestones")
