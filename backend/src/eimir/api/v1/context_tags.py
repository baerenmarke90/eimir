"""Read-only authored and local-model label suggestions, scoped to their sources."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.context_tags import service
from eimir.core.errors import ValidationError

router = APIRouter(tags=["context-tags"])


class ContextTagSuggestionsView(ApiModel):
    learned: list[str]
    proposed: list[str]


@router.get(
    "/spaces/{spaceId}/context-tag-suggestions",
    response_model=ContextTagSuggestionsView,
    operation_id="getContextTagSuggestions",
    responses=problem_responses(401, 404, 422),
)
def get_context_tag_suggestions(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    parent_type: Annotated[service.ParentKind | None, Query(alias="parentType")] = None,
    parent_id: Annotated[UUID | None, Query(alias="parentId")] = None,
) -> ContextTagSuggestionsView:
    if (parent_type is None) != (parent_id is None):
        raise ValidationError(
            "Parent kind and identifier must be supplied together.", "CONTEXT_TAG_PARENT_INVALID"
        )
    learned, proposed = service.suggestions(session, authorization, parent_type, parent_id)
    response.headers["Cache-Control"] = "private, no-store"
    return ContextTagSuggestionsView(learned=learned, proposed=proposed)
