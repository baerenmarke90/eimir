"""Product-policy boundaries with an injected clock, not click-volume heuristics."""

from datetime import UTC, datetime, time, timedelta

import pytest

from eimir.engagement import gentle_policy as policy
from eimir.engagement.quiet_hours import QuietHoursWindow

NOW = datetime(2026, 11, 3, 17, tzinfo=UTC)


def _days(gaps: list[int], *, hour: int = 18) -> list[policy.DayObservation]:
    observations: list[policy.DayObservation] = []
    at = NOW.replace(hour=hour)
    for gap in gaps:
        at += timedelta(days=gap)
        observations = policy.observe(observations, at=at, timezone="UTC")
    return observations


def test_repeated_use_on_one_day_cannot_manufacture_cadence_or_time_confidence() -> None:
    observations: list[policy.DayObservation] = []
    for minute in range(60):
        observations = policy.observe(
            observations,
            at=NOW + timedelta(minutes=minute),
            timezone="Europe/Berlin",
            memory_read=True,
        )
    assert len(observations) == 1
    assert policy.learn(observations) == policy.Rhythm(None, ())
    assert observations[0]["memory_read"] is True


def test_three_distinct_days_use_median_positive_calendar_gaps() -> None:
    observations = _days([0, 2, 8, 3])
    assert policy.learn(observations) == policy.Rhythm(3.0, (6,))
    assert policy.learn(observations[:2]) == policy.Rhythm(None, ())


def test_window_confidence_requires_three_days_independently_of_cadence() -> None:
    observations: list[policy.DayObservation] = []
    for day, hour in [(0, 9), (1, 12), (2, 18)]:
        observations = policy.observe(
            observations, at=NOW.replace(hour=hour) + timedelta(days=day), timezone="UTC"
        )
    rhythm = policy.learn(observations)
    assert rhythm.interval_days == 1
    assert rhythm.windows == ()


def test_equal_window_support_prefers_latest_actual_qualifying_use() -> None:
    observations: list[policy.DayObservation] = []
    for day in range(3):
        for hour in (9, 18):
            observations = policy.observe(
                observations, at=NOW.replace(hour=hour) + timedelta(days=day), timezone="UTC"
            )
    assert policy.learn(observations).windows == (6, 3)


def test_observations_are_bounded_and_old_days_do_not_rebuild_fresh_confidence() -> None:
    observations = _days([0] + [1] * 20)
    assert len(observations) == policy.MAX_ACTIVE_DAYS
    fresh = policy.observe(observations, at=NOW + timedelta(days=111), timezone="UTC")
    assert len(fresh) == 1
    assert policy.learn(fresh).interval_days is None


@pytest.mark.parametrize(("interval", "delay"), [(1, 7), (3.5, 7), (7, 14), (30, 60)])
def test_initial_inactivity_is_a_ceiling_not_a_weekly_obligation(
    interval: float, delay: int
) -> None:
    assert policy.eligible_after(
        last_use_at=NOW, interval_days=interval, attempts_since_use=0, last_attempt_at=None, at=NOW
    ) == NOW + timedelta(days=delay)


@pytest.mark.parametrize(("attempts", "delay"), [(1, 14), (2, 28)])
def test_backoff_waits_fourteen_then_twenty_eight_days(attempts: int, delay: int) -> None:
    attempt = NOW + timedelta(days=14)
    assert policy.eligible_after(
        last_use_at=NOW,
        interval_days=1,
        attempts_since_use=attempts,
        last_attempt_at=attempt,
        at=attempt,
    ) == attempt + timedelta(days=delay)


def test_third_attempt_pauses_and_new_own_use_does_not_authorize_immediate_welcome() -> None:
    assert (
        policy.eligible_after(
            last_use_at=NOW,
            interval_days=1,
            attempts_since_use=3,
            last_attempt_at=NOW,
            at=NOW + timedelta(days=80),
        )
        is None
    )
    returned = NOW + timedelta(days=81)
    assert policy.eligible_after(
        last_use_at=returned,
        interval_days=1,
        attempts_since_use=0,
        last_attempt_at=NOW,
        at=returned,
    ) == returned + timedelta(days=7)


def test_rolling_budget_survives_return_and_does_not_depend_on_local_dates() -> None:
    attempt = NOW + timedelta(days=10)
    assert policy.eligible_after(
        last_use_at=NOW, interval_days=1, attempts_since_use=0, last_attempt_at=attempt, at=attempt
    ) == attempt + timedelta(days=7)


@pytest.mark.parametrize("attempts", [0, 1, 2])
def test_retention_is_a_hard_stop_even_before_three_attempts(attempts: int) -> None:
    assert (
        policy.eligible_after(
            last_use_at=NOW,
            interval_days=30,
            attempts_since_use=attempts,
            last_attempt_at=None,
            at=NOW + policy.PROFILE_RETENTION,
        )
        is None
    )


def test_cold_start_and_missing_last_use_never_fall_back_to_generic_timing() -> None:
    assert (
        policy.eligible_after(
            last_use_at=NOW, interval_days=None, attempts_since_use=0, last_attempt_at=None, at=NOW
        )
        is None
    )
    assert (
        policy.eligible_after(
            last_use_at=None, interval_days=1, attempts_since_use=0, last_attempt_at=None, at=NOW
        )
        is None
    )
    assert policy.delivery_window(at=NOW, timezone="UTC", windows=(), quiet_hours=None) is None


def test_quiet_hours_filter_out_fully_blocked_supported_windows() -> None:
    quiet = QuietHoursWindow(time(21), time(9))
    at = NOW.replace(hour=10)
    assert policy.delivery_window(at=at, timezone="UTC", windows=(0, 3), quiet_hours=quiet) == (
        at.replace(hour=9),
        at.replace(hour=12),
    )
    assert (
        policy.delivery_window(
            at=NOW.replace(hour=22), timezone="UTC", windows=(7,), quiet_hours=quiet
        )
        is None
    )


def test_explicit_quiet_hours_off_honors_learned_shift_worker_hours() -> None:
    at = NOW.replace(hour=1)
    assert policy.delivery_window(at=at, timezone="UTC", windows=(0,), quiet_hours=None) == (
        at.replace(hour=0),
        at.replace(hour=3),
    )


def test_weaker_earlier_window_does_not_preempt_preferred_evening_window() -> None:
    assert (
        policy.delivery_window(
            at=NOW.replace(hour=10), timezone="UTC", windows=(6, 3), quiet_hours=None
        )
        is None
    )
    assert (
        policy.delivery_window(
            at=NOW.replace(hour=19), timezone="UTC", windows=(6, 3), quiet_hours=None
        )
        is not None
    )


@pytest.mark.parametrize(
    ("at", "hours"),
    [
        (datetime(2026, 3, 29, 0, 30, tzinfo=UTC), 2),
        (datetime(2026, 10, 25, 1, 30, tzinfo=UTC), 4),
    ],
)
def test_dst_window_uses_existing_missing_and_repeated_hour_contract(
    at: datetime, hours: int
) -> None:
    window = policy.delivery_window(at=at, timezone="Europe/Berlin", windows=(0,), quiet_hours=None)
    assert window is not None
    assert window[0] <= at < window[1]
    assert window[1] - window[0] == timedelta(hours=hours)
