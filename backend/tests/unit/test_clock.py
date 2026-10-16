"""Time conventions."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from eimir.core.clock import (
    annual_occurrence,
    ensure_utc,
    now,
    resolve_zone,
    today_in,
    today_utc,
)


def today_utc_at(timestamp: datetime) -> date:
    """Return the UTC day for a fixed timestamp, used as the comparison baseline."""
    return timestamp.date()


class TestNow:
    def test_is_timezone_aware(self) -> None:
        """This project must never produce a naive timestamp."""
        assert now().tzinfo is not None

    def test_is_in_utc(self) -> None:
        assert now().utcoffset() == timedelta(0)


class TestEnsureUtc:
    def test_converts_another_zone(self) -> None:
        berlin = timezone(timedelta(hours=2))
        value = datetime(2026, 8, 23, 14, 12, tzinfo=berlin)
        assert ensure_utc(value) == datetime(2026, 8, 23, 12, 12, tzinfo=UTC)

    def test_interprets_naive_value_as_utc(self) -> None:
        value = datetime(2026, 8, 23, 12, 12)
        assert ensure_utc(value) == datetime(2026, 8, 23, 12, 12, tzinfo=UTC)

    def test_leaves_utc_unchanged(self) -> None:
        value = datetime(2026, 8, 23, 12, 12, tzinfo=UTC)
        assert ensure_utc(value) == value


class TestTodayUtc:
    def test_is_date_without_time(self) -> None:
        today = today_utc()
        assert not isinstance(today, datetime)
        assert today == now().date()


class TestResolveZone:
    def test_resolves_named_zone(self) -> None:
        assert resolve_zone("Europe/Berlin").key == "Europe/Berlin"

    @pytest.mark.parametrize(
        "name",
        ["", "Nicht/Echt", "../../etc/localtime", "UTC+2", "Europe/Bärlin"],
    )
    def test_unknown_zone_falls_back_to_utc(self, name: str) -> None:
        """`Account.timezone` is a free-text field.

        An unusable value must not turn a read request into a 500.
        """
        assert resolve_zone(name).key == "UTC"


class TestTodayIn:
    def test_east_of_utc_is_already_next_day(self) -> None:
        """In Auckland it is already the next day while UTC is not."""
        timestamp = datetime(2026, 8, 24, 12, 30, tzinfo=UTC)
        assert today_in("Pacific/Auckland", at=timestamp) == date(2026, 8, 25)
        assert today_utc_at(timestamp) == date(2026, 8, 24)

    def test_west_of_utc_is_still_previous_day(self) -> None:
        """In Los Angeles it is still the previous day while UTC is already next day."""
        timestamp = datetime(2026, 8, 25, 5, 0, tzinfo=UTC)
        assert today_in("America/Los_Angeles", at=timestamp) == date(2026, 8, 24)
        assert today_utc_at(timestamp) == date(2026, 8, 25)

    def test_same_timestamp_yields_two_different_days(self) -> None:
        timestamp = datetime(2026, 8, 24, 12, 30, tzinfo=UTC)
        assert today_in("Pacific/Auckland", at=timestamp) != today_in(
            "America/Los_Angeles", at=timestamp
        )

    def test_daylight_saving_time_is_respected(self) -> None:
        """Berlin is UTC+2 in August; at 22:30 UTC it is already the next day."""
        assert today_in("Europe/Berlin", at=datetime(2026, 8, 24, 22, 30, tzinfo=UTC)) == date(
            2026, 8, 25
        )

    def test_standard_time_moves_boundary(self) -> None:
        """Berlin is UTC+1 in December; at 22:30 UTC it is still the same day."""
        assert today_in("Europe/Berlin", at=datetime(2026, 12, 24, 22, 30, tzinfo=UTC)) == date(
            2026, 12, 24
        )

    def test_naive_timestamp_is_interpreted_as_utc(self) -> None:
        assert today_in("Pacific/Auckland", at=datetime(2026, 8, 24, 12, 30)) == date(2026, 8, 25)

    def test_without_timestamp_uses_current_time(self) -> None:
        assert today_in("UTC") == now().date()

    def test_unknown_zone_yields_utc_day(self) -> None:
        timestamp = datetime(2026, 8, 24, 12, 30, tzinfo=UTC)
        assert today_in("Nicht/Echt", at=timestamp) == date(2026, 8, 24)


class TestAnnualOccurrence:
    def test_leap_year_keeps_february_29(self) -> None:
        assert annual_occurrence(2028, 2, 29) == date(2028, 2, 29)

    def test_non_leap_year_resolves_to_february_28(self) -> None:
        assert annual_occurrence(2027, 2, 29) == date(2027, 2, 28)

    def test_century_non_leap_year_resolves_to_february_28(self) -> None:
        """1900 and 2100 are non-leap despite being divisible by 4."""
        assert annual_occurrence(2100, 2, 29) == date(2100, 2, 28)

    def test_regular_month_and_day_pass_through(self) -> None:
        assert annual_occurrence(2026, 6, 15) == date(2026, 6, 15)

    def test_other_invalid_dates_still_raise(self) -> None:
        """Only February 29 is special-cased; April 31 is simply invalid."""
        with pytest.raises(ValueError):
            annual_occurrence(2026, 4, 31)
