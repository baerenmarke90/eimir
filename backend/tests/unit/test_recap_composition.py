"""Calendar truth, stable diversity and recap presentation."""

from datetime import date
from uuid import UUID

import pytest

from eimir.recaps import presentation
from eimir.recaps.composition import Candidate, period_bounds, select_candidates
from eimir.recaps.models import RecapKind, RecapSourceKind


def test_closed_and_partial_periods_include_leap_day() -> None:
    assert period_bounds(RecapKind.MONTH, 2024, 2, date(2024, 3, 1)) == (
        date(2024, 2, 1),
        date(2024, 2, 29),
        False,
    )
    assert period_bounds(RecapKind.YEAR, 2026, 0, date(2026, 10, 30)) == (
        date(2026, 1, 1),
        date(2026, 10, 30),
        True,
    )
    with pytest.raises(ValueError):
        period_bounds(RecapKind.MONTH, 2026, 11, date(2026, 10, 30))


def test_annual_selection_is_stable_and_distributed_across_the_whole_year() -> None:
    items = [
        Candidate(RecapSourceKind.MEMORY, UUID(int=n + 1), date(2026, n // 10 + 1, n % 10 + 1), 1)
        for n in range(120)
    ]
    first = select_candidates(items, RecapKind.YEAR, "space:year", 0)
    assert first == select_candidates(list(reversed(items)), RecapKind.YEAR, "space:year", 0)
    assert len(first) == 24 and len({v.occurred_on.month for v in first}) == 12
    assert first != select_candidates(items, RecapKind.YEAR, "space:year", 1)


def test_an_alternative_differs_when_distinct_source_kinds_have_no_ties() -> None:
    items = [
        Candidate(kind, UUID(int=index + 1), date(2026, 10, index + 1), 1)
        for index, kind in enumerate([*RecapSourceKind, *RecapSourceKind])
    ]
    baseline = select_candidates(items, RecapKind.MONTH, "space:month", 0)
    alternate = select_candidates(items, RecapKind.MONTH, "space:month", 1)
    assert len(baseline) == len(alternate) == 8
    assert baseline != alternate


def test_quote_is_cut_at_a_word_boundary_and_never_reworded():  # type: ignore[no-untyped-def]
    assert presentation.cut("  Short   note \n here ") == "Short note here"
    long = presentation.cut("alpha " * 40)
    assert long.endswith("\u2026") and len(long) <= 141 and "alpha alpha" in long


def test_a_loved_candidate_is_always_selected_over_equal_peers():  # type: ignore[no-untyped-def]
    peers = [
        Candidate(RecapSourceKind.MEMORY, UUID(int=number), date(2026, 10, number), 1)
        for number in range(1, 11)
    ]
    for index, loved in enumerate(peers):
        pool = [*peers[:index], Candidate(*[*vars_of(loved)], loved=True), *peers[index + 1 :]]
        chosen = select_candidates(pool, RecapKind.MONTH, "seed", 0)
        assert loved.key in {item.key for item in chosen}


def vars_of(item):  # type: ignore[no-untyped-def]
    return item.kind, item.id, item.occurred_on, item.version


def test_excerpts_keep_whole_sentences_and_never_reword() -> None:
    assert presentation.excerpt("  Ein   kurzer Satz. ") == "Ein kurzer Satz."
    text = "Erster Satz mit etwas Länge dabei. " * 3 + "Ein vierter Satz, der zu viel wäre."
    short = presentation.excerpt(text, 80)
    assert short.endswith(" …") and short[:-2] in text and short[:-2].endswith(".")
    long_word_run = "wort " * 60
    cut = presentation.excerpt(long_word_run, 50)
    assert len(cut) <= 52 and cut.endswith(" …") and " ".join(cut[:-2].split()) in long_word_run
