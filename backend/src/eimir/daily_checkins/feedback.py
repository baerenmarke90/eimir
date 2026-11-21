"""The caller's private ratings of weekly recommendations (Core data).

Setting a rating is part of the Premium weekly review; reading, clearing,
exporting and deleting retained ratings stay Free/Core, so this module stays in
Core while the review itself is plugin code (``eimir.daily_insights``).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
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


def set_feedback(
    session: Session,
    context: AuthorizationContext,
    key: RecommendationKey,
    rating: RecommendationRating | None,
) -> Feedback | None:
    if rating is None:
        session.execute(
            delete(DailyInsightFeedback).where(
                DailyInsightFeedback.space_id == context.space_id,
                DailyInsightFeedback.account_id == context.account_id,
                DailyInsightFeedback.recommendation_key == key.value,
            )
        )
        return None
    session.execute(
        insert(DailyInsightFeedback)
        .values(
            space_id=context.space_id,
            account_id=context.account_id,
            recommendation_key=key.value,
            rating=rating.value,
        )
        .on_conflict_do_update(
            index_elements=["space_id", "account_id", "recommendation_key"],
            set_={"rating": rating.value, "updated_at": now()},
        )
    )
    return Feedback(key, rating)
