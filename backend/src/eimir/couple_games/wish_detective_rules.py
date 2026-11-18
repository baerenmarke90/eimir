"""Clue validation and guess judging for Wish detective, ported from the client.

This mirrors ``validateWishDetectiveClues`` and ``isWishDetectiveGuessCorrect``
in web/src/client/wishDetectiveSession.ts so that the server accepts exactly
what the client accepts. JavaScript semantics are reproduced deliberately:
string lengths count UTF-16 code units, ``trim()`` removes the ECMAScript
white space set, and the letter/mark classes follow the Unicode categories the
``u`` regular expressions use. Shared test vectors live in
web/src/i18n/locales/wishDetectiveRuleVectors.json.
"""

from __future__ import annotations

import unicodedata
from typing import Literal

ClueError = Literal["required", "oneWord", "tooLong", "duplicate", "wishWord"]

MAX_CLUE_LENGTH = 24
_SEPARATORS = frozenset("-'\u2019")
# ECMAScript WhiteSpace and LineTerminator code points (String.prototype.trim).
_JS_WHITESPACE = frozenset(
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007"
    "\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
# Mirrors WISH_DETECTIVE_GERMAN_STOP_WORDS in
# web/src/i18n/locales/wishDetectiveRules.ts (locale data, compared in tests).
GUESS_STOP_WORDS = frozenset(
    (
        "am",
        "an",
        "auf",
        "aus",
        "bei",
        "das",
        "dem",
        "den",
        "der",
        "des",
        "die",
        "ein",
        "eine",
        "einem",
        "einen",
        "einer",
        "eines",
        "f\u00fcr",
        "im",
        "in",
        "ins",
        "mit",
        "oder",
        "und",
        "vom",
        "von",
        "zu",
        "zum",
        "zur",
    )
)


def _utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _js_trim(value: str) -> str:
    start, end = 0, len(value)
    while start < end and value[start] in _JS_WHITESPACE:
        start += 1
    while end > start and value[end - 1] in _JS_WHITESPACE:
        end -= 1
    return value[start:end]


def normalized(value: str) -> str:
    """``value.normalize('NFKC').trim().toLocaleLowerCase('de-DE')``."""
    return _js_trim(unicodedata.normalize("NFKC", value)).lower()


def display_clue(value: str) -> str:
    """The text kept for the partner: the input without surrounding white space."""
    return _js_trim(value)


def _is_letter_or_mark(character: str) -> bool:
    return unicodedata.category(character)[0] in {"L", "M"}


def _word_end(value: str, start: int) -> int | None:
    """End of ``[\\p{L}\\p{M}]+(?:[-'\u2019][\\p{L}\\p{M}]+)?`` matched at ``start``."""
    index = start
    while index < len(value) and _is_letter_or_mark(value[index]):
        index += 1
    if index == start:
        return None
    if (
        index + 1 < len(value)
        and value[index] in _SEPARATORS
        and _is_letter_or_mark(value[index + 1])
    ):
        index += 1
        while index < len(value) and _is_letter_or_mark(value[index]):
            index += 1
    return index


def _is_one_word(value: str) -> bool:
    return _word_end(value, 0) == len(value)


def tokens(value: str) -> list[str]:
    text = normalized(value)
    found: list[str] = []
    index = 0
    while index < len(text):
        end = _word_end(text, index)
        if end is None:
            index += 1
            continue
        found.append(text[index:end])
        index = end
    return found


def _is_wish_word(clue: str, wish_title: str) -> bool:
    for token in tokens(wish_title):
        if clue == token:
            return True
        if _utf16_length(clue) < 4 or _utf16_length(token) < 4:
            continue
        if token in clue or clue in token:
            return True
    return False


def validate_clues(values: list[str], wish_title: str) -> list[ClueError | None]:
    normalized_values = [normalized(value) for value in values]
    counts: dict[str, int] = {}
    for value in normalized_values:
        if value:
            counts[value] = counts.get(value, 0) + 1

    errors: list[ClueError | None] = []
    for value in normalized_values:
        if not value:
            errors.append("required")
        elif _utf16_length(value) > MAX_CLUE_LENGTH:
            errors.append("tooLong")
        elif not _is_one_word(value):
            errors.append("oneWord")
        elif counts.get(value, 0) > 1:
            errors.append("duplicate")
        elif _is_wish_word(value, wish_title):
            errors.append("wishWord")
        else:
            errors.append(None)
    return errors


def is_guess_correct(guess: str, wish_title: str) -> bool:
    normalized_guess = normalized(guess)
    if not normalized_guess:
        return False
    if normalized_guess == normalized(wish_title):
        return True
    target = [token for token in tokens(wish_title) if token not in GUESS_STOP_WORDS]
    if len(target) < 2:
        return False
    guessed = {token for token in tokens(guess) if token not in GUESS_STOP_WORDS}
    return len({token for token in target if token in guessed}) >= 2
