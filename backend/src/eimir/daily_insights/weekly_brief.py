"""Rule-based weekly brief over authorized shared content (#2169).

Plugin code (``daily.insights``, Decision 0017). The brief is deterministic and
model-free: every statement is a rule over values the caller may already read.

Privacy order:
1. Vibe/Energy statements use only days on which both people's values are
   visible to the caller (``paired_vibes`` / ``paired_energy``), so a hidden
   partner day stays indistinguishable from a missing one.
2. Plans, Memories and Wishes are read through ``readable()``. Discreet Plans
   expose only their list title; Wishes concealed by an open game are omitted;
   HeartMoments, private notes and free text never participate.
3. Statements are descriptive, never causal, and require minimum samples.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from eimir.attachments.binding import attachments_of_memories, cover_of
from eimir.attachments.models import AttachmentStatus
from eimir.authorization import AuthorizationContext, readable
from eimir.core.errors import ValidationError as DomainValidationError
from eimir.daily_insights import insights
from eimir.daily_insights.weekly_patterns import (
    Observation,
    ObservationKind,
    observations,
    paired_energy,
    paired_vibes,
)
from eimir.memories.experiences import roots_only
from eimir.memories.models import Memory
from eimir.plans import discreet
from eimir.plans.models import Plan, PlanStatus
from eimir.wishes import concealment
from eimir.wishes.models import Wish, WishStatus

HISTORY_WEEKS = 8
GOOD_VIBES = frozenset({"VERY_GOOD", "GOOD"})
HIGH_ENERGY = 70
MIN_JOINT_DAYS = 3
MIN_ATTENTION_DAYS = 2
MIN_RHYTHM_DAYS = 3
MIN_RHYTHM_WEEKS = 3
MAX_WISHES = 3
WISH_SCAN_LIMIT = 20


class WeeklyBriefHeadline(StrEnum):
    """Which single rule-backed sentence opens the brief."""

    EMPTY = "EMPTY"
    SPARSE = "SPARSE"
    SHARED_GOOD_DAYS = "SHARED_GOOD_DAYS"
    GOOD_DAYS = "GOOD_DAYS"
    STEADY = "STEADY"


class WeeklyBriefAttention(StrEnum):
    """Who asked for closeness on the days on which the other asked for space."""

    OWN_CLOSENESS = "OWN_CLOSENESS"
    PARTNER_CLOSENESS = "PARTNER_CLOSENESS"
    MIXED = "MIXED"


@dataclass(frozen=True)
class BriefMoment:
    memory_id: UUID
    title: str
    happened_on: date
    photo_count: int
    attachment_id: UUID | None
    attachment_is_sensitive: bool
    attachment_has_thumbnail: bool


@dataclass(frozen=True)
class BriefWish:
    wish_id: UUID
    title: str
    own: bool
    created_on: date


@dataclass(frozen=True)
class BriefPlan:
    plan_id: UUID
    title: str | None
    concealed: bool
    planned_on: date


@dataclass(frozen=True)
class WeeklyBrief:
    week_start: date
    week_end: date
    elapsed_days: int
    joint_days: int
    headline: WeeklyBriefHeadline
    good_days: list[date]
    shared_days: list[date]
    highlight: BriefMoment | None
    attention: WeeklyBriefAttention | None
    attention_days: int
    wishes: list[BriefWish]
    suggested_date: date | None
    follow_up: BriefPlan | None
    new_observations: list[Observation]


def build(session: Session, context: AuthorizationContext, week_start: date) -> WeeklyBrief:
    anchor = insights.get_daily_insights(session, context)
    today = anchor.end_date
    if week_start.weekday() != 0 or week_start > today:
        raise DomainValidationError(
            "week_start must be a current or earlier Monday.", "VALIDATION_FAILED"
        )
    week_end = week_start + timedelta(days=6)
    history_start = week_start - timedelta(weeks=HISTORY_WEEKS - 1)
    data = insights.get_daily_insights(
        session, context, start_date=history_start, end_date=min(week_end, today)
    )
    zone = ZoneInfo(data.daily_context_timezone)
    current = [day for day in data.days if day.checked_on >= week_start]
    joint_days = sum(
        paired_vibes(day) is not None or paired_energy(day) is not None for day in current
    )
    good_days = [
        day.checked_on
        for day in current
        if (pair := paired_vibes(day)) is not None and set(pair) <= GOOD_VIBES
    ]
    week_plan_days = plan_days(session, context, week_start, week_end, zone)
    memories = _week_memories(session, context, week_start, week_end)
    shared_days = sorted(set(week_plan_days) | {m.happened_on for m in memories if m.happened_on})
    attention, attention_days = _attention(current)
    return WeeklyBrief(
        week_start=week_start,
        week_end=week_end,
        elapsed_days=len(current),
        joint_days=joint_days,
        headline=_headline(joint_days, good_days, set(shared_days)),
        good_days=good_days,
        shared_days=shared_days,
        highlight=_highlight(session, memories, set(good_days)),
        attention=attention,
        attention_days=attention_days,
        wishes=_open_wishes(session, context, zone),
        suggested_date=_suggested_date(data, today),
        follow_up=_follow_up(session, context, week_start, zone),
        new_observations=_new_observations(data, week_start),
    )


def _headline(joint_days: int, good_days: list[date], shared: set[date]) -> WeeklyBriefHeadline:
    if joint_days == 0:
        return WeeklyBriefHeadline.EMPTY
    if joint_days < MIN_JOINT_DAYS:
        return WeeklyBriefHeadline.SPARSE
    if len(good_days) >= 2 and all(day in shared for day in good_days):
        return WeeklyBriefHeadline.SHARED_GOOD_DAYS
    if good_days:
        return WeeklyBriefHeadline.GOOD_DAYS
    return WeeklyBriefHeadline.STEADY


def _attention(
    days: list[insights.DailyInsightDayEntry],
) -> tuple[WeeklyBriefAttention | None, int]:
    own = partner = 0
    for day in days:
        pair = paired_vibes(day)
        if pair == ("NEEDS_CONNECTION", "NEEDS_SPACE"):
            own += 1
        elif pair == ("NEEDS_SPACE", "NEEDS_CONNECTION"):
            partner += 1
    total = own + partner
    if total < MIN_ATTENTION_DAYS:
        return None, 0
    if own and partner:
        return WeeklyBriefAttention.MIXED, total
    return (
        WeeklyBriefAttention.OWN_CLOSENESS if own else WeeklyBriefAttention.PARTNER_CLOSENESS
    ), total


def _local_day(instant: datetime, zone: ZoneInfo) -> date:
    return instant.astimezone(zone).date()


def _plan_dates(plan: Plan, zone: ZoneInfo) -> list[date]:
    if plan.status == PlanStatus.COMPLETED.value and plan.experienced_on is not None:
        return [plan.experienced_on]
    if plan.planned_on is not None:
        end = plan.planned_until or plan.planned_on
        span = min((end - plan.planned_on).days, 30)
        return [plan.planned_on + timedelta(days=offset) for offset in range(span + 1)]
    if plan.planned_start is not None:
        return [_local_day(plan.planned_start, zone)]
    return []


def _scheduled_plans(
    session: Session, context: AuthorizationContext, start: date, end: date, zone: ZoneInfo
) -> list[Plan]:
    # Timed Plans are pre-filtered with a one-day margin and then compared in
    # the Space zone, so a late-evening start never lands on the wrong day.
    margin_start = datetime.combine(start - timedelta(days=1), time.min, tzinfo=zone)
    margin_end = datetime.combine(end + timedelta(days=2), time.min, tzinfo=zone)
    statement = readable(Plan, context).where(
        Plan.status != PlanStatus.IDEA.value,
        or_(
            and_(Plan.experienced_on >= start, Plan.experienced_on <= end),
            and_(
                Plan.planned_on <= end,
                or_(
                    Plan.planned_on >= start,
                    and_(Plan.planned_until.is_not(None), Plan.planned_until >= start),
                ),
            ),
            and_(Plan.planned_start >= margin_start, Plan.planned_start < margin_end),
        ),
    )
    return list(session.execute(statement).scalars())


def plan_days(
    session: Session, context: AuthorizationContext, start: date, end: date, zone: ZoneInfo
) -> set[date]:
    days: set[date] = set()
    for plan in _scheduled_plans(session, context, start, end, zone):
        days.update(day for day in _plan_dates(plan, zone) if start <= day <= end)
    return days


def _week_memories(
    session: Session, context: AuthorizationContext, start: date, end: date
) -> list[Memory]:
    statement = (
        readable(Memory, context)
        .where(roots_only(), Memory.happened_on >= start, Memory.happened_on <= end)
        .order_by(Memory.happened_on.desc(), Memory.id)
        .limit(50)
    )
    return list(session.execute(statement).scalars())


def _highlight(
    session: Session, memories: list[Memory], good_days: set[date]
) -> BriefMoment | None:
    if not memories:
        return None
    galleries = attachments_of_memories(session, [memory.id for memory in memories])

    def rank(memory: Memory) -> tuple[int, int, int, date]:
        ready = [
            entry
            for entry in galleries.get(memory.id, [])
            if entry.attachment.status == AttachmentStatus.READY
        ]
        happened = memory.happened_on or date.min
        return (
            int(happened in good_days),
            len(ready),
            len(memory.payload.photo_reactions),
            happened,
        )

    chosen = max(memories, key=rank)
    gallery = galleries.get(chosen.id, [])
    cover = cover_of(gallery, chosen.payload.selected_cover_attachment_id)
    return BriefMoment(
        memory_id=chosen.id,
        title=chosen.payload.title or "",
        happened_on=chosen.happened_on or date.min,
        photo_count=sum(entry.attachment.status == AttachmentStatus.READY for entry in gallery),
        attachment_id=cover.id if cover else None,
        attachment_is_sensitive=bool(cover and cover.payload.is_sensitive),
        attachment_has_thumbnail=bool(cover and cover.has_thumbnail),
    )


def _open_wishes(
    session: Session, context: AuthorizationContext, zone: ZoneInfo
) -> list[BriefWish]:
    hidden = concealment.hidden_wish_ids(session, context)
    statement = (
        readable(Wish, context)
        .where(Wish.status == WishStatus.OPEN.value)
        .order_by(Wish.created_at.asc(), Wish.id)
        .limit(WISH_SCAN_LIMIT)
    )
    wishes = [wish for wish in session.execute(statement).scalars() if wish.id not in hidden]
    return [
        BriefWish(
            wish_id=wish.id,
            title=wish.payload.title,
            own=wish.owner_id == context.account_id,
            created_on=_local_day(wish.created_at, zone),
        )
        for wish in wishes[:MAX_WISHES]
    ]


def _suggested_date(data: insights.DailyInsightsResult, today: date) -> date | None:
    """The weekday on which both people repeatedly had high Energy, next week."""
    high: dict[int, list[date]] = defaultdict(list)
    paired: dict[int, int] = defaultdict(int)
    for day in data.days:
        pair = paired_energy(day)
        if pair is None:
            continue
        weekday = day.checked_on.weekday()
        paired[weekday] += 1
        if min(pair) >= HIGH_ENERGY:
            high[weekday].append(day.checked_on)
    candidates = [
        (len(days) / paired[weekday], len(days), -weekday, weekday)
        for weekday, days in high.items()
        if len(days) >= MIN_RHYTHM_DAYS
        and len({d - timedelta(days=d.weekday()) for d in days}) >= MIN_RHYTHM_WEEKS
        and len(days) * 2 >= paired[weekday]
    ]
    if not candidates:
        return None
    weekday = max(candidates)[3]
    next_monday = today - timedelta(days=today.weekday()) + timedelta(weeks=1)
    return next_monday + timedelta(days=weekday)


def _follow_up(
    session: Session, context: AuthorizationContext, week_start: date, zone: ZoneInfo
) -> BriefPlan | None:
    start = week_start - timedelta(days=7)
    end = week_start - timedelta(days=1)
    candidates: list[tuple[date, Plan]] = []
    for plan in _scheduled_plans(session, context, start, end, zone):
        if plan.status != PlanStatus.PLANNED.value:
            continue
        dates = [day for day in _plan_dates(plan, zone) if start <= day <= end]
        # A multi-day Plan that continues into the brief week is still running.
        if dates and max(_plan_dates(plan, zone)) <= end:
            candidates.append((max(dates), plan))
    if not candidates:
        return None
    planned_on, plan = max(candidates, key=lambda item: (item[0], str(item[1].id)))
    return BriefPlan(
        plan_id=plan.id,
        title=discreet.list_title(plan),
        concealed=plan.discreet,
        planned_on=planned_on,
    )


def _new_observations(data: insights.DailyInsightsResult, week_start: date) -> list[Observation]:
    eligible = [
        day
        for day in data.days
        if day.checked_on >= week_start
        and (paired_energy(day) is not None or paired_vibes(day) is not None)
    ]
    if len(eligible) < MIN_JOINT_DAYS:
        return []
    previous_start = week_start - timedelta(days=7)
    previous = replace(data, days=[day for day in data.days if day.checked_on < week_start])
    earlier = {fact.kind for fact in observations(previous, previous_start)}
    return [
        fact
        for fact in observations(data, week_start)
        if fact.kind is not ObservationKind.JOINT_DAYS and fact.kind not in earlier
    ]
