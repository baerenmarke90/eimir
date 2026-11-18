"""Backend-only access to the operator's daily quote service."""

import logging
from datetime import date
from functools import lru_cache

import httpx
from pydantic import SecretStr, ValidationError

from eimir.quotes.catalog import DailyQuote, RightsClassification
from eimir.quotes.central_contract import DAILY_QUOTE_PATH, CentralDailyQuote, QuoteLanguage

logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def _fetch_quote(
    origin: str, token: SecretStr, locale: QuoteLanguage, day: date
) -> CentralDailyQuote:
    with httpx.Client(timeout=1.0, follow_redirects=False, trust_env=False) as client:
        response = client.get(
            f"{origin}{DAILY_QUOTE_PATH}",
            params={"locale": locale},
            headers={"Authorization": f"Bearer {token.get_secret_value()}"},
        )
        response.raise_for_status()
        quote = CentralDailyQuote.model_validate_json(response.content)
    if quote.locale != locale or quote.checked_on != day:
        raise ValueError("The central quote did not match the requested locale and current day.")
    return quote


def get_quote(origin: str, token: SecretStr, locale: QuoteLanguage, day: date) -> DailyQuote | None:
    """Fetch the current quote, with a local fallback on provider failure."""
    try:
        quote = _fetch_quote(origin, token, locale, day)
    except (httpx.HTTPError, ValidationError, ValueError):
        logger.debug("Central daily quote unavailable.")
        return None
    source = "Motivational Quotes · Apache-2.0"
    if locale == "de":
        source += " · Deutsche Übersetzung"
    return DailyQuote(
        id=quote.id,
        text=quote.text,
        author_display="Mentria",
        source_display=source,
        source_id="poetic_wisdom",
        category_ids=("motivation",),
        locale=quote.locale,
        rights_classification=RightsClassification.EDITORIAL_CURATED,
        attribution_required=True,
        rights_basis="Apache-2.0 as declared by the Mentria dataset.",
    )
