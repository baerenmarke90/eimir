"""Pure date-contract tests for the canonical fictional Demo Memory catalog."""

from __future__ import annotations

from datetime import date

import pytest

from eimir.demo.story import MEMORIES, MemoryStory


def _memory(key: str) -> MemoryStory:
    return next(story for story in MEMORIES if story.key == key)


def test_anniversary_seed_uses_calendar_years_including_leap_boundaries() -> None:
    anniversary = _memory("lake-one-year-ago")
    oldest = _memory("first-evening-together")
    assert anniversary.date_at(date(2026, 8, 24)) == date(2025, 8, 24)
    assert oldest.date_at(date(2026, 8, 24)) == date(2023, 8, 24)
    assert anniversary.date_at(date(2028, 3, 1)) == date(2027, 3, 1)
    assert anniversary.date_at(date(2028, 2, 29)) == date(2027, 2, 28)


def test_existing_relative_demo_stories_retain_day_offsets() -> None:
    assert _memory("breakfast-saarbruecken").date_at(date(2026, 8, 24)) == date(
        2026, 2, 9
    )


@pytest.mark.parametrize(
    ("days_ago", "calendar_years_ago"),
    [(None, None), (7, 1), (None, 0)],
)
def test_demo_story_rejects_ambiguous_calendar_offsets(
    days_ago: int | None, calendar_years_ago: int | None
) -> None:
    invalid = MemoryStory(
        key="invalid",
        owner="lea",
        title="Test",
        body="Test",
        days_ago=days_ago,
        calendar_years_ago=calendar_years_ago,
        asset_ids=(),
    )
    with pytest.raises(ValueError):
        invalid.date_at(date(2026, 8, 24))
