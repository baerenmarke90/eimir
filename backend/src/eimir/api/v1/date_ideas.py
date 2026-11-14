"""HTTP contract for curated date inspiration (Pro capability ``planning.date_inspiration``).

Reading the catalog requires the Space capability; one grant serves both
partners. Adopting an idea is not a catalog action: the client prefills the
existing Wish or Plan composer, and the couple saves an ordinary Wish or Plan
through the unchanged Free endpoints. Those stay readable, editable, plannable
and exportable after the Space loses Pro.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response
from pydantic import Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.date_ideas import service
from eimir.date_ideas.catalog import (
    BUDGET_MAX,
    MINUTES_MAX,
    DateIdeaCategory,
    DateIdeaPlaceType,
    IdeaFilter,
)
from eimir.entitlements.models import Capability

router = APIRouter(tags=["date-ideas"])


class DateIdeaLabel(ApiModel):
    id: str
    label: str = Field(description="Label in the response `locale`.")


class DateIdea(ApiModel):
    """One curated idea; all texts come from one locale entry."""

    id: str = Field(description="Persistent editorial ID. Never a Wish or Plan ID.")
    category: DateIdeaCategory
    place_type: DateIdeaPlaceType
    minutes: int = Field(description="Editorial time budget in minutes.")
    budget_eur_for_two: int = Field(
        description="Spending cap in whole EUR for two; 0 means no new spending."
    )
    title: str
    description: str
    wish_title: str = Field(description="Editable prefill for the Wish composer.")
    plan_title: str = Field(description="Editable prefill for the Plan composer.")
    prerequisites: list[str]
    content_locale: str = Field(description="Locale of all texts of this idea.")


class DateIdeaCatalog(ApiModel):
    catalog_version: str
    locale: str = Field(description="Resolved catalog locale for this response.")
    currency: str = Field(description="ISO 4217 currency of all budget amounts.")
    total_count: int = Field(description="Ideas in the catalog before filtering.")
    categories: list[DateIdeaLabel]
    place_types: list[DateIdeaLabel]
    ideas: list[DateIdea]


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
        ideas=[
            DateIdea(
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
            )
            for idea in listing.ideas
        ],
    )
