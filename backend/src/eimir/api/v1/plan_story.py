"""Read the original authorized Story entries associated with a Plan."""

from typing import Annotated

from fastapi import APIRouter, Path, Query

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.v1.story import StoryHeartMomentItem, StoryPage, project_story_items
from eimir.authorization import ContentVisibility, require_readable
from eimir.plans.models import Plan
from eimir.story import service

router = APIRouter(tags=["plans"])


@router.get(
    "/spaces/{spaceId}/plans/{planId}/story",
    response_model=StoryPage,
    operation_id="listPlanStory",
    responses=problem_responses(400, 401, 404, 422),
)
def list_plan_story(
    authorization: Authorization,
    session: DbSession,
    plan_id: Annotated[str, Path(alias="planId")],
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIMIT)] = service.DEFAULT_LIMIT,
) -> StoryPage:
    plan = require_readable(session, Plan, authorization, plan_id)
    page = service.read_timeline(
        session, authorization, plan_id=plan.id, cursor=cursor, limit=limit
    )
    # Projection is a second authorized read. A privacy transition between the
    # identity page and projection must not expose even the owner's private text.
    items = [
        item
        for item in project_story_items(session, authorization, page.items)
        if not isinstance(item.root, StoryHeartMomentItem)
        or item.root.heart_moment.visibility is ContentVisibility.SHARED
    ]
    return StoryPage(items=items, next_cursor=page.next_cursor, has_more=page.has_more)
