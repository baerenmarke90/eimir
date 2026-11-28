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

SAYINGS_PER_LANGUAGE = 474
CLASSICS_PER_LANGUAGE = 45
QUOTES_PER_LANGUAGE = SAYINGS_PER_LANGUAGE + CLASSICS_PER_LANGUAGE


def _is_classic(quote: catalog.DailyQuote) -> bool:
    return quote.id.startswith(f"saying-{quote.locale}-klassiker-")


def test_catalog_categories_and_sources_are_defined() -> None:
    categories = catalog.get_categories()
    assert {c.id for c in categories} == CATEGORY_IDS
    assert all(c.name.strip() and c.description.strip() for c in categories)

    source_ids = {s.id for s in catalog.get_sources()}
    assert {"poetic_wisdom", "classic_literature"} <= source_ids


def test_catalog_holds_the_approved_sayings_and_classics_in_each_app_language() -> None:
    languages = set(language_catalogs())
    assert languages == {"de", "en"}
    for locale in languages:
        quotes = catalog.get_quotes(locale=locale, active_only=False)
        assert len(quotes) == QUOTES_PER_LANGUAGE
        assert sum(1 for quote in quotes if _is_classic(quote)) == CLASSICS_PER_LANGUAGE
        assert len({quote.id for quote in quotes}) == len(quotes)
        assert len({quote.text for quote in quotes}) == len(quotes)
        assert {quote.locale for quote in quotes} == {locale}

        per_category = {category: 0 for category in CATEGORY_IDS}
        for quote in quotes:
            assert len(quote.category_ids) == 1
            per_category[quote.category_ids[0]] += 1
        assert min(per_category.values()) >= 15


def test_every_english_saying_translates_one_german_original() -> None:
    originals = {
        quote.id.removeprefix("saying-de-"): quote for quote in catalog.get_quotes(locale="de")
    }
    translations = {
        quote.id.removeprefix("saying-en-"): quote for quote in catalog.get_quotes(locale="en")
    }
    assert translations.keys() == originals.keys()
    for key, translation in translations.items():
        original = originals[key]
        assert translation.text != original.text
        assert translation.category_ids == original.category_ids
        assert translation.author_display == original.author_display
        assert translation.attribution_required == original.attribution_required


def test_all_sayings_are_authorless_ai_generated_text_with_recorded_rights() -> None:
    valid_sources = {s.id for s in catalog.get_sources()}
    valid_categories = {c.id for c in catalog.get_categories()}
    sayings = [q for q in catalog.get_quotes(active_only=False) if not _is_classic(q)]
    assert len(sayings) == 2 * SAYINGS_PER_LANGUAGE

    for quote in sayings:
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
        if quote.locale != "de":
            assert "CC0 1.0 Universal" in quote.rights_basis


def test_classics_show_author_and_work_and_label_our_own_translations() -> None:
    classics = [q for q in catalog.get_quotes(active_only=False) if _is_classic(q)]
    assert len(classics) == 2 * CLASSICS_PER_LANGUAGE
    valid_categories = {c.id for c in catalog.get_categories()}
    german_originals = 0

    for quote in classics:
        assert quote.author_display.strip()
        assert quote.attribution_required is True
        assert quote.source_id == "classic_literature"
        assert set(quote.category_ids) <= valid_categories
        assert quote.original_work.strip()
        assert quote.source_edition.strip()
        assert quote.publication_year is not None and quote.publication_year <= 1930
        assert quote.source_display
        assert "Public Domain" in quote.rights_basis
        if quote.translator is None:
            # Original wording in the original language: public domain, work shown.
            assert quote.rights_classification == RightsClassification.PUBLIC_DOMAIN
            assert quote.source_display in quote.original_work
            german_originals += quote.locale == "de"
        else:
            # Our own translation: labelled as such, catalog translation under CC0.
            assert quote.rights_classification == RightsClassification.EDITORIAL_CURATED
            assert quote.source_display in {"English translation", "Deutsche Übersetzung"}
            assert "CC0 1.0 Universal" in quote.rights_basis
    assert german_originals == 29


def test_no_garbled_generated_wording_is_in_the_catalog() -> None:
    """The first generated draft repeated sayings with ungrammatical endings."""
    for quote in catalog.get_quotes(active_only=False):
        assert "ener Momente" not in quote.text
        assert "Augenblicken gilt:" not in quote.text
        assert "für ein Leben voller" not in quote.text


def test_previous_catalog_is_archived_and_the_sayings_do_not_reuse_it() -> None:
    archive = (
        Path(__file__).resolve().parents[2]
        / "archive"
        / "quotes"
        / "daily_sayings.before-ai-sayings-2026-11-18.json"
    )
    previous = json.loads(archive.read_text(encoding="utf-8"))
    assert len(previous["entries"]) == 1_000

    served_texts = {
        quote.text for quote in catalog.get_quotes(active_only=False) if not _is_classic(quote)
    }
    archived_texts = {text for entry in previous["entries"] for text in entry["texts"].values()}
    assert served_texts.isdisjoint(archived_texts)


def test_get_quotes_filters_by_locale() -> None:
    german = catalog.get_quotes(locale="de")
    assert len(german) == QUOTES_PER_LANGUAGE
    assert {category for quote in german for category in quote.category_ids} == CATEGORY_IDS
    assert catalog.get_quotes(locale="de-DE") == german

    english = catalog.get_quotes(locale="en-US")
    assert len(english) == QUOTES_PER_LANGUAGE
    assert {quote.locale for quote in english} == {"en"}


def test_get_quote_by_id() -> None:
    quote = catalog.get_quote_by_id("saying-de-ai-love-001")
    assert quote is not None
    assert quote.category_ids == ("love",)
    assert quote.author_display == ""

    classic = catalog.get_quote_by_id("saying-de-klassiker-001")
    assert classic is not None
    assert classic.author_display == "Johann Wolfgang von Goethe"
    assert classic.attribution_required is True

    missing = catalog.get_quote_by_id("nonexistent-quote-id")
    assert missing is None
