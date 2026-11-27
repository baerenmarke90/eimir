from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from eimir_pro.gift_codes.codes import (
    ALPHABET,
    add_months,
    generate_code,
    lookup_hash,
    normalize,
)

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
    monkeypatch.setenv("EIMIR_CURSOR_SIGNING_KEY", "a" * 48)
    get_settings.cache_clear()
    one = lookup_hash("EIMIR-ABCD-EFGH")
    monkeypatch.setenv("EIMIR_CURSOR_SIGNING_KEY", "b" * 48)
    get_settings.cache_clear()
    two = lookup_hash("EIMIR-ABCD-EFGH")
    assert one != two


@pytest.mark.parametrize(
    ("start", "months", "expected"),
    [
        # The day clamps to the target month's length.
        (datetime(2027, 1, 31, 9, 30, tzinfo=UTC), 1, datetime(2027, 2, 28, 9, 30, tzinfo=UTC)),
        # A leap year has a 29 February.
        (datetime(2028, 1, 31, 9, 30, tzinfo=UTC), 1, datetime(2028, 2, 29, 9, 30, tzinfo=UTC)),
        (datetime(2026, 11, 26, 18, 0, tzinfo=UTC), 3, datetime(2027, 2, 26, 18, 0, tzinfo=UTC)),
        (
            datetime(2026, 12, 31, 23, 59, tzinfo=UTC),
            12,
            datetime(2027, 12, 31, 23, 59, tzinfo=UTC),
        ),
        (datetime(2026, 8, 31, 0, 0, tzinfo=UTC), 6, datetime(2027, 2, 28, 0, 0, tzinfo=UTC)),
        (datetime(2027, 3, 31, 12, 0, tzinfo=UTC), -1, datetime(2027, 2, 28, 12, 0, tzinfo=UTC)),
        (datetime(2027, 1, 15, 12, 0, tzinfo=UTC), -24, datetime(2025, 1, 15, 12, 0, tzinfo=UTC)),
    ],
)
def test_add_months_keeps_the_time_and_clamps_the_day(
    start: datetime, months: int, expected: datetime
) -> None:
    assert add_months(start, months) == expected


def test_add_months_adds_to_the_utc_timestamp_across_a_dst_change() -> None:
    # 22 March is winter time in Berlin, 22 June summer time.
    local = datetime(2026, 3, 22, 13, 0, tzinfo=ZoneInfo("Europe/Berlin"))
    result = add_months(local, 3)
    assert result == datetime(2026, 6, 22, 12, 0, tzinfo=UTC)
    assert result.tzinfo is UTC
