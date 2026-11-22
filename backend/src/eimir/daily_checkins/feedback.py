"""The caller's private ratings of the retired weekly recommendations (Core data).

The weekly AI review that collected these ratings was retired (#2203), so no
new rating can be set. Ratings retained from it stay caller-private Core data:
they can be read, cleared, exported and deleted without Pro.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.daily_checkins.models import (
    DailyInsightFeedback,
    RecommendationKey,
    RecommendationRating,
)


@dataclass(frozen=True)
class Feedback:
    recommendation_key: RecommendationKey
    rating: RecommendationRating


def feedback(session: Session, context: AuthorizationContext) -> list[Feedback]:
    rows = session.scalars(
        select(DailyInsightFeedback)
        .where(
            DailyInsightFeedback.space_id == context.space_id,
            DailyInsightFeedback.account_id == context.account_id,
        )
        .order_by(DailyInsightFeedback.recommendation_key)
    ).all()
    return [
        Feedback(RecommendationKey(row.recommendation_key), RecommendationRating(row.rating))
        for row in rows
    ]


def clear_feedback(session: Session, context: AuthorizationContext) -> None:
    """Remove every retained rating of the caller in this Space."""
    session.execute(
        delete(DailyInsightFeedback).where(
            DailyInsightFeedback.space_id == context.space_id,
            DailyInsightFeedback.account_id == context.account_id,
        )
    )
