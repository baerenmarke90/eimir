"""Relationship passport and Wir lifeline read models (``relationship.passport``).

Plugin code (Decision 0017): the Pro plugin mounts the routes that use these
reads. They aggregate Core data the Couple can already read; the Dashboard,
its shared Story summary and the Story itself stay Core and Free.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments.binding import attachments_of_memories, cover_of
from eimir.attachments.models import AttachmentStatus
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core import clock
from eimir.core.errors import ValidationError
from eimir.dashboard.service import (
    DashboardItem,
    DashboardItemType,
    PartnerSummary,
    RelationshipDuration,
    bounded_text,
    partner_summary,
    relationship_duration_on,
)
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.places.models import Place
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship.models import SpaceProfile
from eimir.story import service as story_service

LIFELINE_ENTRIES_LIMIT = 60
"""The most entries of one lifeline period returned at once."""
LIFELINE_ENTRIES_MAX_DAYS = 120
"""The longest period a lifeline column covers: one quarter plus its edge weeks."""
STORY_LIFELINE_RANGE_INVALID = "STORY_LIFELINE_RANGE_INVALID"


@dataclass(frozen=True)
class RelationshipPassport:
    partner: PartnerSummary | None
    relationship_duration: RelationshipDuration | None
    memories: int
    heart_moments: int
    milestones: int
    completed_plans: int
    places: int


@dataclass(frozen=True)
class LifelineWeek:
    """One calendar week (starting Monday) of the shared Story."""

    week_start: date
    memories: int
    heart_moments: int
    milestones: int
    highlight: DashboardItem


@dataclass(frozen=True)
class StoryLifeline:
    """The relationship lifeline drawn on Wir (#1770)."""

    starts_on: date | None
    today: date
    weeks: list[LifelineWeek]


@dataclass(frozen=True)
class StoryLifelineEntries:
    """The entries behind one lifeline column, oldest first."""

    total: int
    items: list[DashboardItem]


_LIFELINE_HIGHLIGHT_PREFERENCE: dict[story_service.StoryKind, int] = {
    # Memories are the only Story type with photos, so a week shows one first.
    story_service.StoryKind.MEMORY: 0,
    story_service.StoryKind.HEART_MOMENT: 1,
    story_service.StoryKind.MILESTONE: 2,
}


def read_story_lifeline(
    session: Session,
    authorization: AuthorizationContext,
    *,
    at: datetime | None = None,
) -> StoryLifeline:
    """Bucket the relationship-shared Story by week for the Wir lifeline.

    The weeks cover exactly the `shared_only` Story set up to the viewer's
    local today, so the per-week counts always add up to the totals that the
    client shows next to them. Each non-empty week carries one recognizable
    entry for the scrub preview: its latest Memory when there is one,
    otherwise its latest entry. Empty weeks are omitted.
    """
    account = session.get(Account, authorization.account_id)
    if account is None:
        raise RuntimeError("Authorized Dashboard account disappeared.")
    instant = clock.ensure_utc(at if at is not None else clock.now())
    today = clock.today_in(account.timezone, at=instant)
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == authorization.space_id)
    ).scalar_one_or_none()
    duration = relationship_duration_on(profile, today)
    starts_on = (
        duration.started_on if duration is not None and duration.started_on <= today else None
    )

    buckets: dict[date, list[story_service.StoryRow]] = defaultdict(list)
    for row in story_service.read_shared_story_rows(session, authorization, through=today):
        buckets[row.effective_date - timedelta(days=row.effective_date.weekday())].append(row)
    representatives = {
        week: max(
            rows,
            key=lambda row: (
                -_LIFELINE_HIGHLIGHT_PREFERENCE[row.kind],
                row.effective_date,
                row.created_at,
                str(row.id),
            ),
        )
        for week, rows in buckets.items()
    }
    highlights = _lifeline_highlights(session, authorization, list(representatives.values()))

    weeks: list[LifelineWeek] = []
    for week in sorted(buckets):
        rows = buckets[week]
        representative = representatives[week]
        weeks.append(
            LifelineWeek(
                week_start=week,
                memories=sum(row.kind == story_service.StoryKind.MEMORY for row in rows),
                heart_moments=sum(row.kind == story_service.StoryKind.HEART_MOMENT for row in rows),
                milestones=sum(row.kind == story_service.StoryKind.MILESTONE for row in rows),
                highlight=highlights.get(representative.id) or _lifeline_fallback(representative),
            )
        )
    return StoryLifeline(starts_on=starts_on, today=today, weeks=weeks)


