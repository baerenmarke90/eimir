from __future__ import annotations

import re
from collections.abc import Iterator

import pytest
from eimir_pro.gift_codes.codes import ALPHABET, generate_code, lookup_hash, normalize

from eimir.config import get_settings

_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_PATTERN = re.compile(rf"^EIMIR-[{_CHARS}]{{4}}-[{_CHARS}]{{4}}$")


@pytest.fixture
def fresh_settings() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_alphabet_excludes_ambiguous_characters() -> None:
    assert ALPHABET == _CHARS


def test_generated_codes_match_format_and_are_distinct() -> None:
    codes = [generate_code() for _ in range(1000)]
    assert all(_PATTERN.match(code) for code in codes)
    assert len(set(codes)) == 1000


@pytest.mark.parametrize(
    "raw",
    [
        "eimir-abcd-efgh",
        " ABCD EFGH ",
        "abcdefgh",
        "EIMIR\u2013ABCD\u2013EFGH",
        "EIMIR\u2014ABCD\u2014EFGH",
        "EIMIR-ABCD-EFGH",
    ],
)
def test_normalize_accepts_common_spellings(raw: str) -> None:
    assert normalize(raw) == "EIMIR-ABCD-EFGH"


@pytest.mark.parametrize(
    "raw",
    ["", "ABC", "EIMIR-ABCD-EFG0", "ABCDEFGHJ", "EIMIR-ABCD-EFGHJ", "   ", "\t\n"],
)
def test_normalize_rejects_invalid_input(raw: str) -> None:
    assert normalize(raw) is None


def test_lookup_hash_is_deterministic_hex_and_code_specific() -> None:
    first = lookup_hash("EIMIR-ABCD-EFGH")
    assert first == lookup_hash("EIMIR-ABCD-EFGH")
    assert re.fullmatch(r"[0-9a-f]{64}", first)
    assert first != lookup_hash("EIMIR-ABCD-EFGJ")


def test_lookup_hash_changes_with_signing_secret(
    monkeypatch: pytest.MonkeyPatch, fresh_settings: None
) -> None:
    monkeypatch.setenv("EIMIR_CURSOR_SIGNING_KEY", "secret-one-with-at-least-32-characters")
    get_settings.cache_clear()
    one = lookup_hash("EIMIR-ABCD-EFGH")
    monkeypatch.setenv("EIMIR_CURSOR_SIGNING_KEY", "secret-two-with-at-least-32-characters")
    get_settings.cache_clear()
    two = lookup_hash("EIMIR-ABCD-EFGH")
    assert one != two
