"""HTTP contract for M4-A global Search."""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.search import service
from eimir.search.service import SearchKind, SearchScope

router = APIRouter(tags=["search"])


class SearchResult(ApiModel):
    type: SearchKind
    id: UUID
    parent_id: UUID | None
    scope: SearchScope
    title: str | None
    excerpt: str | None
    occurred_on: date | None


class SearchPage(ApiModel):
    items: list[SearchResult]
    next_cursor: str | None


@router.get(
    "/spaces/{spaceId}/search",
    response_model=SearchPage,
    operation_id="searchSpaceContent",
    responses=problem_responses(400, 401, 404, 422),
)
def search_space_content(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    q: Annotated[str, Query()],
    type: Annotated[list[SearchKind] | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIMIT)] = service.DEFAULT_LIMIT,
) -> SearchPage:
    """Search shared Space content plus the caller's own private content."""
    page = service.search(
        session,
        authorization,
        query=q,
        kinds=tuple(type or ()),
        cursor=cursor,
        limit=limit,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return SearchPage(
        items=[
            SearchResult(
                type=item.kind,
                id=item.id,
                parent_id=item.parent_id,
                scope=item.scope,
                title=item.title,
                excerpt=item.excerpt,
                occurred_on=item.occurred_on,
            )
            for item in page.items
        ],
        next_cursor=page.next_cursor,
    )
