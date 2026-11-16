"""Unit tests for the curated Daily Quote catalog, provenance, and metadata."""

from eimir.i18n import catalogs as language_catalogs
from eimir.quotes import catalog
from eimir.quotes.catalog import RightsClassification


def test_catalog_categories_and_sources_are_defined() -> None:
    categories = catalog.get_categories()
    assert len(categories) >= 5
    category_ids = {c.id for c in categories}
    assert "love" in category_ids
    assert "philosophy" in category_ids
    assert "mindfulness" in category_ids

    sources = catalog.get_sources()
    assert len(sources) >= 3
    source_ids = {s.id for s in sources}
    assert "classic_literature" in source_ids
    assert "stoic_philosophy" in source_ids
    assert "poetic_wisdom" in source_ids


def test_all_curated_quotes_have_complete_rights_and_attribution_metadata() -> None:
    quotes = catalog.get_quotes(active_only=False)
    assert quotes
    assert len({quote.id for quote in quotes}) == len(quotes)
    assert len({(quote.locale, quote.text) for quote in quotes}) == len(quotes)

    valid_sources = {s.id for s in catalog.get_sources()}
    valid_categories = {c.id for c in catalog.get_categories()}
    valid_locales = set(language_catalogs())

    for quote in quotes:
        assert quote.id.strip()
        assert quote.text.strip()
        if quote.attribution_required:
            assert quote.author_display.strip()
        else:
            assert quote.author_display == ""
            assert quote.source_display is None
            assert quote.source_id == "poetic_wisdom"
        assert quote.source_id in valid_sources
        assert len(quote.category_ids) >= 1
        for cat_id in quote.category_ids:
            assert cat_id in valid_categories
        assert quote.locale in valid_locales
        assert quote.rights_classification in (
            RightsClassification.PUBLIC_DOMAIN,
            RightsClassification.EDITORIAL_CURATED,
        )
        assert quote.active is True


def test_quote_provenance_and_auditability() -> None:
    """All quotes must include auditable legal provenance (#1151 review blocker)."""
    quotes = catalog.get_quotes(active_only=False)
    for quote in quotes:
        assert quote.original_work.strip(), f"Missing original_work for quote {quote.id}"
        assert quote.source_edition.strip(), f"Missing source_edition for quote {quote.id}"
        assert quote.rights_basis.strip(), f"Missing rights_basis for quote {quote.id}"
        if "Public Domain" in quote.rights_basis:
            if quote.attribution_required:
                assert "p.m.a. > 70 years" in quote.rights_basis
            else:
                assert "traditional" in quote.rights_basis
        else:
            assert quote.rights_classification == RightsClassification.EDITORIAL_CURATED
            assert quote.attribution_required
            if quote.author_display == "eimir.":
                assert "First-party eimir. editorial content" in quote.rights_basis
            else:
                assert quote.source_display
                assert quote.publication_year is not None
                assert "https://" in quote.source_edition

        if (
            quote.translator
            and quote.rights_classification == RightsClassification.EDITORIAL_CURATED
        ):
            assert "CC0 1.0 Universal" in quote.rights_basis
        elif quote.translator:
            assert "died" in quote.translator


def test_unverified_and_copyrighted_authors_are_excluded() -> None:
    """Camus (died 1960) and spurious modern misattributions must not be in catalog."""
    quotes = catalog.get_quotes(active_only=False)
    authors = {q.author_display for q in quotes}
    assert "Albert Camus" not in authors

    # Spurious attributions must not exist in quotes
    texts = [q.text for q in quotes]
    assert not any("In der Ruhe liegt die Kraft" in t for t in texts)
    assert not any("Steinen" in t and "Weg" in t for t in texts)
    assert not any("Chance" in t and "schönste" in t for t in texts)


def test_get_quotes_filters_by_locale() -> None:
    category_ids = {category.id for category in catalog.get_categories()}
    for locale in language_catalogs():
        quotes = catalog.get_quotes(locale=locale)
        assert len(quotes) == 1_000
        assert all(quote.locale == locale for quote in quotes)
        assert {category for quote in quotes for category in quote.category_ids} == category_ids
        assert any(not quote.attribution_required for quote in quotes)

    assert catalog.get_quotes(locale="de-DE") == catalog.get_quotes(locale="de")


def test_sayings_have_equivalent_entries_in_every_app_language() -> None:
    originals = {
        quote.id.removeprefix("saying-de-"): quote
        for quote in catalog.get_quotes(locale="de")
        if quote.id.startswith("saying-de-")
    }
    assert len(originals) == 1_000

    for locale in set(language_catalogs()) - {"de"}:
        prefix = f"saying-{locale}-"
        localized = {
            quote.id.removeprefix(prefix): quote
            for quote in catalog.get_quotes(locale=locale)
            if quote.id.startswith(prefix)
        }
        assert localized.keys() == originals.keys()
        for key, quote in localized.items():
            original = originals[key]
            assert quote.text != original.text
            assert quote.author_display == original.author_display
            assert quote.attribution_required == original.attribution_required
            assert quote.category_ids == original.category_ids
            assert quote.source_id == original.source_id
            assert quote.original_work == original.original_work
            assert quote.source_edition == original.source_edition
            assert RightsClassification.EDITORIAL_CURATED in {
                original.rights_classification,
                quote.rights_classification,
            }
            if quote.attribution_required and quote.author_display != "eimir.":
                assert quote.source_display


def test_catalog_includes_contemporary_sayings_and_quotes_from_both_centuries() -> None:
    for locale in language_catalogs():
        quotes = catalog.get_quotes(locale=locale)
        assert any(quote.author_display == "eimir." for quote in quotes)
        for author, year in (("Virginia Woolf", 1929), ("Jacinda Ardern", 2022)):
            assert any(
                quote.author_display == author
                and quote.publication_year == year
                and quote.attribution_required
                and quote.source_display
                for quote in quotes
            )


def test_get_quote_by_id() -> None:
    quote = catalog.get_quote_by_id("saying-de-rilke-liebes-lied")
    assert quote is not None
    assert quote.author_display == "Rainer Maria Rilke"

    missing = catalog.get_quote_by_id("nonexistent-quote-id")
    assert missing is None
