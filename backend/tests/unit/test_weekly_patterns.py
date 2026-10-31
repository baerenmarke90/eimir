"""Evidence thresholds, reveal safety and constrained local-model selection."""

import json
from dataclasses import replace
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from eimir.daily_checkins import weekly_review
from eimir.daily_checkins.insights import (
    DailyInsightDayEntry,
    DailyInsightsResult,
    DailyInsightSummary,
)
from eimir.daily_checkins.models import RecommendationKey
from eimir.daily_checkins.service import PartnerDimensionProjection, PartnerRevealState
from eimir.daily_checkins.weekly_patterns import ObservationKind, observations, paired_energy


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


def prepared() -> weekly_review.Preview:
    data = projection()
    return weekly_review.Preview(
        date(2026, 9, 21),
        date(2026, 9, 27),
        data.start_date,
        data.end_date,
        "a" * 64,
        observations(data, date(2026, 9, 21)),
        list(RecommendationKey),
        [],
        False,
    )


@pytest.mark.parametrize(
    "result",
    [
        '{"observation_keys":["invented"],"recommendation_keys":["quiet_time"]}',
        '{"observation_keys":["joint_days","joint_days"],"recommendation_keys":["quiet_time"]}',
        '{"observation_keys":["joint_days"],"recommendation_keys":["diagnosis"]}',
        (
            '{"observation_keys":["joint_days"],"recommendation_keys":["quiet_time"],'
            '"prose":"Unverified relationship claim"}'
        ),
        "not json",
    ],
)
def test_model_cannot_add_claims_or_unknown_identifiers(monkeypatch, result):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        weekly_review,
        "get_settings",
        lambda: SimpleNamespace(recap_ai_url="http://local-ai", recap_ai_model="existing-model"),
    )
    monkeypatch.setattr(
        weekly_review, "query_structured", lambda *args, **kwargs: {"message": {"content": result}}
    )
    chosen, ai = weekly_review.choose(prepared())
    assert not ai
    assert set(chosen.observation_keys) <= {fact.key for fact in prepared().observations}
    assert set(chosen.recommendation_keys) <= set(RecommendationKey)


def test_model_selects_only_from_bounded_aggregate_packet(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        weekly_review,
        "get_settings",
        lambda: SimpleNamespace(recap_ai_url="http://local-ai", recap_ai_model="existing-model"),
    )
    packets = []

    def query(body, **kwargs):  # type: ignore[no-untyped-def]
        packets.append(body)
        return {
            "message": {
                "content": (
                    '{"observation_keys":["weekend_higher"],"recommendation_keys":["small_plan"]}'
                )
            }
        }

    monkeypatch.setattr(weekly_review, "query_structured", query)
    chosen, ai = weekly_review.choose(prepared())
    assert ai and chosen.observation_keys == ["weekend_higher"]
    packet = json.loads(packets[0]["messages"][1]["content"])
    assert set(packet) == {"observations", "recommendations"}
    assert all(
        set(item) == {"key", "kind", "sample_count", "value", "weekday"}
        for item in packet["observations"]
    )
    packets.clear()
    _, ai = weekly_review.choose(replace(prepared(), observations=[], general=True))
    assert not ai and not packets
