"""Evidence thresholds and reveal safety of the descriptive weekly observations."""

from dataclasses import replace
from datetime import date, timedelta

from eimir.daily_checkins.service import PartnerDimensionProjection, PartnerRevealState
from eimir.daily_insights.insights import (
    DailyInsightDayEntry,
    DailyInsightsResult,
    DailyInsightSummary,
)
from eimir.daily_insights.weekly_patterns import ObservationKind, observations, paired_energy


def projection(weeks: int = 8, *, hidden: bool = False) -> DailyInsightsResult:
    start = date(2026, 8, 3)
    days = []
    for offset in range(weeks * 7):
        day = start + timedelta(days=offset)
        energy = 90 if day.weekday() >= 5 else 40
        days.append(
            DailyInsightDayEntry(
                checked_on=day,
                own_vibe="GOOD",
                own_energy=energy,
                partner_vibe=PartnerDimensionProjection(
                    PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN
                    if hidden
                    else PartnerRevealState.VISIBLE,
                    None if hidden else "GOOD",
                ),
                partner_energy=PartnerDimensionProjection(
                    PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN
                    if hidden
                    else PartnerRevealState.VISIBLE,
                    None if hidden else energy,
                ),
            )
        )
    return DailyInsightsResult(
        start,
        days[-1].checked_on,
        "Europe/Berlin",
        True,
        True,
        days,
        DailyInsightSummary(
            len(days), len(days), 0 if hidden else len(days), 0 if hidden else len(days)
        ),
    )


def test_hidden_partner_values_produce_no_personal_observations():
    data = projection(hidden=True)
    assert observations(data, date(2026, 9, 21)) == []
    # Even a malformed upstream hidden projection must never expose its value.
    day = replace(
        data.days[0],
        partner_energy=PartnerDimensionProjection(
            PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN, 100
        ),
    )
    assert paired_energy(day) is None


def test_group_comparisons_need_multiple_weeks_and_minimum_samples():
    short = projection(2)
    assert ObservationKind.WEEKEND_HIGHER not in {
        fact.kind for fact in observations(short, date(2026, 8, 10))
    }
    long = projection(3)
    facts = observations(long, date(2026, 8, 17))
    assert ObservationKind.WEEKEND_HIGHER in {fact.kind for fact in facts}
    assert all(fact.kind != ObservationKind.WEEKDAY_LOWER for fact in facts)


def test_weekly_rise_must_apply_to_both_people():
    data = projection(2)
    days = [
        replace(
            day,
            own_energy=90 if i >= 7 else 40,
            partner_energy=PartnerDimensionProjection(
                PartnerRevealState.VISIBLE, 40 if i >= 7 else 90
            ),
        )
        for i, day in enumerate(data.days)
    ]
    assert not {ObservationKind.ENERGY_RISING, ObservationKind.ENERGY_FALLING} & {
        fact.kind for fact in observations(replace(data, days=days), date(2026, 8, 10))
    }


def test_missing_own_dimension_cannot_infer_partner_participation():
    data = projection()
    days = [replace(day, own_energy=None, own_vibe=None) for day in data.days]
    assert observations(replace(data, days=days), date(2026, 9, 21)) == []
