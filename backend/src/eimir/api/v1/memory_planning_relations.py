"""Typed Memory-to-planning links, using the existing authorized relation lifecycle."""

from typing import Annotated

from fastapi import APIRouter, Path, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.place_relations import RelationTargets
from eimir.relations import service

router = APIRouter(tags=["memory-planning-relations"])
story_router = APIRouter(tags=["story-planning-relations"])


def _register(
    kind: service.RelationKind,
    singular: str,
    plural: str,
    *,
    source: str = "memories",
    source_name: str = "Memory",
    source_parameter: str = "memoryId",
    target_router: APIRouter = router,
) -> None:
    collection = f"/spaces/{{spaceId}}/{source}/{{{source_parameter}}}/{kind.slug}"

    @target_router.get(
        collection,
        response_model=RelationTargets,
        operation_id=f"list{source_name}{plural}",
        responses=problem_responses(401, 404),
    )
    def list_targets(
        authorization: Authorization,
        session: DbSession,
        source_id: Annotated[str, Path(alias=source_parameter)],
    ) -> RelationTargets:
        return RelationTargets(
            items=list(service.list_targets(session, authorization, source_id, kind))
        )

    @target_router.put(
        f"{collection}/{{targetId}}",
        status_code=204,
        response_class=Response,
        operation_id=f"link{source_name}{singular}",
        responses=problem_responses(401, 404),
    )
    def link(
        authorization: Authorization,
        session: DbSession,
        source_id: Annotated[str, Path(alias=source_parameter)],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.link(session, authorization, source_id, target_id, kind)
        return Response(status_code=204)

    @target_router.delete(
        f"{collection}/{{targetId}}",
        status_code=204,
        response_class=Response,
        operation_id=f"unlink{source_name}{singular}",
        responses=problem_responses(401, 404),
    )
    def unlink(
        authorization: Authorization,
        session: DbSession,
        source_id: Annotated[str, Path(alias=source_parameter)],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.unlink(session, authorization, source_id, target_id, kind)
        return Response(status_code=204)


_register(service.MEMORY_PLANS, "Plan", "Plans")
_register(service.MEMORY_WISHES, "Wish", "Wishes")
_register(
    service.HEART_MOMENT_PLANS,
    "Plan",
    "Plans",
    source="heart-moments",
    source_name="HeartMoment",
    source_parameter="heartMomentId",
    target_router=story_router,
)
_register(
    service.MILESTONE_PLANS,
    "Plan",
    "Plans",
    source="milestones",
    source_name="Milestone",
    source_parameter="milestoneId",
    target_router=story_router,
)
