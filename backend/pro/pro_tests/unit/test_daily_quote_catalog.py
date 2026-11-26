"""Unit tests for the curated Daily Quote catalog, provenance, and metadata."""

import json
from pathlib import Path

from eimir_pro.quotes import catalog
from eimir_pro.quotes.catalog import RightsClassification

from eimir.i18n import catalogs as language_catalogs

CATEGORY_IDS = {
    "love",
    "friendship",
    "motivation",
    "humor",
    "life",
    "nature",
    "travel",
    "courage",
    "selfcare",
    "together",
}


def test_catalog_categories_and_sources_are_defined() -> None:
    categories = catalog.get_categories()
    assert {c.id for c in categories} == CATEGORY_IDS
    assert all(c.name.strip() and c.description.strip() for c in categories)

    source_ids = {s.id for s in catalog.get_sources()}
    assert "poetic_wisdom" in source_ids


def _ai_sayings(locale: str | None = None) -> list[catalog.DailyQuote]:
    """The authorless AI-generated sayings, without the attributed public-domain quotations."""
    return [
        quote
        for quote in catalog.get_quotes(locale=locale, active_only=False)
        if quote.id.startswith(f"saying-{quote.locale}-ai-")
    ]


def test_catalog_holds_one_thousand_unique_ai_sayings_in_each_app_language() -> None:
    languages = set(language_catalogs())
    assert languages == {"de", "en"}
    for locale in languages:
        quotes = _ai_sayings(locale)
        assert len(quotes) == 1_000
        assert len({quote.id for quote in quotes}) == len(quotes)
        assert len({quote.text for quote in quotes}) == len(quotes)
        assert {quote.locale for quote in quotes} == {locale}

        per_category = {category: 0 for category in CATEGORY_IDS}
        for quote in quotes:
            assert len(quote.category_ids) == 1
            per_category[quote.category_ids[0]] += 1
        assert set(per_category.values()) == {100}


def test_whole_catalog_has_unique_ids_and_texts_and_equal_language_coverage() -> None:
    by_locale = {
        locale: catalog.get_quotes(locale=locale, active_only=False) for locale in ("de", "en")
    }
    assert len(by_locale["de"]) == len(by_locale["en"])
    for locale, quotes in by_locale.items():
        assert len({quote.id for quote in quotes}) == len(quotes)
        assert len({quote.text for quote in quotes}) == len(quotes)
        assert {quote.locale for quote in quotes} == {locale}
        assert {quote.category_ids[0] for quote in quotes} == CATEGORY_IDS
    ids = {quote.id for quote in catalog.get_quotes(active_only=False)}
    assert len(ids) == len(catalog.QUOTES)
    assert set(catalog.QUOTE_MAP) == ids


def test_every_english_saying_translates_one_german_original() -> None:
    originals = {quote.id.removeprefix("saying-de-"): quote for quote in _ai_sayings("de")}
    translations = {quote.id.removeprefix("saying-en-"): quote for quote in _ai_sayings("en")}
    assert translations.keys() == originals.keys()
    for key, translation in translations.items():
        original = originals[key]
        assert translation.text != original.text
        assert translation.category_ids == original.category_ids
        assert translation.author_display == ""
        assert translation.attribution_required is False
        assert translation.source_display is None
        assert translation.translator
        assert "CC0 1.0 Universal" in translation.rights_basis
        assert "AI-generated" in translation.rights_basis
        assert translation.rights_classification == RightsClassification.EDITORIAL_CURATED


def test_all_sayings_are_authorless_ai_generated_text_with_recorded_rights() -> None:
    valid_sources = {s.id for s in catalog.get_sources()}
    valid_categories = {c.id for c in catalog.get_categories()}

    for quote in _ai_sayings():
        assert quote.id.startswith(f"saying-{quote.locale}-ai-")
        assert quote.text.strip() == quote.text
        assert len(quote.text) >= 10
        assert quote.author_display == ""
        assert quote.attribution_required is False
        assert quote.source_display is None
        assert quote.source_id in valid_sources
        assert set(quote.category_ids) <= valid_categories
        assert quote.rights_classification == RightsClassification.EDITORIAL_CURATED
        assert "AI-generated" in quote.rights_basis
        assert quote.original_work.strip()
        assert quote.source_edition.strip()
        assert quote.publication_year == 2026
        assert quote.active is True
        assert (quote.translator is not None) == (quote.locale != "de")


def test_no_garbled_generated_wording_is_in_the_catalog() -> None:
    """The first generated draft repeated sayings with ungrammatical endings."""
    for quote in catalog.get_quotes(active_only=False):
        assert "ener Momente" not in quote.text
        assert "Augenblicken gilt:" not in quote.text
        assert "für ein Leben voller" not in quote.text


def test_previous_catalog_is_archived_and_no_longer_served() -> None:
    archive = (
        Path(__file__).resolve().parents[2]
        / "archive"
        / "quotes"
        / "daily_sayings.before-ai-sayings-2026-11-18.json"
    )
    previous = json.loads(archive.read_text(encoding="utf-8"))
    assert len(previous["entries"]) == 1_000

    # The AI sayings never reuse archived wording. Archived public-domain quotations are served
    # again only through `daily_sayings_public_domain.json`, after a fresh source verification.
    served_texts = {quote.text for quote in _ai_sayings()}
    archived_texts = {text for entry in previous["entries"] for text in entry["texts"].values()}
    assert served_texts.isdisjoint(archived_texts)


def test_get_quotes_filters_by_locale() -> None:
    german = catalog.get_quotes(locale="de")
    assert len(german) >= 1_000
    assert {category for quote in german for category in quote.category_ids} == CATEGORY_IDS
    assert catalog.get_quotes(locale="de-DE") == german

    english = catalog.get_quotes(locale="en-US")
    assert len(english) == len(german)
    assert {quote.locale for quote in english} == {"en"}


def test_get_quote_by_id() -> None:
    quote = catalog.get_quote_by_id("saying-de-ai-love-001")
    assert quote is not None
    assert quote.category_ids == ("love",)
    assert quote.author_display == ""

    missing = catalog.get_quote_by_id("nonexistent-quote-id")
    assert missing is None
