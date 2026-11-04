"""Typed Memory-to-planning links, using the existing authorized relation lifecycle."""

from typing import Annotated

from fastapi import APIRouter, Path, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.place_relations import RelationTargets
from eimir.relations import service

router = APIRouter(tags=["memory-planning-relations"])


def _register(kind: service.RelationKind, singular: str, plural: str) -> None:
    collection = f"/spaces/{{spaceId}}/memories/{{memoryId}}/{kind.slug}"

    @router.get(
        collection,
        response_model=RelationTargets,
        operation_id=f"listMemory{plural}",
        responses=problem_responses(401, 404),
    )
    def list_targets(
        authorization: Authorization,
        session: DbSession,
        memory_id: Annotated[str, Path(alias="memoryId")],
    ) -> RelationTargets:
        return RelationTargets(
            items=list(service.list_targets(session, authorization, memory_id, kind))
        )

    @router.put(
        f"{collection}/{{targetId}}",
        status_code=204,
        response_class=Response,
        operation_id=f"linkMemory{singular}",
        responses=problem_responses(401, 404),
    )
    def link(
        authorization: Authorization,
        session: DbSession,
        memory_id: Annotated[str, Path(alias="memoryId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.link(session, authorization, memory_id, target_id, kind)
        return Response(status_code=204)

    @router.delete(
        f"{collection}/{{targetId}}",
        status_code=204,
        response_class=Response,
        operation_id=f"unlinkMemory{singular}",
        responses=problem_responses(401, 404),
    )
    def unlink(
        authorization: Authorization,
        session: DbSession,
        memory_id: Annotated[str, Path(alias="memoryId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.unlink(session, authorization, memory_id, target_id, kind)
        return Response(status_code=204)


_register(service.MEMORY_PLANS, "Plan", "Plans")
_register(service.MEMORY_WISHES, "Wish", "Wishes")
