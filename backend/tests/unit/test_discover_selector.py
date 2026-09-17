"""Pure deterministic-selector tests for the Discover read model."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from eimir.authorization import AuthorizationContext
from eimir.story.discover_service import (
    Candidate,
    CandidateIntent,
    StoryRef,
    select_candidates,
)
from eimir.story.service import StoryKind

SPACE_ID = UUID("00000000-0000-7000-8000-000000000001")
ACCOUNT_ID = UUID("00000000-0000-7000-8000-000000000002")
CONTEXT = AuthorizationContext(account_id=ACCOUNT_ID, space_id=SPACE_ID)
TODAY = date(2026, 9, 17)


def candidate(
    number: int,
    *,
    kind: StoryKind = StoryKind.MEMORY,
    occurred_on: date = date(2020, 1, 1),
    intent: CandidateIntent = CandidateIntent.FALLBACK,
    affinity_score: int | None = None,
) -> Candidate:
    return Candidate(
        ref=StoryRef(
            kind=kind,
            item_id=UUID(f"00000000-0000-7000-8000-{number:012d}"),
        ),
        effective_date=occurred_on,
        created_at=datetime(2020, 1, 1, tzinfo=UTC),
        intents={intent},
        date_distance_days=(
            0
            if intent is CandidateIntent.EXACT_DATE
            else 1
            if intent is CandidateIntent.NEAR_DATE
            else None
        ),
        affinity_score=affinity_score,
        affinity_last_viewed_at=(
            datetime(2026, 9, 1, tzinfo=UTC) if affinity_score is not None else None
        ),
    )


def test_exact_date_is_lead_and_near_date_is_weaker() -> None:
    exact = candidate(1, occurred_on=date(2022, 9, 17), intent=CandidateIntent.EXACT_DATE)
    near = candidate(2, occurred_on=date(2025, 9, 16), intent=CandidateIntent.NEAR_DATE)
    photo = candidate(3, occurred_on=date(2025, 3, 2), intent=CandidateIntent.PHOTO_MEMORY)

    decision = select_candidates([photo, near, exact], CONTEXT, TODAY)

    assert decision.ordered_refs[0] == exact.ref


def test_selection_is_deterministic_unique_and_bounded_to_eight() -> None:
    candidates = [
        candidate(
            index,
            kind=tuple(StoryKind)[index % 3],
            occurred_on=date(2010 + index, (index % 12) + 1, 1),
        )
        for index in range(1, 18)
    ]

    first = select_candidates(candidates, CONTEXT, TODAY)
    second = select_candidates(list(reversed(candidates)), CONTEXT, TODAY)

    assert first == second
    assert len(first.ordered_refs) == 8
    assert len(set(first.ordered_refs)) == 8


def test_preferred_diversity_holds_when_alternatives_exist() -> None:
    candidates = [
        candidate(
            index,
            kind=tuple(StoryKind)[index % 3],
            occurred_on=date(2010 + index, (index % 11) + 1, (index % 20) + 1),
        )
        for index in range(1, 22)
    ]

    selected = select_candidates(candidates, CONTEXT, TODAY).ordered_refs
    selected_candidates = {item.ref: item for item in candidates}
    values = [selected_candidates[ref] for ref in selected]

    assert len({item.effective_date for item in values}) == len(values)
    assert len({(item.effective_date.year, item.effective_date.month) for item in values}) == len(
        values
    )
    for year in {item.effective_date.year for item in values}:
        assert sum(item.effective_date.year == year for item in values) <= 2
    for kind in StoryKind:
        assert sum(item.ref.kind is kind for item in values) <= 3


def test_sparse_history_relaxes_month_year_kind_then_day_to_reach_target() -> None:
    candidates = [candidate(index, occurred_on=date(2020, 1, 1)) for index in range(1, 9)]

    decision = select_candidates(candidates, CONTEXT, TODAY)

    assert len(decision.ordered_refs) == 8


def test_affinity_never_promotes_an_affinity_only_fallback_to_lead() -> None:
    affinity = candidate(1, affinity_score=5)
    recognizable = candidate(2, intent=CandidateIntent.PHOTO_MEMORY)

    decision = select_candidates([affinity, recognizable], CONTEXT, TODAY)

    assert decision.ordered_refs[0] == recognizable.ref


def test_only_one_affinity_candidate_can_materially_influence_order() -> None:
    candidates = [candidate(index) for index in range(1, 12)]
    candidates[5].affinity_score = 5
    candidates[5].affinity_last_viewed_at = datetime(2026, 9, 16, tzinfo=UTC)
    candidates[7].affinity_score = 4
    candidates[7].affinity_last_viewed_at = datetime(2026, 9, 15, tzinfo=UTC)

    decision = select_candidates(candidates, CONTEXT, TODAY)

    assert decision.affinity_influenced_ref in {None, candidates[5].ref}
