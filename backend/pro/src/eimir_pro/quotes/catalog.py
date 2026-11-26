"""Curated, code-owned catalog of daily quotes, categories, and sources.

This catalog is closed and code-owned (#1151):
- The sayings are text without an individual author (AI-generated drafts, edited and
  approved one by one by the Product Owner). They are used under the repository
  license, so no author or citation is shown.
- A separate small set of "Klassiker" are public-domain quotations. They show the
  author and work; translations are our own and are labelled as translations.
- The previous catalog of public-domain quotations and first-party editorial sayings is
  archived in `backend/pro/archive/quotes` and no longer served.
- Rights and provenance stay recorded per saying in `daily_sayings.json`.
- Each saying expresses a complete thought and carries exactly one category.
- A collection holds the shared rights data. A single entry may override
  `publication_year` and `source_display` (for example the work of an author).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from importlib.resources import files


class RightsClassification(StrEnum):
    PUBLIC_DOMAIN = "PUBLIC_DOMAIN"
    EDITORIAL_CURATED = "EDITORIAL_CURATED"
    PROPRIETARY_LICENSED = "PROPRIETARY_LICENSED"


@dataclass(frozen=True)
class QuoteCategory:
    id: str
    name: str
    description: str


@dataclass(frozen=True)
class QuoteSource:
    id: str
    name: str
    description: str
    rights_classification: RightsClassification


@dataclass(frozen=True)
class DailyQuote:
    id: str
    text: str
    author_display: str
    source_display: str | None
    source_id: str
    category_ids: tuple[str, ...]
    locale: str
    rights_classification: RightsClassification
    attribution_required: bool
    original_work: str = ""
    source_edition: str = ""
    publication_year: int | None = None
    translator: str | None = None
    rights_basis: str = "Public Domain (author and translator p.m.a. > 70 years)"
    active: bool = True


# --- Curated Categories ---
CATEGORIES: tuple[QuoteCategory, ...] = (
    QuoteCategory(
        id="love",
        name="Liebe & Partnerschaft",
        description="Nähe, Vertrauen und das Gefühl, zusammenzugehören.",
    ),
    QuoteCategory(
        id="friendship",
        name="Freundschaft",
        description="Verbundenheit, Verständnis und gemeinsames Lachen.",
    ),
    QuoteCategory(
        id="motivation",
        name="Motivation & Erfolg",
        description="Ermutigung zum Anfangen, Dranbleiben und Wachsen.",
    ),
    QuoteCategory(
        id="humor",
        name="Humor & Witzig",
        description="Leichte Gedanken und kleine Schmunzler für zwischendurch.",
    ),
    QuoteCategory(
        id="life",
        name="Lebensweisheiten",
        description="Gedanken über Zufriedenheit, Zeit und das, was bleibt.",
    ),
    QuoteCategory(
        id="nature",
        name="Natur & Ruhe",
        description="Draußen sein, Stille finden und durchatmen.",
    ),
    QuoteCategory(
        id="travel",
        name="Reisen & Abenteuer",
        description="Unterwegs sein, Neues entdecken und Neugier behalten.",
    ),
    QuoteCategory(
        id="courage",
        name="Mut & Neuanfang",
        description="Der erste Schritt, Veränderung und Zuversicht.",
    ),
    QuoteCategory(
        id="selfcare",
        name="Selbstfürsorge & Gelassenheit",
        description="Pausen, Grenzen und ein freundlicher Umgang mit dir selbst.",
    ),
    QuoteCategory(
        id="together",
        name="Gemeinsame Erlebnisse & Alltag",
        description="Kleine gemeinsame Momente, die den Alltag besonders machen.",
    ),
)

CATEGORY_MAP: dict[str, QuoteCategory] = {category.id: category for category in CATEGORIES}


# --- V1 Curated Sources ---
SOURCES: tuple[QuoteSource, ...] = (
    QuoteSource(
        id="classic_literature",
        name="Klassische Literatur",
        description="Werke der klassischen Weltliteratur (Gemeinfrei / Public Domain).",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
    QuoteSource(
        id="stoic_philosophy",
        name="Antike Philosophie",
        description="Schriften der antiken und stoischen Philosophie (Gemeinfrei / Public Domain).",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
    QuoteSource(
        id="poetic_wisdom",
        name="Poesie & Lebensweisheiten",
        description="Aphorismen, poetische Gedanken und Sprüche für heute.",
        rights_classification=RightsClassification.EDITORIAL_CURATED,
    ),
)

SOURCE_MAP: dict[str, QuoteSource] = {source.id: source for source in SOURCES}


def _load_localized_sayings() -> tuple[DailyQuote, ...]:
    resource = files("eimir_pro.quotes").joinpath("daily_sayings.json")
    data = json.loads(resource.read_text(encoding="utf-8"))
    sayings = []
    for entry in data["entries"]:
        collection = data["collections"][entry["collection"]]
        author = collection["author_display"]
        for locale, text in entry["texts"].items():
            rights = RightsClassification(
                collection.get("rights_classification", RightsClassification.PUBLIC_DOMAIN)
            )
            rights_basis = collection["rights_basis"]
            source_display = entry.get("source_display", collection.get("source_display"))
            translator = collection.get("translator")
            original_locale = collection.get("original_locale", "de")
            if locale != original_locale and (
                rights is RightsClassification.PUBLIC_DOMAIN or "original_locale" in collection
            ):
                translation = data["translations"][locale]
                translation_label = translation["source_display"]
                if author and rights is RightsClassification.EDITORIAL_CURATED and source_display:
                    source_display = f"{source_display} · {translation_label}"
                else:
                    source_display = translation_label if author else None
                rights = RightsClassification.EDITORIAL_CURATED
                rights_basis = f"{rights_basis} {translation['rights_basis']}"
                translator = translation["translator"]
            sayings.append(
                DailyQuote(
                    id=f"saying-{locale}-{entry['id']}",
                    text=text,
                    author_display=author,
                    source_display=source_display,
                    source_id=collection["source_id"],
                    category_ids=tuple(entry["category_ids"]),
                    locale=locale,
                    rights_classification=rights,
                    attribution_required=bool(author),
                    original_work=entry["work"],
                    source_edition=" ".join(
                        part
                        for part in (collection["source_edition"], collection.get("source_url", ""))
                        if part
                    ),
                    publication_year=entry.get(
                        "publication_year", collection.get("publication_year")
                    ),
                    translator=translator,
                    rights_basis=rights_basis,
                )
            )
    return tuple(sayings)


QUOTES = _load_localized_sayings()


QUOTE_MAP: dict[str, DailyQuote] = {quote.id: quote for quote in QUOTES}


def get_categories() -> list[QuoteCategory]:
    """Return all available curated categories."""
    return list(CATEGORIES)


def get_sources() -> list[QuoteSource]:
    """Return all available curated sources."""
    return list(SOURCES)


def get_quotes(
    *,
    active_only: bool = True,
    locale: str | None = None,
) -> list[DailyQuote]:
    """Return quotes filtered by active status and optional locale prefix."""
    result = list(QUOTES)
    if active_only:
        result = [q for q in result if q.active]
    if locale is not None:
        norm_locale = locale.strip().lower()
        lang = norm_locale.split("-")[0].split("_")[0]
        result = [q for q in result if q.locale.lower() == norm_locale or q.locale.lower() == lang]
    return result


def get_quote_by_id(quote_id: str) -> DailyQuote | None:
    """Return one quote by ID or None."""
    return QUOTE_MAP.get(quote_id)
