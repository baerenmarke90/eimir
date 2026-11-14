"""Pure helpers behind the rediscovery wording context (#1790 C2)."""

from __future__ import annotations

import pytest

from eimir.story.rediscovery import (
    EXCERPT_MAX_CHARS,
    EXCERPT_MAX_WORDS,
    PartOfDay,
    first_words,
    part_of_day,
)


@pytest.mark.parametrize(
    ("hour", "expected"),
    [
        (5, PartOfDay.MORNING),
        (11, PartOfDay.MORNING),
        (12, PartOfDay.AFTERNOON),
        (16, PartOfDay.AFTERNOON),
        (17, PartOfDay.EVENING),
        (21, PartOfDay.EVENING),
        (22, PartOfDay.NIGHT),
        (0, PartOfDay.NIGHT),
        (4, PartOfDay.NIGHT),
    ],
)
def test_part_of_day_buckets_cover_the_whole_day(hour: int, expected: PartOfDay) -> None:
    assert part_of_day(hour) is expected


def test_first_words_keeps_short_text_whole() -> None:
    assert first_words("  Wir sind\n einfach   losgefahren ") == (
        "Wir sind einfach losgefahren",
        False,
    )


def test_first_words_cuts_after_the_word_limit() -> None:
    text = " ".join(f"w{index}" for index in range(EXCERPT_MAX_WORDS + 4))
    excerpt, truncated = first_words(text)
    assert truncated is True
    assert excerpt is not None
    assert len(excerpt.split()) == EXCERPT_MAX_WORDS


def test_first_words_respects_the_character_bound() -> None:
    text = " ".join(["wort" * 6] * EXCERPT_MAX_WORDS)
    excerpt, truncated = first_words(text)
    assert truncated is True
    assert excerpt is not None
    assert len(excerpt) <= EXCERPT_MAX_CHARS


def test_first_words_cuts_one_overlong_token() -> None:
    excerpt, truncated = first_words("x" * (EXCERPT_MAX_CHARS + 20))
    assert truncated is True
    assert excerpt == "x" * EXCERPT_MAX_CHARS


@pytest.mark.parametrize("text", [None, "", "   \n\t "])
def test_first_words_is_empty_for_blank_bodies(text: str | None) -> None:
    assert first_words(text) == (None, False)
