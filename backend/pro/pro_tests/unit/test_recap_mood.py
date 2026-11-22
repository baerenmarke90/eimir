"""The frozen mood rhythm of a recap: only days both partners marked (plugin code)."""

from datetime import date
from uuid import UUID

from eimir_pro.recap_composition import mood

from eimir.recaps.models import RecapKind

A, B = UUID(int=1), UUID(int=2)


def mutual(day, a="GOOD", b="GOOD"):  # type: ignore[no-untyped-def]
    return {day: {A: a, B: b}}


def test_mood_rhythm_counts_only_days_both_partners_marked():  # type: ignore[no-untyped-def]
    month = date(2026, 10, 1), date(2026, 10, 31)
    days: dict = {}  # type: ignore[type-arg]
    for number in (1, 2, 3, 9, 10):
        days |= mutual(date(2026, 10, number))
    days |= mutual(date(2026, 10, 11), "SAD", "GOOD")
    days[date(2026, 10, 12)] = {A: "GOOD"}  # one-sided: never counted or implied
    result = mood.rhythm(RecapKind.MONTH, *month, days)
    assert result is not None
    assert [(b.index, b.mutual_days, b.good_days) for b in result.buckets] == [
        (1, 3, 3),
        (2, 3, 2),
        (3, 0, 0),
        (4, 0, 0),
        (5, 0, 0),
    ]
    assert result.leading == 1


def test_mood_rhythm_is_omitted_below_the_threshold_and_ties_do_not_lead():  # type: ignore[no-untyped-def]
    month = date(2026, 10, 1), date(2026, 10, 31)
    few = {}
    for number in (1, 2, 3, 4):
        few |= mutual(date(2026, 10, number))
    assert mood.rhythm(RecapKind.MONTH, *month, few) is None
    tie = dict(few)
    for number in (8, 9, 10, 11):
        tie |= mutual(date(2026, 10, number))
    result = mood.rhythm(RecapKind.MONTH, *month, tie)
    assert result is not None and result.leading is None


def test_yearly_mood_needs_mutual_days_in_several_months():  # type: ignore[no-untyped-def]
    year = date(2026, 1, 1), date(2026, 12, 31)
    crowded = {}
    for number in range(1, 22):
        crowded |= mutual(date(2026, 3, number))
    assert mood.rhythm(RecapKind.YEAR, *year, crowded) is None
    spread = {}
    for month in (2, 4, 6, 8):
        for number in range(1, 6):
            spread |= mutual(date(2026, month, number))
    result = mood.rhythm(RecapKind.YEAR, *year, spread)
    assert result is not None and len(result.buckets) == 12
    assert result.leading is None
