"""HTTP contract for curated date inspiration (Pro capability ``planning.date_inspiration``).

Reading the catalog and saving an idea as a Wish require the Space capability.
The resulting Wish is an ordinary shared Wish: reading, editing, planning,
completing, exporting and deleting it go through the unchanged Free Wish and
Plan endpoints, also after the Space loses Pro.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from fastapi import status as http_status
from pydantic import ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema

from eimir.api.concurrency import etag_for
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.idempotency import IdempotencyKey
from eimir.api.schema import ApiModel
from eimir.api.v1.wishes import ETAG_HEADERS, WishDetail, wish_detail
from eimir.date_ideas import service
from eimir.date_ideas.catalog import (
    CATEGORY_ID_PATTERN,
    BudgetBand,
    DateSetting,
    DurationBand,
    IdeaFilter,
    SettingFilter,
)
from eimir.entitlements.models import Capability

router = APIRouter(tags=["date-ideas"])

_PRO_REQUIRED = {
    403: (
        "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability "
        "`planning.date_inspiration`."
    ),
}


class DateIdeaCategory(ApiModel):
    id: str
    label: str = Field(description="Category label in the response `locale`.")


class DateIdea(ApiModel):
    """One curated idea, localized to the response locale where available."""

    id: str = Field(description="Stable, permanent catalog ID.")
    title: str
    description: str
    requirements: list[str]
    category_id: str
    content_locale: str = Field(
        description="Locale of the texts; differs from `locale` when a translation falls back."
    )
    duration_min_minutes: int
    duration_max_minutes: int
    duration_band: DurationBand
    budget_min: int = Field(description="Approximate total for two people, `currency` units.")
    budget_max: int
    budget_band: BudgetBand
    setting: DateSetting
    saved_wish_id: UUID | SkipJsonSchema[None] = Field(
        default=None,
        description=(
            "Open or planned shared Wish of this Space saved from this idea. "
            "Absent when the idea is not currently saved."
        ),
        exclude_if=lambda value: value is None,
    )


class DateIdeaCatalog(ApiModel):
    catalog_version: str
    edition: str = Field(
        description="`development` marks a demonstration dataset, `editorial` the curated one."
    )
    locale: str = Field(description="Resolved catalog locale for this response.")
    currency: str = Field(description="ISO 4217 currency of all budget amounts.")
    total_count: int = Field(description="Active ideas before filtering.")
    categories: list[DateIdeaCategory]
    ideas: list[DateIdea]


class DateIdeaWishCreate(ApiModel):
    """Save an idea as a Wish. Title and description are taken from the catalog."""

    model_config = ConfigDict(extra="forbid")

    locale: str | SkipJsonSchema[None] = Field(
        default=None,
        max_length=16,
        description="Preferred text locale; unsupported values fall back to the catalog default.",
    )


@router.get(
    "/spaces/{spaceId}/date-ideas",
    response_model=DateIdeaCatalog,
    response_model_exclude_none=True,
    operation_id="listDateIdeas",
    responses=problem_responses(401, 403, 404, 422, descriptions=_PRO_REQUIRED),
)
def list_date_ideas(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    locale: Annotated[str | None, Query(max_length=16)] = None,
    category: Annotated[str | None, Query(pattern=CATEGORY_ID_PATTERN)] = None,
    duration: Annotated[DurationBand | None, Query()] = None,
    budget: Annotated[BudgetBand | None, Query()] = None,
    setting: Annotated[SettingFilter | None, Query()] = None,
) -> DateIdeaCatalog:
    """Curated ideas in deterministic editorial order; all filters combine with AND.

    A `HOME` or `OUT` setting filter also returns ideas that work in both
    settings. An unknown category yields an empty result rather than an error,
    so a client holding an older catalog degrades gracefully.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.PLANNING_DATE_INSPIRATION.value,
        lock_grants=False,
    )
    listing = service.list_date_ideas(
        session,
        authorization,
        locale=locale,
        idea_filter=IdeaFilter(
            category=category, duration=duration, budget=budget, setting=setting
        ),
    )
    response.headers["Cache-Control"] = "private, no-store"
    return DateIdeaCatalog(
        catalog_version=listing.catalog.version,
        edition=listing.catalog.edition,
        locale=listing.locale,
        currency=listing.catalog.currency,
        total_count=listing.total_active,
        categories=[
            DateIdeaCategory(id=category.id, label=category.label)
            for category in listing.categories
        ],
        ideas=[
            DateIdea(
                id=idea.id,
                title=idea.title,
                description=idea.description,
                requirements=list(idea.requirements),
                category_id=idea.category_id,
                content_locale=idea.content_locale,
                duration_min_minutes=idea.duration_min_minutes,
                duration_max_minutes=idea.duration_max_minutes,
                duration_band=idea.duration_band,
                budget_min=idea.budget_min,
                budget_max=idea.budget_max,
                budget_band=idea.budget_band,
                setting=idea.setting,
                saved_wish_id=listing.saved_wish_ids.get(idea.id),
            )
            for idea in listing.ideas
        ],
    )


@router.post(
    "/spaces/{spaceId}/date-ideas/{ideaId}/wish",
    response_model=WishDetail,
    status_code=http_status.HTTP_201_CREATED,
    operation_id="saveDateIdeaAsWish",
    responses={
        200: {
            "description": (
                "The idea is already saved as an open or planned Wish of this Space, "
                "or this replays an earlier request with the same `Idempotency-Key`."
            ),
            "headers": ETAG_HEADERS,
            "model": WishDetail,
        },
        201: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            403,
            404,
            409,
            422,
            descriptions={
                **_PRO_REQUIRED,
                404: "`DATE_IDEA_NOT_FOUND`, `SPACE_NOT_FOUND` or `WISH_CREATE_RESULT_DELETED`.",
            },
        ),
    },
)
def save_date_idea_as_wish(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: DateIdeaWishCreate,
    idempotency_key: IdempotencyKey,
    idea_id: Annotated[str, Path(alias="ideaId", max_length=64)],
) -> WishDetail:
    """Create a regular shared Wish from a curated idea, at most once while it is open."""
    ensure_capability(session, authorization.space_id, Capability.PLANNING_DATE_INSPIRATION.value)
    result = service.save_idea_as_wish(
        session,
        authorization,
        idea_id,
        locale=body.locale,
        idempotency_key=idempotency_key,
    )
    if not result.created:
        response.status_code = http_status.HTTP_200_OK
    response.headers["ETag"] = etag_for(result.wish.version)
    return wish_detail(session, authorization, result.wish)
