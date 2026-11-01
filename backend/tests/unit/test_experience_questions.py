"""Daily inspiration is stable, bounded and independent of answer activity."""

from datetime import date, timedelta
from uuid import UUID

import pytest

from eimir.domain.experiences import ExperienceKind
from eimir.games.questions import QUESTION_IDS, select_questions


@pytest.mark.parametrize("kind", list(ExperienceKind))
def test_every_question_is_used_once_before_repeating(kind: ExperienceKind) -> None:
    space = UUID(int=42)
    day = date(2026, 11, 1)
    cycle = [select_questions(space, kind, day + timedelta(days=i)) for i in range(8)]
    assert all(len(set(batch)) == 3 for batch in cycle)
    assert len({item for batch in cycle for item in batch}) == len(QUESTION_IDS[kind]) == 24
    assert cycle[0] == select_questions(space, kind, day + timedelta(days=8))
    assert cycle[0] == select_questions(space, kind, day)


def test_modules_have_independent_editorial_ids() -> None:
    assert not set(QUESTION_IDS[ExperienceKind.HAPPINESS]) & set(
        QUESTION_IDS[ExperienceKind.TIME_TRAVEL]
    )
