"""Curated, code-owned catalog of daily quotes, categories, and sources.

This catalog is closed and code-owned (#1151). It is loaded from two bundled resources:
- `daily_sayings.json`: AI-generated text without an individual author. It is selected for
  eimir. and used under the repository license, so no author or citation is shown.
- `daily_sayings_public_domain.json`: attributed quotations from public-domain works. Each
  quotation was checked against a transcription of the original text; the card shows author
  and work. German and English versions exist for every entry, and the version that is not
  the original language is an eimir. catalog translation labelled as such.
- The earlier catalog of public-domain quotations and first-party editorial sayings is
  archived in `backend/pro/archive/quotes`; none of it is served unless it was verified
  again for `daily_sayings_public_domain.json`.
- Rights and provenance stay recorded per saying in the resource that holds it.
- Each saying expresses a complete thought and carries exactly one category.
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


#: Catalog resources served by the Daily Quote feature, in serving order. Both use the same
#: schema (collections, entries, per-locale texts) and the same loader, so there is one
#: catalog, one selection mechanism and one API (#1151).
#:
#: - `daily_sayings.json`: authorless AI-generated sayings (1,000 per language).
#: - `daily_sayings_public_domain.json`: attributed quotations from public-domain works,
#:   each independently verified against its original text.
CATALOG_RESOURCES: tuple[str, ...] = (
    "daily_sayings.json",
    "daily_sayings_public_domain.json",
)


def _load_localized_sayings(resource_name: str) -> tuple[DailyQuote, ...]:
    resource = files("eimir_pro.quotes").joinpath(resource_name)
    data = json.loads(resource.read_text(encoding="utf-8"))
    sayings = []
    for entry in data["entries"]:
        collection = data["collections"][entry["collection"]]
        author = collection["author_display"]
        # An entry may refine its collection: the work title shown on the card, the edition
        # and permalink of the independently verified source text, and the first-publication
        # year. Collections that carry these once keep working unchanged.
        entry_source_display = entry.get("source_display", collection.get("source_display"))
        entry_source_edition = entry.get("source_edition") or collection["source_edition"]
        entry_source_url = entry.get("source_url") or collection["source_url"]
        entry_publication_year = entry.get("publication_year", collection.get("publication_year"))
        for locale, text in entry["texts"].items():
            rights = RightsClassification(
                collection.get("rights_classification", RightsClassification.PUBLIC_DOMAIN)
            )
            rights_basis = collection["rights_basis"]
            source_display = entry_source_display
            translator = collection.get("translator")
            original_locale = collection.get("original_locale", "de")
            if locale != original_locale and (
                rights is RightsClassification.PUBLIC_DOMAIN or "original_locale" in collection
            ):
                translation = data["translations"][locale]
                translation_label = translation["source_display"]
                if author and source_display:
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
                    source_edition=f"{entry_source_edition} {entry_source_url}",
                    publication_year=entry_publication_year,
                    translator=translator,
                    rights_basis=rights_basis,
                )
            )
    return tuple(sayings)


QUOTES = tuple(
    quote for resource_name in CATALOG_RESOURCES for quote in _load_localized_sayings(resource_name)
)


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
