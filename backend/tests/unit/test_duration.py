"""Shared time represented as pure calendar arithmetic."""

from __future__ import annotations

from datetime import date

from eimir.relationship.duration import since


class TestCalculation:
    def test_full_years_and_months(self) -> None:
        duration = since(date(2022, 5, 17), date(2026, 8, 23))
        assert duration is not None
        assert (duration.years, duration.months) == (4, 3)

    def test_counts_days(self) -> None:
        duration = since(date(2026, 8, 1), date(2026, 8, 23))
        assert duration is not None
        assert duration.days == 22

    def test_first_day_is_all_zero(self) -> None:
        duration = since(date(2026, 8, 23), date(2026, 8, 23))
        assert duration is not None
        assert (duration.days, duration.years, duration.months) == (0, 0, 0)

    def test_month_not_complete_yet(self) -> None:
        """On the 16th, a month that began on the 17th is not complete yet."""
        duration = since(date(2022, 5, 17), date(2026, 8, 16))
        assert duration is not None
        assert (duration.years, duration.months) == (4, 2)

    def test_year_boundary(self) -> None:
        duration = since(date(2025, 11, 30), date(2026, 1, 15))
        assert duration is not None
        assert (duration.years, duration.months) == (0, 1)

    def test_leap_year(self) -> None:
        duration = since(date(2024, 2, 29), date(2025, 3, 1))
        assert duration is not None
        assert duration.years == 1


class TestFuture:
    def test_future_date_returns_none(self) -> None:
        """Negative values would be worse than none; a UI could render '-3 days together'."""
        assert since(date(2026, 12, 1), date(2026, 8, 23)) is None
