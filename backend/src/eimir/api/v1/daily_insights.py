"""HTTP contract of the Pro Daily Check-in insights and weekly brief (Decision 0017).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
routes. Tag, paths, ``operation_id``s and schema names are those of the former
Core routes, so the full OpenAPI contract and the generated clients are unchanged.
Today's check-in and the retained-rating routes (#2203) stay Core.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import Field

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.daily_checkins import (
    PartnerEnergyProjection,
    PartnerVibeProjection,
    partner_energy_view,
    partner_vibe_view,
)
from eimir.daily_checkins.context import DailyCheckInErrorCode
from eimir.daily_checkins.models import DailyVibe
from eimir.daily_insights import insights, personal_brief, weekly_brief
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


def _weekly_capability(session: DbSession, authorization: Authorization) -> None:
    ensure_capability(
        session, authorization.space_id, Capability.DAILY_INSIGHTS.value, lock_grants=False
    )


class WeeklyBriefMomentView(ApiModel):
    memory_id: UUID
    title: str
    happened_on: date
    photo_count: int
    attachment_id: UUID | None = None
    attachment_is_sensitive: bool = False
    attachment_has_thumbnail: bool = False


class WeeklyBriefWishView(ApiModel):
    wish_id: UUID
    title: str
    own: bool
    created_on: date


class WeeklyBriefPlanView(ApiModel):
    plan_id: UUID
    title: str | None = Field(
        default=None,
        description="List title; null asks the client for its neutral discreet fallback.",
    )
    concealed: bool
    planned_on: date


class WeeklyBriefView(ApiModel):
    week_start: date
    week_end: date
    elapsed_days: int = Field(description="Days of the week up to the Space day, at most 7.")
    joint_days: int = Field(description="Days with values of both people visible to the caller.")
    headline: weekly_brief.WeeklyBriefHeadline
    good_days: list[date]
    shared_days: list[date] = Field(description="Days with a readable Plan or Memory.")
    highlight: WeeklyBriefMomentView | None = None
    attention: weekly_brief.WeeklyBriefAttention | None = None
    attention_days: int
    wishes: list[WeeklyBriefWishView]
    suggested_date: date | None = None
    follow_up: WeeklyBriefPlanView | None = None
    new_observations: list[WeeklyObservationView]


def _brief_view(value: weekly_brief.WeeklyBrief) -> WeeklyBriefView:
    moment = value.highlight
    plan = value.follow_up
    return WeeklyBriefView(
        week_start=value.week_start,
        week_end=value.week_end,
        elapsed_days=value.elapsed_days,
        joint_days=value.joint_days,
        headline=value.headline,
        good_days=value.good_days,
        shared_days=value.shared_days,
        highlight=None
        if moment is None
        else WeeklyBriefMomentView(
            memory_id=moment.memory_id,
            title=moment.title,
            happened_on=moment.happened_on,
            photo_count=moment.photo_count,
            attachment_id=moment.attachment_id,
            attachment_is_sensitive=moment.attachment_is_sensitive,
            attachment_has_thumbnail=moment.attachment_has_thumbnail,
        ),
        attention=value.attention,
        attention_days=value.attention_days,
        wishes=[
            WeeklyBriefWishView(
                wish_id=wish.wish_id, title=wish.title, own=wish.own, created_on=wish.created_on
            )
            for wish in value.wishes
        ],
        suggested_date=value.suggested_date,
        follow_up=None
        if plan is None
        else WeeklyBriefPlanView(
            plan_id=plan.plan_id,
            title=plan.title,
            concealed=plan.concealed,
            planned_on=plan.planned_on,
        ),
        new_observations=[
            WeeklyObservationView(
                key=f.key,
                kind=f.kind,
                sample_count=f.sample_count,
                value=f.value,
                weekday=f.weekday,
            )
            for f in value.new_observations
        ],
    )


@router.get(
    "/spaces/{spaceId}/daily-check-in/weekly-brief",
    response_model=WeeklyBriefView,
    operation_id="getDailyCheckInWeeklyBrief",
    responses=problem_responses(
        401,
        403,
        404,
        409,
        422,
        descriptions={
            403: "`PREMIUM_ENTITLEMENT_REQUIRED`: Pro capability `daily.insights` required.",
        },
    ),
)
def get_daily_check_in_weekly_brief(
    authorization: Authorization, session: DbSession, response: Response, week_start: date
) -> WeeklyBriefView:
    """Rule-based weekly brief over mutually visible values and readable shared content.

    Model-free and deterministic (#2169). Plans, Memories and Wishes are read
    through the ordinary visibility rules; the brief stores nothing.
    """
    _weekly_capability(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return _brief_view(weekly_brief.build(session, authorization, week_start))


class PersonalEnergyComparisonView(ApiModel):
    group: int = Field(description="Mean own Energy on days with a shared Plan or Memory.")
    others: int = Field(description="Mean own Energy on the other days.")
    sample_days: int


class PersonalWeekdayPatternView(ApiModel):
    weekday: int = Field(ge=0, le=6, description="0 is Monday.")
    energy: int
    others: int
    sample_days: int


class PersonalWeeklyBriefView(ApiModel):
    week_start: date
    week_end: date
    elapsed_days: int
    own_days: list[date]
    good_days: list[date]
    shared_days: list[date]
    headline: personal_brief.PersonalBriefHeadline
    shared_energy: PersonalEnergyComparisonView | None = None
    lower_weekday: PersonalWeekdayPatternView | None = None
    higher_weekday: PersonalWeekdayPatternView | None = None


def _weekday_view(
    value: personal_brief.WeekdayPattern | None,
) -> PersonalWeekdayPatternView | None:
    if value is None:
        return None
    return PersonalWeekdayPatternView(
        weekday=value.weekday,
        energy=value.energy,
        others=value.others,
        sample_days=value.sample_days,
    )


@router.get(
    "/spaces/{spaceId}/daily-check-in/weekly-brief/personal",
    response_model=PersonalWeeklyBriefView,
    operation_id="getDailyCheckInPersonalWeeklyBrief",
    responses=problem_responses(
        401,
        403,
        404,
        409,
        422,
        descriptions={
            403: "`PREMIUM_ENTITLEMENT_REQUIRED`: Pro capability `daily.insights` required.",
        },
    ),
)
def get_daily_check_in_personal_weekly_brief(
    authorization: Authorization, session: DbSession, response: Response, week_start: date
) -> PersonalWeeklyBriefView:
    """Private weekly brief over the caller's own values alone (#2197).

    Model-free. Partner Daily Check-in rows are never read; shared Plan and Memory dates
    follow the ordinary visibility rules.
    """
    _weekly_capability(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    value = personal_brief.build_personal(session, authorization, week_start)
    energy = value.shared_energy
    return PersonalWeeklyBriefView(
        week_start=value.week_start,
        week_end=value.week_end,
        elapsed_days=value.elapsed_days,
        own_days=value.own_days,
        good_days=value.good_days,
        shared_days=value.shared_days,
        headline=value.headline,
        shared_energy=None
        if energy is None
        else PersonalEnergyComparisonView(
            group=energy.group, others=energy.others, sample_days=energy.sample_days
        ),
        lower_weekday=_weekday_view(value.lower_weekday),
        higher_weekday=_weekday_view(value.higher_weekday),
    )
