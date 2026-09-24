"""Recipient-local quiet-hours boundaries, including daylight-saving changes."""

from __future__ import annotations

from datetime import UTC, datetime, time

import pytest

from eimir.engagement.quiet_hours import QuietHoursWindow


@pytest.mark.parametrize(
    ("at", "expected"),
    [
        (datetime(2026, 1, 4, 19, 59, tzinfo=UTC), None),
        (datetime(2026, 1, 4, 20, 0, tzinfo=UTC), datetime(2026, 1, 5, 6, tzinfo=UTC)),
        (datetime(2026, 1, 5, 5, 59, tzinfo=UTC), datetime(2026, 1, 5, 6, tzinfo=UTC)),
        (datetime(2026, 1, 5, 6, 0, tzinfo=UTC), None),
    ],
)
def test_overnight_window_has_half_open_boundaries(at: datetime, expected: datetime | None) -> None:
    window = QuietHoursWindow(time(21), time(7))
    assert window.release_at(at, "Europe/Berlin") == expected


def test_same_day_window_uses_local_day() -> None:
    window = QuietHoursWindow(time(9), time(17))
    at = datetime(2026, 8, 24, 0, 30, tzinfo=UTC)  # 09:30 in Tokyo
    assert window.release_at(at, "Asia/Tokyo") == datetime(2026, 8, 24, 8, tzinfo=UTC)
    assert window.release_at(at, "Europe/Berlin") is None


def test_spring_gap_shifts_nonexistent_start_forward_by_gap() -> None:
    window = QuietHoursWindow(time(2, 30), time(4))
    assert window.release_at(datetime(2026, 3, 29, 1, 15, tzinfo=UTC), "Europe/Berlin") is None
    assert window.release_at(datetime(2026, 3, 29, 1, 30, tzinfo=UTC), "Europe/Berlin") == datetime(
        2026, 3, 29, 2, tzinfo=UTC
    )


def test_spring_gap_shifts_nonexistent_end_forward_by_gap() -> None:
    window = QuietHoursWindow(time(1), time(2, 30))
    assert window.release_at(datetime(2026, 3, 29, 1, 15, tzinfo=UTC), "Europe/Berlin") == datetime(
        2026, 3, 29, 1, 30, tzinfo=UTC
    )
    assert window.release_at(datetime(2026, 3, 29, 1, 30, tzinfo=UTC), "Europe/Berlin") is None


def test_autumn_overlap_starts_early_and_ends_late() -> None:
    window = QuietHoursWindow(time(2, 30), time(2, 45))
    for at in (
        datetime(2026, 10, 25, 0, 30, tzinfo=UTC),
        datetime(2026, 10, 25, 1, 30, tzinfo=UTC),
    ):
        assert window.release_at(at, "Europe/Berlin") == datetime(2026, 10, 25, 1, 45, tzinfo=UTC)
    assert window.release_at(datetime(2026, 10, 25, 1, 45, tzinfo=UTC), "Europe/Berlin") is None


def test_autumn_overlap_can_extend_overnight_end() -> None:
    window = QuietHoursWindow(time(22), time(2, 30))
    assert window.release_at(
        datetime(2026, 10, 25, 1, 15, tzinfo=UTC), "Europe/Berlin"
    ) == datetime(2026, 10, 25, 1, 30, tzinfo=UTC)


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (time(21), time(21)),
        (time(21, 0, 1), time(7)),
        (time(21), time(7, 0, 0, 1)),
        (time(21, tzinfo=UTC), time(7)),
    ],
)
def test_invalid_boundaries_are_rejected(start: time, end: time) -> None:
    with pytest.raises(ValueError):
        QuietHoursWindow(start, end)
