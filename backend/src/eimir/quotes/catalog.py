"""Curated, code-owned catalog of daily quotes, categories, and sources.

This catalog is closed, curated, and legally auditable (#1151):
- Attributed quotations use identifiable works and documented source editions.
- Catalog translations of public-domain texts carry their own rights metadata.
- Original contemporary sayings carry first-party eimir. credit and provenance.
- Source editions and rights bases are retained internally. Authored texts show credit.
- Traditional sayings can be displayed without an author or a citation.
- Each passage expresses a complete thought outside its original context.
- Categories reflect the passage's meaning, and translations preserve that meaning.
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


# --- V1 Curated Categories ---
CATEGORIES: tuple[QuoteCategory, ...] = (
    QuoteCategory(
        id="love",
        name="Liebe & Beziehung",
        description="Gedanken über Verbundenheit, Nähe und Liebe im gemeinsamen Alltag.",
    ),
    QuoteCategory(
        id="life",
        name="Leben & Weisheit",
        description="Betrachtungen über den Lebensweg, menschliche Reife und Zeit.",
    ),
    QuoteCategory(
        id="philosophy",
        name="Philosophie",
        description="Klassische philosophische Einsichten und Reflexionen.",
    ),
    QuoteCategory(
        id="mindfulness",
        name="Achtsamkeit",
        description="Innehalten, Gegenwart und bewusste Wahrnehmung des Moments.",
    ),
    QuoteCategory(
        id="serenity",
        name="Gelassenheit",
        description="Innere Ruhe, Zuversicht und der gelassene Umgang mit Wandel.",
    ),
    QuoteCategory(
        id="motivation",
        name="Mut & Motivation",
        description="Ermutigung zum Anfangen, Dranbleiben und Wachsen.",
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
    resource = files("eimir.quotes").joinpath("daily_sayings.json")
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
            source_display = collection.get("source_display")
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
                    source_edition=f"{collection['source_edition']} {collection['source_url']}",
                    publication_year=collection.get("publication_year"),
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
