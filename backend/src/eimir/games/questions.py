"""Editorial inspiration, independent of authored-history and answer quotas."""

from __future__ import annotations

import hashlib
from datetime import date
from uuid import UUID

from eimir.domain.experiences import ExperienceKind

# Owned editorial IDs; approved existing wording remains in client localization.
QUESTION_IDS: dict[ExperienceKind, tuple[str, ...]] = {
    ExperienceKind.HAPPINESS: (
        "appreciation",
        "laughter",
        "smallMoment",
        "kindness",
        "ordinaryJoy",
        "comfort",
        "teamwork",
        "gratitude",
        "surprise",
        "beingSeen",
        "sharedPause",
        "proud",
        "goodStart",
        "smallGesture",
        "music",
        "lightness",
        "home",
        "support",
        "sharedTaste",
        "attention",
        "anticipation",
        "warmWords",
        "together",
        "todayAgain",
    ),
    ExperienceKind.TIME_TRAVEL: (
        "firstTrip",
        "ordinaryDay",
        "returnPlace",
        "mishap",
        "ritual",
        "perspective",
        "keepsake",
        "firstMeeting",
        "firstHome",
        "unexpected",
        "journey",
        "oldSong",
        "brave",
        "tradition",
        "season",
        "sharedMeal",
        "smallAdventure",
        "learning",
        "photoOutside",
        "celebration",
        "turningPoint",
        "rememberedWords",
        "quietDay",
        "again",
    ),
}
QUESTIONS_PER_DAY = 3


def select_questions(space_id: UUID, kind: ExperienceKind, day: date) -> tuple[str, ...]:
    """Same Space/day for both partners; complete the pool before repeating.

    A fixed Space offset changes only where the cycle starts, never its daily
    order. Selection has no persisted delivery side effect or account identity.
    """
    pool = QUESTION_IDS[kind]
    offset = int.from_bytes(hashlib.sha256(f"{space_id}:{kind}".encode()).digest()[:4])
    start = (offset + day.toordinal() * QUESTIONS_PER_DAY) % len(pool)
    return tuple(pool[(start + index) % len(pool)] for index in range(QUESTIONS_PER_DAY))
