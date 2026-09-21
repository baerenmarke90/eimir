"""HTTP contract for the personal Daily Quote Pro capability."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import Field

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.entitlements.models import Capability
from eimir.quotes import catalog, resolver
from eimir.quotes import service as preference_service
from eimir.quotes.catalog import RightsClassification

router = APIRouter(tags=["daily-quote"])

ETAG_HEADERS = {
    "ETag": {
        "description": (
            "Opaque preference concurrency token. Send it unchanged in subsequent "
            "PATCH requests in the `If-Match` header."
        ),
        "schema": {"type": "string"},
    }
}


class DailyQuoteView(ApiModel):
    id: str
    text: str
    author_display: str
    source_display: str | None = None
    source_id: str
    category_ids: list[str]
    locale: str
    rights_classification: RightsClassification
    attribution_required: bool


class DailyQuoteResponse(ApiModel):
    quote: DailyQuoteView | None = None
    checked_on: date
    enabled: bool


class QuoteSourceView(ApiModel):
    id: str
    name: str
    description: str
    rights_classification: RightsClassification


class QuoteCategoryView(ApiModel):
    id: str
    name: str
    description: str


class DailyQuoteCatalogView(ApiModel):
    sources: list[QuoteSourceView]
    categories: list[QuoteCategoryView]


class DailyQuotePreferenceView(ApiModel):
    account_id: UUID
    enabled: bool
    selected_source_ids: list[str]
    selected_category_ids: list[str]
    locale: str | None = None
    version: int


class DailyQuotePreferencePatch(ApiModel):
    enabled: bool | None = None
    selected_source_ids: list[str] | None = None
    selected_category_ids: list[str] | None = None
    locale: str | None = Field(default=None, max_length=16)


@router.get(
    "/spaces/{spaceId}/daily-quote",
    response_model=DailyQuoteResponse,
    operation_id="getDailyQuote",
    responses=problem_responses(
        401,
        403,
        404,
        descriptions={
            403: "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability `daily.quote`.",
        },
    ),
)
def get_daily_quote(
    authorization: Authorization,
    session: DbSession,
) -> DailyQuoteResponse:
    """Return the deterministic quote of the day for the authorized caller.

    Requires that the Space holds the `daily.quote` Pro entitlement.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.DAILY_QUOTE.value,
        lock_grants=False,
    )
    resolved = resolver.resolve_daily_quote(session, authorization)

    quote_view: DailyQuoteView | None = None
    if resolved.quote is not None:
        quote_view = DailyQuoteView(
            id=resolved.quote.id,
            text=resolved.quote.text,
            author_display=resolved.quote.author_display,
            source_display=resolved.quote.source_display,
            source_id=resolved.quote.source_id,
            category_ids=list(resolved.quote.category_ids),
            locale=resolved.quote.locale,
            rights_classification=resolved.quote.rights_classification,
            attribution_required=resolved.quote.attribution_required,
        )

    return DailyQuoteResponse(
        quote=quote_view,
        checked_on=resolved.checked_on,
        enabled=resolved.enabled,
    )


@router.get(
    "/spaces/{spaceId}/daily-quote/preferences",
    response_model=DailyQuotePreferenceView,
    operation_id="getDailyQuotePreferences",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            403,
            404,
            descriptions={
                403: (
                    "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability `daily.quote`."
                ),
            },
        ),
    },
)
def get_daily_quote_preferences(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> DailyQuotePreferenceView:
    """Return caller's personal Daily Quote preferences.

    Protected by `daily.quote`. Returns only the caller's own preferences.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.DAILY_QUOTE.value,
        lock_grants=False,
    )
    preference = preference_service.get_or_default_preference(session, authorization.account_id)

    token = preference_service.preference_concurrency_token(
        preference if preference.version > 0 else None,
        authorization.account_id,
    )
    response.headers["ETag"] = etag_for_token(token)
    response.headers["Cache-Control"] = "private, no-store"

    return DailyQuotePreferenceView(
        account_id=authorization.account_id,
        enabled=preference.enabled,
        selected_source_ids=list(preference.selected_source_ids),
        selected_category_ids=list(preference.selected_category_ids),
        locale=preference.locale,
        version=preference.version,
    )


@router.patch(
    "/spaces/{spaceId}/daily-quote/preferences",
    response_model=DailyQuotePreferenceView,
    operation_id="updateDailyQuotePreferences",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(
            401,
            403,
            404,
            409,
            422,
            descriptions={
                403: (
                    "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability `daily.quote`."
                ),
                409: "`RESOURCE_VERSION_CONFLICT`: preferences changed since they were read.",
            },
        ),
    },
)
def update_daily_quote_preferences(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: DailyQuotePreferencePatch,
    expected_token: IfMatchToken,
) -> DailyQuotePreferenceView:
    """Update caller's personal Daily Quote preferences.

    Requires `If-Match` optimistic concurrency header.
    Protected by `daily.quote`. Cannot modify partner preferences.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.DAILY_QUOTE.value,
        lock_grants=True,
    )
    updated = preference_service.update_preference(
        session,
        authorization.account_id,
        enabled=body.enabled,
        selected_source_ids=body.selected_source_ids,
        selected_category_ids=body.selected_category_ids,
        locale=body.locale,
        expected_token=expected_token,
    )

    token = preference_service.preference_concurrency_token(updated, authorization.account_id)
    response.headers["ETag"] = etag_for_token(token)
    response.headers["Cache-Control"] = "private, no-store"

    return DailyQuotePreferenceView(
        account_id=updated.account_id,
        enabled=updated.enabled,
        selected_source_ids=list(updated.selected_source_ids),
        selected_category_ids=list(updated.selected_category_ids),
        locale=updated.locale,
        version=updated.version,
    )


@router.get(
    "/spaces/{spaceId}/daily-quote/catalog",
    response_model=DailyQuoteCatalogView,
    operation_id="getDailyQuoteCatalog",
    responses=problem_responses(
        401,
        403,
        404,
        descriptions={
            403: "`PREMIUM_ENTITLEMENT_REQUIRED`: Space lacks the Pro capability `daily.quote`.",
        },
    ),
)
def get_daily_quote_catalog(
    authorization: Authorization,
    session: DbSession,
) -> DailyQuoteCatalogView:
    """Return available curated sources and categories for the preference editor."""
    ensure_capability(
        session,
        authorization.space_id,
        Capability.DAILY_QUOTE.value,
        lock_grants=False,
    )
    sources = [
        QuoteSourceView(
            id=s.id,
            name=s.name,
            description=s.description,
            rights_classification=s.rights_classification,
        )
        for s in catalog.get_sources()
    ]
    categories = [
        QuoteCategoryView(
            id=c.id,
            name=c.name,
            description=c.description,
        )
        for c in catalog.get_categories()
    ]
    return DailyQuoteCatalogView(sources=sources, categories=categories)
