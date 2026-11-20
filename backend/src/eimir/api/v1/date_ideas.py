"""HTTP contract for curated date inspiration (Pro capability ``planning.date_inspiration``).

Reading the catalog requires the Space capability; one grant serves both
partners. Adopting an idea is not a catalog action: the client prefills the
existing Wish or Plan composer, and the couple saves an ordinary Wish or Plan
through the unchanged Free endpoints. Those stay readable, editable, plannable
and exportable after the Space loses Pro.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response
from pydantic import Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.core.errors import NotFoundError
from eimir.date_ideas import service
from eimir.date_ideas.catalog import (
    BUDGET_MAX,
    MINUTES_MAX,
    DateIdeaCategory,
    DateIdeaPlaceType,
    IdeaFilter,
    ResolvedIdea,
)
from eimir.date_ideas.images import IMAGE_ID_PATTERN, DateIdeaImages, get_images
from eimir.entitlements.models import Capability
from eimir.wish_selections.date_idea_contract import DateIdea, DateIdeaImage

router = APIRouter(tags=["date-ideas"])


class DateIdeaLabel(ApiModel):
    id: str
    label: str = Field(description="Label in the response `locale`.")


class DateIdeaCatalog(ApiModel):
    catalog_version: str
    locale: str = Field(description="Resolved catalog locale for this response.")
    currency: str = Field(description="ISO 4217 currency of all budget amounts.")
    total_count: int = Field(description="Ideas in the catalog before filtering.")
    categories: list[DateIdeaLabel]
    place_types: list[DateIdeaLabel]
    ideas: list[DateIdea]


def date_idea_view(idea: ResolvedIdea, images: DateIdeaImages) -> DateIdea:
    """Public API projection of one resolved idea; callers enforce the capability."""
    return DateIdea(
        id=idea.id,
        category=idea.category,
        place_type=idea.place_type,
        minutes=idea.minutes,
        budget_eur_for_two=idea.budget_eur_for_two,
        title=idea.title,
        description=idea.description,
        wish_title=idea.wish_title,
        plan_title=idea.plan_title,
        prerequisites=list(idea.prerequisites),
        content_locale=idea.content_locale,
        image=DateIdeaImage(**vars(images.for_idea(idea.id, idea.category, idea.content_locale))),
    )


@router.get(
    "/spaces/{spaceId}/date-ideas",
    response_model=DateIdeaCatalog,
    operation_id="listDateIdeas",
    responses=problem_responses(
        401,
        403,
        404,
        422,
        descriptions={
            403: (
                "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability "
                "`planning.date_inspiration`."
            ),
        },
    ),
)
def list_date_ideas(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    locale: Annotated[str | None, Query(max_length=16)] = None,
    category: Annotated[DateIdeaCategory | None, Query()] = None,
    max_minutes: Annotated[int | None, Query(alias="maxMinutes", ge=1, le=MINUTES_MAX)] = None,
    max_budget: Annotated[int | None, Query(alias="maxBudget", ge=0, le=BUDGET_MAX)] = None,
    place: Annotated[DateIdeaPlaceType | None, Query()] = None,
) -> DateIdeaCatalog:
    """Curated ideas in editorial order; all filters combine with AND.

    `maxMinutes` and `maxBudget` are inclusive upper bounds; `maxBudget=0`
    selects ideas without new spending. Omitting `place` means anywhere.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.PLANNING_DATE_INSPIRATION.value,
        lock_grants=False,
    )
    images = get_images()
    listing = service.list_date_ideas(
        locale=locale,
        idea_filter=IdeaFilter(
            category=category, max_minutes=max_minutes, max_budget=max_budget, place=place
        ),
    )
    # Protected content: never stored by shared caches or reused after a downgrade.
    response.headers["Cache-Control"] = "private, no-store"
    return DateIdeaCatalog(
        catalog_version=listing.catalog.version,
        locale=listing.locale,
        currency=listing.catalog.currency,
        total_count=listing.total_count,
        categories=[DateIdeaLabel(id=item.id, label=item.label) for item in listing.categories],
        place_types=[DateIdeaLabel(id=item.id, label=item.label) for item in listing.place_types],
        ideas=[date_idea_view(idea, images) for idea in listing.ideas],
    )


DATE_IDEA_IMAGE_NOT_FOUND = "DATE_IDEA_IMAGE_NOT_FOUND"


@router.get(
    "/spaces/{spaceId}/date-ideas/images/{imageId}",
    operation_id="getDateIdeaImage",
    response_class=Response,
    responses={
        200: {"content": {"image/webp": {"schema": {"type": "string", "format": "binary"}}}},
        **problem_responses(
            401,
            403,
            404,
            422,
            descriptions={
                403: (
                    "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability "
                    "`planning.date_inspiration`."
                ),
                404: "`DATE_IDEA_IMAGE_NOT_FOUND` or `SPACE_NOT_FOUND`.",
            },
        ),
    },
)
def get_date_idea_image(
    authorization: Authorization,
    session: DbSession,
    image_id: Annotated[str, Path(alias="imageId", pattern=IMAGE_ID_PATTERN, max_length=64)],
) -> Response:
    """One editorial catalog image (WebP). Protected like the catalog itself."""
    ensure_capability(
        session,
        authorization.space_id,
        Capability.PLANNING_DATE_INSPIRATION.value,
        lock_grants=False,
    )
    data = get_images().read(image_id)
    if data is None:
        raise NotFoundError("Date idea image not found.", DATE_IDEA_IMAGE_NOT_FOUND)
    # Not stored by shared or browser caches, so a downgrade leaves no copy.
    return Response(
        content=data,
        media_type="image/webp",
        headers={"Cache-Control": "private, no-store"},
    )