def read_story_lifeline_entries(
    session: Session,
    authorization: AuthorizationContext,
    *,
    starts_on: date,
    ends_before: date,
    at: datetime | None = None,
) -> StoryLifelineEntries:
    """Return every entry of one lifeline period, oldest first.

    The lifeline only carries one highlight per week; selecting a column
    reads its entries lazily. The set is exactly the one `read_story_lifeline`
    counts (relationship-shared, up to the viewer's local today), narrowed to
    the half-open range ``[starts_on, ends_before)``, so a column's dots and
    its entries always agree. At most `LIFELINE_ENTRIES_LIMIT` entries are
    loaded; `total` tells how many the period holds.
    """
    if ends_before <= starts_on:
        raise ValidationError(
            "The lifeline range must end after it starts.", STORY_LIFELINE_RANGE_INVALID
        )
    if (ends_before - starts_on).days > LIFELINE_ENTRIES_MAX_DAYS:
        raise ValidationError(
            "The lifeline range is longer than one period.", STORY_LIFELINE_RANGE_INVALID
        )
    account = session.get(Account, authorization.account_id)
    if account is None:
        raise RuntimeError("Authorized Dashboard account disappeared.")
    instant = clock.ensure_utc(at if at is not None else clock.now())
    today = clock.today_in(account.timezone, at=instant)
    through = min(today, ends_before - timedelta(days=1))
    if through < starts_on:
        return StoryLifelineEntries(total=0, items=[])
    rows = story_service.read_shared_story_rows(
        session, authorization, through=through, since=starts_on
    )
    shown = rows[:LIFELINE_ENTRIES_LIMIT]
    loaded = _lifeline_highlights(session, authorization, shown)
    return StoryLifelineEntries(
        total=len(rows),
        items=[loaded.get(row.id) or _lifeline_fallback(row) for row in shown],
    )


def _lifeline_fallback(row: story_service.StoryRow) -> DashboardItem:
    return DashboardItem(
        type=DashboardItemType(row.kind.value),
        id=row.id,
        occurred_on=row.effective_date,
        created_at=row.created_at,
    )


def _lifeline_highlights(
    session: Session,
    authorization: AuthorizationContext,
    rows: list[story_service.StoryRow],
) -> dict[UUID, DashboardItem]:
    """Load the displayed entries in one batch per Story type."""
    ids: dict[story_service.StoryKind, list[UUID]] = defaultdict(list)
    for row in rows:
        ids[row.kind].append(row.id)
    highlights: dict[UUID, DashboardItem] = {}

    memory_ids = ids[story_service.StoryKind.MEMORY]
    if memory_ids:
        memories = list(
            session.execute(
                readable(Memory, authorization).where(Memory.id.in_(memory_ids))
            ).scalars()
        )
        galleries = attachments_of_memories(session, [memory.id for memory in memories])
        for memory in memories:
            preview = cover_of(
                galleries.get(memory.id, []), memory.payload.selected_cover_attachment_id
            )
            ready = preview is not None and preview.status == AttachmentStatus.READY
            highlights[memory.id] = DashboardItem(
                type=DashboardItemType.MEMORY,
                id=memory.id,
                title_or_text=bounded_text(memory.payload.title),
                occurred_on=memory.happened_on,
                created_at=memory.created_at,
                preview_attachment_id=preview.id if ready and preview is not None else None,
                preview_is_sensitive=bool(
                    ready and preview is not None and preview.payload.is_sensitive
                ),
                preview_has_thumbnail=bool(ready and preview is not None and preview.has_thumbnail),
            )

    heart_moment_ids = ids[story_service.StoryKind.HEART_MOMENT]
    if heart_moment_ids:
        for heart_moment in session.execute(
            readable(HeartMoment, authorization).where(
                HeartMoment.privacy_class == PrivacyClass.SPACE_SHARED.value,
                HeartMoment.id.in_(heart_moment_ids),
            )
        ).scalars():
            highlights[heart_moment.id] = DashboardItem(
                type=DashboardItemType.HEART_MOMENT,
                id=heart_moment.id,
                title_or_text=bounded_text(heart_moment.payload.text),
                occurred_on=heart_moment.happened_on,
                created_at=heart_moment.created_at,
            )

    milestone_ids = ids[story_service.StoryKind.MILESTONE]
    if milestone_ids:
        for milestone in session.execute(
            readable(Milestone, authorization).where(Milestone.id.in_(milestone_ids))
        ).scalars():
            highlights[milestone.id] = DashboardItem(
                type=DashboardItemType.MILESTONE,
                id=milestone.id,
                title_or_text=bounded_text(milestone.payload.title),
                occurred_on=milestone.happened_on,
                created_at=milestone.created_at,
            )
    return highlights


def read_relationship_passport(
    session: Session,
    authorization: AuthorizationContext,
) -> RelationshipPassport:
    """Read shared-only lifetime aggregates after the caller's Pro check."""
    from eimir.story.service import read_shared_story_counts

    account = session.get(Account, authorization.account_id)
    if account is None:
        raise RuntimeError("Authorized Dashboard account disappeared.")
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == authorization.space_id)
    ).scalar_one_or_none()
    story = read_shared_story_counts(session, authorization)
    completed = readable(Plan, authorization).where(
        Plan.status == PlanStatus.COMPLETED.value,
        Plan.privacy_class == PrivacyClass.SPACE_SHARED.value,
    )
    places = readable(Place, authorization).where(
        Place.privacy_class == PrivacyClass.SPACE_SHARED.value
    )
    return RelationshipPassport(
        partner=partner_summary(session, authorization),
        relationship_duration=relationship_duration_on(profile, clock.today_in(account.timezone)),
        memories=story.memories,
        heart_moments=story.heart_moments,
        milestones=story.milestones,
        completed_plans=session.execute(
            select(func.count()).select_from(completed.subquery())
        ).scalar_one(),
        places=session.execute(select(func.count()).select_from(places.subquery())).scalar_one(),
    )
