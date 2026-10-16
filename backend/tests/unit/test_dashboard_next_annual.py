"""Pure calendar arithmetic for the Dashboard upcoming annual recurrence.

Issue #699: the M4-C Reminder/Rule runtime and the Dashboard `upcoming`
projection must agree on one canonical annual-recurrence rule. This covers
`_next_annual` directly so the Feb-29 boundary is proven without a database.
"""

from __future__ import annotations

from datetime import date

from eimir.dashboard.service import _next_annual


class TestNextAnnual:
    def test_leap_year_source_in_non_leap_year_resolves_to_february_28(self) -> None:
        """A source date of Feb 29 must recur every year, not only on leap years."""
        assert _next_annual(date(1904, 2, 29), date(2027, 1, 1)) == date(2027, 2, 28)

    def test_leap_year_source_in_leap_year_keeps_february_29(self) -> None:
        assert _next_annual(date(1904, 2, 29), date(2028, 1, 1)) == date(2028, 2, 29)

    def test_day_before_this_years_occurrence_returns_this_year(self) -> None:
        assert _next_annual(date(1990, 6, 15), date(2026, 6, 14)) == date(2026, 6, 15)

    def test_day_of_occurrence_returns_today(self) -> None:
        assert _next_annual(date(1990, 6, 15), date(2026, 6, 15)) == date(2026, 6, 15)

    def test_day_after_this_years_occurrence_rolls_to_next_year(self) -> None:
        assert _next_annual(date(1990, 6, 15), date(2026, 6, 16)) == date(2027, 6, 15)

    def test_day_after_february_28_in_non_leap_year_rolls_to_next_leap_or_non_leap_year(
        self,
    ) -> None:
        """Today just past the resolved Feb-28 fallback still rolls forward correctly."""
        assert _next_annual(date(1904, 2, 29), date(2027, 3, 1)) == date(2028, 2, 29)
