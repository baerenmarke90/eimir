"""HTTP contract for typed Chapter content relations.

The route shape mirrors Place relations so generated clients keep one explicit
operation per target type. Chapter response schemas remain explicitly named so
adding this surface cannot rename the already versioned Place relation schema.
Combined Chapter content is a read-only derived view of the typed relations; no
manual relation position exists.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response, status

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.relations import service
from eimir.relations.service import RelationKind, TargetType

router = APIRouter(tags=["chapter-relations"])


class ChapterRelationTargets(ApiModel):
    items: list[UUID]


class ChapterContentItem(ApiModel):
    target_type: TargetType
    target_id: UUID


class ChapterContent(ApiModel):
    items: list[ChapterContentItem]


def _register(kind: RelationKind, *, singular: str, plural: str) -> None:
    collection = f"/spaces/{{spaceId}}/chapters/{{chapterId}}/{kind.slug}"
    item = f"{collection}/{{targetId}}"

    @router.get(
        collection,
        response_model=ChapterRelationTargets,
        operation_id=f"listChapter{plural}",
        responses=problem_responses(401, 404),
        name=f"list_chapter_{kind.slug}",
    )
    def list_targets(
        authorization: Authorization,
        session: DbSession,
        chapter_id: Annotated[str, Path(alias="chapterId")],
    ) -> ChapterRelationTargets:
        return ChapterRelationTargets(
            items=list(service.list_targets(session, authorization, chapter_id, kind))
        )

    @router.put(
        item,
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
        operation_id=f"linkChapter{singular}",
        responses=problem_responses(401, 404),
        name=f"link_chapter_{kind.slug}",
    )
    def link(
        authorization: Authorization,
        session: DbSession,
        chapter_id: Annotated[str, Path(alias="chapterId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.link(session, authorization, chapter_id, target_id, kind)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete(
        item,
        status_code=status.HTTP_204_NO_CONTENT,
        response_class=Response,
        operation_id=f"unlinkChapter{singular}",
        responses=problem_responses(401, 404),
        name=f"unlink_chapter_{kind.slug}",
    )
    def unlink(
        authorization: Authorization,
        session: DbSession,
        chapter_id: Annotated[str, Path(alias="chapterId")],
        target_id: Annotated[str, Path(alias="targetId")],
    ) -> Response:
        service.unlink(session, authorization, chapter_id, target_id, kind)
        return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/spaces/{spaceId}/chapters/{chapterId}/content",
    response_model=ChapterContent,
    operation_id="listChapterContent",
    responses=problem_responses(401, 404),
)
def list_chapter_content(
    authorization: Authorization,
    session: DbSession,
    chapter_id: Annotated[str, Path(alias="chapterId")],
) -> ChapterContent:
    return ChapterContent(
        items=[
            ChapterContentItem(target_type=item.target_type, target_id=item.target_id)
            for item in service.list_chapter_content(session, authorization, chapter_id)
        ]
    )


_register(service.CHAPTER_MEMORIES, singular="Memory", plural="Memories")
_register(service.CHAPTER_HEART_MOMENTS, singular="HeartMoment", plural="HeartMoments")
_register(service.CHAPTER_MILESTONES, singular="Milestone", plural="Milestones")
