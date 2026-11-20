"""HTTP contract of the Pro Daily Check-in insights and weekly review (Decision 0017).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
routes. Tag, paths, ``operation_id``s and schema names are those of the former
Core routes, so the full OpenAPI contract and the generated clients are unchanged.
Today's check-in and the rating route (whose clearing path is Free) stay Core.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.daily_checkins import (
    PartnerEnergyProjection,
    PartnerVibeProjection,
    WeeklyFeedbackView,
    partner_energy_view,
    partner_vibe_view,
)
from eimir.daily_checkins.context import DailyCheckInErrorCode
from eimir.daily_checkins.models import DailyVibe, RecommendationKey
from eimir.daily_insights import insights, weekly_review
from eimir.daily_insights.weekly_patterns import ObservationKind
from eimir.entitlements.models import Capability

router = APIRouter(tags=["daily-check-ins"])


class DailyCheckInInsightDayView(ApiModel):
    checked_on: date
    own_vibe: DailyVibe | None = None
    own_energy: int | None = None
    partner_vibe: PartnerVibeProjection | None = None
    partner_energy: PartnerEnergyProjection | None = None


class DailyCheckInInsightSummaryView(ApiModel):
    total_days: int
    days_with_own_check_in: int
    days_with_partner_check_in: int
    days_with_mutual_check_in: int


class DailyCheckInInsightsView(ApiModel):
    start_date: date
    end_date: date
    daily_context_timezone: str
    vibe_enabled: bool
    energy_enabled: bool
    days: list[DailyCheckInInsightDayView]
    summary: DailyCheckInInsightSummaryView


def _insights_view(result: insights.DailyInsightsResult) -> DailyCheckInInsightsView:
    return DailyCheckInInsightsView(
        start_date=result.start_date,
        end_date=result.end_date,
        daily_context_timezone=result.daily_context_timezone,
        vibe_enabled=result.vibe_enabled,
        energy_enabled=result.energy_enabled,
        days=[
            DailyCheckInInsightDayView(
                checked_on=day.checked_on,
                own_vibe=(DailyVibe(day.own_vibe) if day.own_vibe is not None else None),
                own_energy=day.own_energy,
                partner_vibe=(
                    partner_vibe_view(day.partner_vibe) if day.partner_vibe is not None else None
                ),
                partner_energy=(
                    partner_energy_view(day.partner_energy)
                    if day.partner_energy is not None
                    else None
                ),
            )
            for day in result.days
        ],
        summary=DailyCheckInInsightSummaryView(
            total_days=result.summary.total_days,
            days_with_own_check_in=result.summary.days_with_own_check_in,
            days_with_partner_check_in=result.summary.days_with_partner_check_in,
            days_with_mutual_check_in=result.summary.days_with_mutual_check_in,
        ),
    )


@router.get(
    "/spaces/{spaceId}/daily-check-in/insights",
    response_model=DailyCheckInInsightsView,
    operation_id="getDailyCheckInInsights",
    responses=problem_responses(
        401,
        403,
        404,
        409,
        422,
        descriptions={
            403: "`PREMIUM_ENTITLEMENT_REQUIRED`: Pro capability `daily.insights` required.",
            409: (
                f"`{DailyCheckInErrorCode.CONTEXT_UNAVAILABLE}`: the Space has no "
                "valid authoritative Daily Check-in time zone."
            ),
        },
    ),
)
def get_daily_check_in_insights(
    authorization: Authorization,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
) -> DailyCheckInInsightsView:
    """Return longitudinal Daily Check-in insights for the authorized Space.

    Protected by the Pro capability `daily.insights`. Free Spaces receive
    403 Forbidden with `PREMIUM_ENTITLEMENT_REQUIRED`.
    """
    ensure_capability(
        session,
        authorization.space_id,
        Capability.DAILY_INSIGHTS.value,
        lock_grants=False,
    )
    result = insights.get_daily_insights(
        session,
        authorization,
        start_date=start_date,
        end_date=end_date,
    )
    return _insights_view(result)


class WeeklyObservationView(ApiModel):
    key: str
    kind: ObservationKind
    sample_count: int
    value: int | None = None
    weekday: int | None = None


class WeeklyReviewView(ApiModel):
    week_start: date
    week_end: date
    history_start: date
    history_end: date
    evidence_token: str
    observations: list[WeeklyObservationView]
    recommendations: list[RecommendationKey]
    feedback: list[WeeklyFeedbackView]
    general: bool
    generated_by: Literal["RULES", "AI"] = "RULES"


class WeeklyReviewRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")
    week_start: date
    evidence_token: str = Field(pattern=r"^[a-f0-9]{64}$")


def _weekly_view(
    value: weekly_review.Preview,
    *,
    selection: weekly_review.Selection | None = None,
    ai: bool = False,
) -> WeeklyReviewView:
    facts = value.observations
    keys = value.recommendations
    if selection is not None:
        indexed = {fact.key: fact for fact in facts}
        facts = [indexed[key] for key in selection.observation_keys if key in indexed]
        keys = [
            RecommendationKey(key)
            for key in selection.recommendation_keys
            if key in {item.value for item in keys}
        ]
    return WeeklyReviewView(
        week_start=value.week_start,
        week_end=value.week_end,
        history_start=value.history_start,
        history_end=value.history_end,
        evidence_token=value.evidence_token,
        observations=[
            WeeklyObservationView(
                key=f.key,
                kind=f.kind,
                sample_count=f.sample_count,
                value=f.value,
                weekday=f.weekday,
            )
            for f in facts
        ],
        recommendations=keys,
        feedback=[
            WeeklyFeedbackView(recommendation_key=f.recommendation_key, rating=f.rating)
            for f in value.feedback
        ],
        general=value.general,
        generated_by="AI" if ai else "RULES",
    )


def _weekly_capability(session: DbSession, authorization: Authorization) -> None:
    ensure_capability(
        session, authorization.space_id, Capability.DAILY_INSIGHTS.value, lock_grants=False
    )


@router.get(
    "/spaces/{spaceId}/daily-check-in/weekly-review",
    response_model=WeeklyReviewView,
    operation_id="getDailyCheckInWeeklyReview",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def get_daily_check_in_weekly_review(
    authorization: Authorization, session: DbSession, response: Response, week_start: date
) -> WeeklyReviewView:
    """Read current authorized multiweek observations without running inference."""
    _weekly_capability(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return _weekly_view(weekly_review.preview(session, authorization, week_start))


@router.post(
    "/spaces/{spaceId}/daily-check-in/weekly-review",
    response_model=WeeklyReviewView,
    operation_id="createDailyCheckInWeeklyReview",
    responses=problem_responses(401, 403, 404, 409, 422, 429),
)
def create_daily_check_in_weekly_review(
    authorization: Authorization, session: DbSession, response: Response, body: WeeklyReviewRequest
) -> WeeklyReviewView:
    """Explicit bounded model selection; revisions are revalidated after inference."""
    _weekly_capability(session, authorization)
    prepared = weekly_review.preview(session, authorization, body.week_start)
    weekly_review.require_revision(body.evidence_token, prepared)
    weekly_review.reserve_inference(session, authorization, prepared)
    selected, ai = weekly_review.choose(prepared)
    session.expire_all()
    _weekly_capability(session, authorization)
    fresh = weekly_review.preview(session, authorization, body.week_start)
    weekly_review.require_revision(body.evidence_token, fresh)
    if not set(selected.recommendation_keys) <= {key.value for key in fresh.recommendations}:
        selected = weekly_review.Selection.model_construct(
            observation_keys=[fact.key for fact in fresh.observations[:3]],
            recommendation_keys=[key.value for key in fresh.recommendations[:2]],
        )
        ai = False
    response.headers["Cache-Control"] = "private, no-store"
    return _weekly_view(fresh, selection=selected, ai=ai)
