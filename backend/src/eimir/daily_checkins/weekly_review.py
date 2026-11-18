"""Explicit weekly selection over fresh authorized evidence; no generated prose storage."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ConflictError
from eimir.core.errors import ValidationError as DomainValidationError
from eimir.daily_checkins import insights
from eimir.daily_checkins.models import (
    DailyInsightFeedback,
    RecommendationKey,
    RecommendationRating,
)
from eimir.daily_checkins.service import _active_partner_account_id
from eimir.daily_checkins.weekly_patterns import (
    Observation,
    observations,
    paired_energy,
    paired_vibes,
    recommendation_order,
)
from eimir.recaps.local_ai import query_structured


@dataclass(frozen=True)
class Feedback:
    recommendation_key: RecommendationKey
    rating: RecommendationRating


@dataclass(frozen=True)
class Preview:
    week_start: date
    week_end: date
    history_start: date
    history_end: date
    evidence_token: str
    observations: list[Observation]
    recommendations: list[RecommendationKey]
    feedback: list[Feedback]
    general: bool


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    observation_keys: list[str] = Field(min_length=1, max_length=3)
    recommendation_keys: list[str] = Field(min_length=1, max_length=2)


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


def preview(session: Session, context: AuthorizationContext, week_start: date) -> Preview:
    anchor = insights.get_daily_insights(session, context)
    if (
        week_start.weekday() != 0
        or week_start > anchor.end_date
        or week_start < date.min + timedelta(weeks=7)
    ):
        raise DomainValidationError(
            "week_start must be a current or earlier Monday.", "VALIDATION_FAILED"
        )
    history_start = week_start - timedelta(weeks=7)
    week_end = week_start + timedelta(days=6)
    history_end = min(week_end, anchor.end_date)
    data = insights.get_daily_insights(
        session, context, start_date=history_start, end_date=history_end
    )
    facts = observations(data, week_start)
    eligible_days = [
        day for day in data.days if paired_energy(day) is not None or paired_vibes(day) is not None
    ]
    general = len(eligible_days) < 3 or not facts
    if general:
        facts = []
    votes = feedback(session, context)
    ratings = {vote.recommendation_key: vote.rating for vote in votes}
    keys = [
        key
        for key in recommendation_order(facts)
        if ratings.get(key) != RecommendationRating.NOT_FITTING
    ]
    keys.sort(key=lambda key: ratings.get(key) != RecommendationRating.HELPFUL)
    # Hidden participation and unpaired own values do not enter this revision.
    evidence = {
        "version": 1,
        "space": str(context.space_id),
        "account": str(context.account_id),
        "partner": str(_active_partner_account_id(session, context)),
        "start": history_start.isoformat(),
        "end": history_end.isoformat(),
        "timezone": data.daily_context_timezone,
        "vibe": data.vibe_enabled,
        "energy": data.energy_enabled,
        "days": [
            (day.checked_on.isoformat(), paired_energy(day), paired_vibes(day)) for day in data.days
        ],
    }
    token = hashlib.sha256(
        json.dumps(evidence, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return Preview(
        week_start, week_end, history_start, history_end, token, facts, keys, votes, general
    )


def choose(prepared: Preview) -> tuple[Selection, bool]:
    fallback = Selection.model_construct(
        observation_keys=[fact.key for fact in prepared.observations[:3]],
        recommendation_keys=[key.value for key in prepared.recommendations[:2]],
    )
    settings = get_settings()
    if (
        prepared.general
        or not prepared.observations
        or not prepared.recommendations
        or not settings.recap_ai_url
    ):
        return fallback, False
    schema = Selection.model_json_schema()
    schema["properties"]["observation_keys"]["items"] = {
        "type": "string",
        "enum": [fact.key for fact in prepared.observations],
    }
    schema["properties"]["recommendation_keys"]["items"] = {
        "type": "string",
        "enum": [key.value for key in prepared.recommendations],
    }
    packet = {
        "observations": [asdict(fact) for fact in prepared.observations],
        "recommendations": [key.value for key in prepared.recommendations],
    }
    body: dict[str, Any] = {
        "model": settings.recap_ai_model,
        "stream": False,
        "think": False,
        "keep_alive": 0,
        "format": schema,
        "options": {
            "num_ctx": 4096,
            "num_predict": 180,
            "temperature": 0,
            "num_thread": 2,
            "num_gpu": 0,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "Select useful observations and voluntary couple activities from the "
                    "supplied IDs only. Prefer supported multiweek patterns over a coverage "
                    "count. Recommendation meanings: quiet_time=unplanned calm time; "
                    "small_plan=choose one small shared activity; appreciation=share a "
                    "specific appreciation; listening=listen without rushing to solve; "
                    "own_pace=ask about each person's preferred pace; keep_ritual=choose a "
                    "small recurring connection. Do not diagnose, infer causes or "
                    "relationship quality. Return only the requested JSON schema with "
                    "distinct supplied IDs. There is no free-text field. The ordered "
                    "recommendation list already reflects the caller's preferences."
                ),
            },
            {"role": "user", "content": json.dumps(packet)},
        ],
    }
    output = query_structured(body, timeout_limit=8)
    try:
        selection = Selection.model_validate_json(output["message"]["content"]) if output else None
        if selection is None:
            return fallback, False
        for selected, allowed in [
            (selection.observation_keys, {fact.key for fact in prepared.observations}),
            (selection.recommendation_keys, {key.value for key in prepared.recommendations}),
        ]:
            if len(set(selected)) != len(selected) or not set(selected) <= allowed:
                return fallback, False
        return selection, True
    except (ValidationError, ValueError, KeyError, TypeError, RecursionError):
        return fallback, False


def reserve_inference(session: Session, context: AuthorizationContext, prepared: Preview) -> None:
    if (
        get_settings().recap_ai_url
        and prepared.observations
        and prepared.recommendations
        and not prepared.general
    ):
        rate_limit.check(
            session,
            "weekly-insight-inference",
            str(context.space_id),
            rate_limit.Limit(2, timedelta(minutes=1)),
        )


def require_revision(expected: str, actual: Preview) -> None:
    if expected != actual.evidence_token:
        raise ConflictError(
            "Weekly evidence changed; refresh before requesting a new insight.",
            "WEEKLY_INSIGHT_INPUTS_CHANGED",
        )
