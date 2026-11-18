"""Server clue and guess rules agree with the client on shared test vectors."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from eimir.couple_games import wish_detective_rules as rules

LOCALES = Path(__file__).resolve().parents[3] / "web/src/i18n/locales"
VECTORS = json.loads((LOCALES / "wishDetectiveRuleVectors.json").read_text(encoding="utf-8"))


def test_stop_words_match_the_client_locale_resource() -> None:
    source = (LOCALES / "wishDetectiveRules.ts").read_text(encoding="utf-8")
    client = set(re.findall(r"'([^']+)'", source))
    assert client == rules.GUESS_STOP_WORDS
    assert set(VECTORS["stopWords"]) == rules.GUESS_STOP_WORDS


@pytest.mark.parametrize("case", VECTORS["clues"], ids=lambda case: "|".join(case["clues"]))
def test_clue_validation_matches_the_client(case: dict[str, object]) -> None:
    assert rules.validate_clues(case["clues"], case["wishTitle"]) == case["errors"]  # type: ignore[arg-type]


@pytest.mark.parametrize("case", VECTORS["guesses"], ids=lambda case: case["guess"] or "-")
def test_guess_judging_matches_the_client(case: dict[str, object]) -> None:
    assert rules.is_guess_correct(case["guess"], case["wishTitle"]) is case["correct"]  # type: ignore[arg-type]


def test_lengths_count_utf16_code_units_like_the_client() -> None:
    # Twelve astral letters are 24 UTF-16 code units, thirteen are too long.
    letter = chr(0x20000)
    assert rules.validate_clues([letter * 12, "Mond", "Zelt"], "Garten")[0] is None
    assert rules.validate_clues([letter * 13, "Mond", "Zelt"], "Garten")[0] == "tooLong"


def test_trim_removes_only_ecmascript_white_space() -> None:
    assert rules.normalized(chr(0xFEFF) + " Wolke" + chr(0x2029)) == "wolke"
    # U+001C is white space for Python but not for ECMAScript.
    assert rules.normalized(chr(0x1C) + "Wolke") == chr(0x1C) + "wolke"
