"""Tests for the public-domain Daily Quote catalog and the script that maintains it."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from eimir_pro.quotes import catalog
from eimir_pro.quotes.catalog import RightsClassification
from pro_scripts import public_domain_quotes as script

CATEGORY_IDS = script.CATEGORY_IDS


def _served() -> dict[str, Any]:
    return json.loads(script.CATALOG_PATH.read_text(encoding="utf-8"))


def _candidate(key: str = "tester-01", **overrides: Any) -> dict[str, Any]:
    candidate: dict[str, Any] = {
        "key": key,
        "lang": "de",
        "author": "Test Author",
        "author_death_year": 1857,
        "work": "Test Work",
        "work_year": 1835,
        "source_url": "https://example.org/work",
        "source_edition": "Transcription of the 1835 edition",
        "text": "Schläft ein Lied in allen Dingen,",
        "translation": "A song sleeps in all things,",
        "category": "nature",
    }
    candidate.update(overrides)
    return candidate


# --- the served catalog -------------------------------------------------------------------


def test_served_file_is_canonically_formatted() -> None:
    """Merging and dumping again must reproduce the committed file byte for byte."""
    text = script.CATALOG_PATH.read_text(encoding="utf-8")
    assert script.dump_catalog(json.loads(text)) == text


def test_public_domain_entries_stay_inside_the_rights_window() -> None:
    data = _served()
    assert data["entries"]
    for entry in data["entries"]:
        collection = data["collections"][entry["collection"]]
        assert collection["author_death_year"] <= script.LAST_ALLOWED_DEATH_YEAR, entry["id"]
        assert entry["publication_year"] <= script.LAST_ALLOWED_PUBLICATION_YEAR, entry["id"]
        assert entry["source_url"].startswith("https://"), entry["id"]
        assert entry["source_edition"].strip(), entry["id"]
        assert str(collection["author_death_year"]) in collection["rights_basis"]


def test_every_public_domain_entry_has_one_category_and_both_languages() -> None:
    for entry in _served()["entries"]:
        assert entry["id"].startswith("pd-")
        assert len(entry["category_ids"]) == 1
        assert entry["category_ids"][0] in CATEGORY_IDS
        assert set(entry["texts"]) == {"de", "en"}
        for text in entry["texts"].values():
            assert text.strip() == text
            assert 12 <= len(text) <= 320, entry["id"]
            assert "  " not in text


def test_public_domain_quotes_are_served_with_attribution_and_labelled_translations() -> None:
    data = _served()
    for entry in data["entries"]:
        collection = data["collections"][entry["collection"]]
        original_locale = collection["original_locale"]
        other = "en" if original_locale == "de" else "de"

        original = catalog.get_quote_by_id(f"saying-{original_locale}-{entry['id']}")
        assert original is not None
        assert original.author_display == collection["author_display"]
        assert original.attribution_required is True
        assert original.rights_classification is RightsClassification.PUBLIC_DOMAIN
        assert original.translator is None
        assert original.source_display == entry["source_display"]
        assert original.publication_year == entry["publication_year"]
        assert entry["source_url"] in original.source_edition
        assert original.source_id in {source.id for source in catalog.get_sources()}

        translation = catalog.get_quote_by_id(f"saying-{other}-{entry['id']}")
        assert translation is not None
        assert translation.author_display == collection["author_display"]
        assert translation.attribution_required is True
        assert translation.rights_classification is RightsClassification.EDITORIAL_CURATED
        assert translation.translator
        assert "CC0 1.0 Universal" in translation.rights_basis
        assert translation.source_display == (
            f"{entry['source_display']} · {data['translations'][other]['source_display']}"
        )
        assert translation.category_ids == original.category_ids
        assert translation.text != original.text


def test_every_category_has_public_domain_quotations_in_both_languages() -> None:
    for locale in ("de", "en"):
        per_category = dict.fromkeys(CATEGORY_IDS, 0)
        for quote in catalog.get_quotes(locale=locale):
            if quote.attribution_required:
                per_category[quote.category_ids[0]] += 1
        assert min(per_category.values()) >= 10, per_category


def test_public_domain_texts_do_not_repeat_each_other_or_the_ai_sayings() -> None:
    data = _served()
    ai_texts = {
        locale: [
            quote.text
            for quote in catalog.get_quotes(locale=locale, active_only=False)
            if not quote.attribution_required
        ]
        for locale in ("de", "en")
    }
    entries = data["entries"]
    for locale in ("de", "en"):
        keys = [script.comparison_key(entry["texts"][locale]) for entry in entries]
        assert len(set(keys)) == len(keys)
        ai_keys = {script.comparison_key(text) for text in ai_texts[locale]}
        assert not ai_keys & set(keys)


def test_authors_are_spelled_consistently() -> None:
    names = [collection["author_display"] for collection in _served()["collections"].values()]
    assert len(set(names)) == len(names)
    for name in names:
        assert name == " ".join(name.split())


# --- the maintenance script -----------------------------------------------------------------


def test_merge_is_idempotent() -> None:
    target = script.empty_catalog()
    first = script.merge_candidates(target, [_candidate()])
    snapshot = copy.deepcopy(target)
    second = script.merge_candidates(target, [_candidate()])
    assert first == {"added": 1, "unchanged": 0, "updated": 0}
    assert second == {"added": 0, "unchanged": 1, "updated": 0}
    assert target == snapshot
    assert script.dump_catalog(target) == script.dump_catalog(snapshot)


def test_merge_builds_original_and_translation_texts() -> None:
    target = script.empty_catalog()
    script.merge_candidates(target, [_candidate(), _candidate("other-01", lang="en", text="Hello there, friend.", translation="Hallo, Freund.", author="Other")])
    german, english = target["entries"]
    assert german["texts"] == {
        "de": "Schläft ein Lied in allen Dingen,",
        "en": "A song sleeps in all things,",
    }
    assert english["texts"] == {"de": "Hallo, Freund.", "en": "Hello there, friend."}
    assert target["collections"]["other"]["original_locale"] == "en"
    assert target["collections"]["tester"]["original_locale"] == "de"


def test_merge_refuses_changed_content_unless_updating() -> None:
    target = script.empty_catalog()
    script.merge_candidates(target, [_candidate()])
    changed = _candidate(work="Another Work")
    with pytest.raises(script.CatalogError, match="different content"):
        script.merge_candidates(target, [changed])
    assert script.merge_candidates(target, [changed], update=True)["updated"] == 1
    assert target["entries"][0]["work"] == "Another Work"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"author_death_year": 1956}, "died after"),
        ({"work_year": 1931}, "first published after"),
        ({"category": "politics"}, "unknown category"),
        ({"lang": "fr"}, "unsupported original language"),
        ({"source_url": "http://example.org/work"}, "https URL"),
        ({"translation": "Schläft ein Lied in allen Dingen,"}, "translation equals"),
        ({"text": ""}, "missing"),
    ],
)
def test_merge_refuses_candidates_that_break_the_rules(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(script.CatalogError, match=message):
        script.merge_candidates(script.empty_catalog(), [_candidate(**overrides)])


def test_merge_refuses_exact_and_near_duplicates() -> None:
    target = script.empty_catalog()
    script.merge_candidates(target, [_candidate()])
    exact = _candidate("tester-02", text="SCHLÄFT ein Lied in allen Dingen", translation="Different words entirely.")
    with pytest.raises(script.CatalogError, match="near duplicate"):
        script.merge_candidates(target, [exact])
    near = _candidate("tester-03", text="Schläft ein Lied in allen Dingen.", translation="Other.")
    with pytest.raises(script.CatalogError, match="near duplicate"):
        script.merge_candidates(target, [near])
    clear = _candidate("tester-04", text="Die Welt wird schöner mit jedem Tag,", translation="The world grows lovelier every day,")
    assert script.merge_candidates(target, [clear])["added"] == 1


def test_merge_refuses_texts_already_served_elsewhere() -> None:
    served = {"de": {"Schläft ein Lied in allen Dingen"}, "en": set()}
    with pytest.raises(script.CatalogError, match="already served"):
        script.merge_candidates(script.empty_catalog(), [_candidate()], served_texts=served)


def test_merge_refuses_a_collection_that_changes_its_rights_data() -> None:
    target = script.empty_catalog()
    script.merge_candidates(target, [_candidate()])
    with pytest.raises(script.CatalogError, match="collection"):
        script.merge_candidates(target, [_candidate("tester-02", author_death_year=1858, text="Anderer Text, ganz anders.", translation="Other text entirely.")])


def test_source_check_ignores_layout_and_final_punctuation_only() -> None:
    source = "Schläft ein Lied in allen\nDingen,\n  Die da träumen fort und fort,\n"
    assert script.text_in_source("Schläft ein Lied in allen Dingen.", source)
    assert script.text_in_source("schläft ein lied in allen dingen,\nDie da träumen fort und fort.", source)
    assert not script.text_in_source("Schläft ein Lied in allen Dingen und Sachen.", source)
    assert script.text_in_source("It’s “quoted” – and dashed", "It's \"quoted\" - and dashed")


def test_gutenberg_urls_map_to_the_plain_text_mirror() -> None:
    urls = script.download_urls("https://www.gutenberg.org/ebooks/1342")
    assert urls[0] == "https://gutenberg.pglaf.org/1/3/4/1342/1342-0.txt"
    assert script.download_urls("https://de.wikisource.org/wiki/Mondnacht") == [
        "https://de.wikisource.org/wiki/Mondnacht"
    ]
