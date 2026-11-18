"""Private operator protocol for the single current Mentria selection."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

QuoteLanguage = Literal["de", "en"]
MentriaId = Annotated[str, StringConstraints(pattern=r"^mentria-[0-9]+$", max_length=24)]
QuoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
DAILY_QUOTE_PATH = "/v1/daily-quote"
TOKEN_PATTERN = r"[A-Za-z0-9_-]{43}"


class CentralDailyQuote(BaseModel):
    checked_on: date
    id: MentriaId
    locale: QuoteLanguage
    text: QuoteText
