"""Unit tests for the curated Daily Quote catalog, provenance, and metadata."""

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
    assert len(quotes) >= 15

    valid_sources = {s.id for s in catalog.get_sources()}
    valid_categories = {c.id for c in catalog.get_categories()}

    for quote in quotes:
        assert quote.id.strip()
        assert quote.text.strip()
        assert quote.author_display.strip()
        assert quote.source_id in valid_sources
        assert len(quote.category_ids) >= 1
        for cat_id in quote.category_ids:
            assert cat_id in valid_categories
        assert quote.locale in ("de", "en")
        assert quote.rights_classification == RightsClassification.PUBLIC_DOMAIN
        assert quote.attribution_required is True
        assert quote.active is True


def test_quote_provenance_and_auditability() -> None:
    """All quotes must include auditable legal provenance (#1151 review blocker)."""
    quotes = catalog.get_quotes(active_only=False)
    for quote in quotes:
        assert quote.original_work.strip(), f"Missing original_work for quote {quote.id}"
        assert quote.source_edition.strip(), f"Missing source_edition for quote {quote.id}"
        assert quote.rights_basis.strip(), f"Missing rights_basis for quote {quote.id}"
        assert "Public Domain" in quote.rights_basis
        assert "p.m.a. > 70 years" in quote.rights_basis

        # Ancient / foreign translated works must document a deceased translator (>70y p.m.a.)
        if quote.translator is not None:
            assert "died" in quote.translator or "18" in quote.translator


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
    de_quotes = catalog.get_quotes(locale="de")
    assert len(de_quotes) > 0
    assert all(q.locale == "de" for q in de_quotes)

    en_quotes = catalog.get_quotes(locale="en")
    assert len(en_quotes) > 0
    assert all(q.locale == "en" for q in en_quotes)

    # Prefix match "de-DE"
    de_de_quotes = catalog.get_quotes(locale="de-DE")
    assert len(de_de_quotes) == len(de_quotes)


def test_get_quote_by_id() -> None:
    quote = catalog.get_quote_by_id("quote-de-love-001")
    assert quote is not None
    assert quote.author_display == "Wilhelm Busch"

    missing = catalog.get_quote_by_id("nonexistent-quote-id")
    assert missing is None
