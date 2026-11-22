"""HTTP contract of the Pro relationship passport and Wir lifeline (Decision 0017).

Mounted by the Pro plugin through ``routers()``; a Core-only server has no such
routes. Tag, paths, ``operation_id``s and schema names are those of the former
Core routes, so the full OpenAPI contract and the generated clients are unchanged.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response

from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.api.v1.dashboard import (
    DashboardItem,
    DashboardPartner,
    DashboardRelationshipDuration,
    project_item,
)
from eimir.entitlements.models import Capability
from eimir_pro.relationship_passport import service

router = APIRouter(tags=["dashboard"])


class StoryLifelineWeek(ApiModel):
    week_start: date
    memories: int
    heart_moments: int
    milestones: int
    highlight: DashboardItem


class StoryLifelineView(ApiModel):
    starts_on: date | None
    today: date
    weeks: list[StoryLifelineWeek]


class StoryLifelineEntriesView(ApiModel):
    total: int
    """How many shared entries the range holds; ``items`` holds at most a bounded part."""
    items: list[DashboardItem]


class RelationshipPassportView(ApiModel):
    partner: DashboardPartner | None
    relationship_duration: DashboardRelationshipDuration | None
    memories: int
    heart_moments: int
    milestones: int
    completed_plans: int
    places: int


@router.get(
    "/spaces/{spaceId}/relationship-passport",
    response_model=RelationshipPassportView,
    operation_id="getRelationshipPassport",
    responses=problem_responses(401, 403, 404),
)
def get_relationship_passport(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> RelationshipPassportView:
    """Return the Pro presentation without gating any underlying Core data."""
    ensure_capability(
        session, authorization.space_id, Capability.RELATIONSHIP_PASSPORT, lock_grants=False
    )
    view = service.read_relationship_passport(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return RelationshipPassportView(
        partner=(
            DashboardPartner(id=view.partner.id, display_name=view.partner.display_name)
            if view.partner is not None
            else None
        ),
        relationship_duration=(
            DashboardRelationshipDuration(
                started_on=view.relationship_duration.started_on,
                days_together=view.relationship_duration.days_together,
                display_mode=view.relationship_duration.display_mode,
            )
            if view.relationship_duration is not None
            else None
        ),
        memories=view.memories,
        heart_moments=view.heart_moments,
        milestones=view.milestones,
        completed_plans=view.completed_plans,
        places=view.places,
    )


@router.get(
    "/spaces/{spaceId}/story-lifeline",
    response_model=StoryLifelineView,
    operation_id="getStoryLifeline",
    responses=problem_responses(401, 403, 404),
)
def get_story_lifeline(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> StoryLifelineView:
    """Return the shared Story bucketed by week for the Pro Wir lifeline."""
    ensure_capability(
        session, authorization.space_id, Capability.RELATIONSHIP_PASSPORT, lock_grants=False
    )
    lifeline = service.read_story_lifeline(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return StoryLifelineView(
        starts_on=lifeline.starts_on,
        today=lifeline.today,
        weeks=[
            StoryLifelineWeek(
                week_start=week.week_start,
                memories=week.memories,
                heart_moments=week.heart_moments,
                milestones=week.milestones,
                highlight=project_item(week.highlight),
            )
            for week in lifeline.weeks
        ],
    )


@router.get(
    "/spaces/{spaceId}/story-lifeline/entries",
    response_model=StoryLifelineEntriesView,
    operation_id="getStoryLifelineEntries",
    responses=problem_responses(401, 403, 404, 422),
)
def get_story_lifeline_entries(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    starts_on: Annotated[
        date, Query(alias="from", description="First day of the range (inclusive).")
    ],
    ends_before: Annotated[date, Query(alias="to", description="Day after the range (exclusive).")],
) -> StoryLifelineEntriesView:
    """Return the shared entries of one lifeline period, oldest first.

    Read lazily when a lifeline column is selected. The entries are exactly
    those the lifeline counts for the range; at most a bounded number is
    returned together with the range total.
    """
    ensure_capability(
        session, authorization.space_id, Capability.RELATIONSHIP_PASSPORT, lock_grants=False
    )
    entries = service.read_story_lifeline_entries(
        session, authorization, starts_on=starts_on, ends_before=ends_before
    )
    response.headers["Cache-Control"] = "private, no-store"
    return StoryLifelineEntriesView(
        total=entries.total,
        items=[project_item(item) for item in entries.items],
    )
