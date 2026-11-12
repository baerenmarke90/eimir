"""Unit tests for the M4-A Search request boundary."""

from __future__ import annotations

import pytest

from eimir.core.errors import ValidationError
from eimir.search.service import MAX_QUERY_LENGTH, normalize_query, tagged_query


def test_query_normalization_is_unicode_and_whitespace_stable() -> None:
    assert normalize_query("  Cafe\u0301\t\n  am   See  ") == "Café am See"


@pytest.mark.parametrize("query", ["", " ", "x", "\t x \n"])
def test_query_shorter_than_two_characters_is_rejected(query: str) -> None:
    with pytest.raises(ValidationError) as raised:
        normalize_query(query)

    assert raised.value.code == "SEARCH_QUERY_INVALID"


def test_query_longer_than_two_hundred_characters_is_rejected() -> None:
    with pytest.raises(ValidationError) as raised:
        normalize_query("x" * (MAX_QUERY_LENGTH + 1))

    assert raised.value.code == "SEARCH_QUERY_INVALID"


def test_two_hundred_characters_are_accepted() -> None:
    query = "x" * MAX_QUERY_LENGTH
    assert normalize_query(query) == query


def test_tag_query_matches_unicode_and_casefolding_without_fulltext_parsing() -> None:
    assert tagged_query(normalize_query("tag:Cafe\u0301 am See")) == "café am see"
    assert tagged_query(normalize_query("TAG:Our trip")) == "our trip"
    assert tagged_query(normalize_query("our trip")) is None


@pytest.mark.parametrize("query", ["tag:", "tag:" + "x" * 41])
def test_tag_query_rejects_invalid_values_without_echoing_input(query: str) -> None:
    with pytest.raises(ValidationError) as raised:
        tagged_query(normalize_query(query))
    assert raised.value.code == "SEARCH_QUERY_INVALID"
    assert query not in str(raised.value)
