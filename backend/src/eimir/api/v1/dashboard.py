"""HTTP contract for the derived M4-A Dashboard."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Response
from pydantic import ConfigDict, Field, model_validator
from pydantic.json_schema import SkipJsonSchema

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.dashboard import preferences, service
from eimir.dashboard.service import DashboardItemType
from eimir.relationship.models import DurationDisplayMode
from eimir.story import service as story_service

router = APIRouter(tags=["dashboard"])


class DashboardPartner(ApiModel):
    id: UUID
    display_name: str


class DashboardSpaceSummary(ApiModel):
    space_id: UUID
    partner: DashboardPartner | None


class DashboardRelationshipDuration(ApiModel):
    started_on: date
    days_together: int
    display_mode: DurationDisplayMode


class DashboardItem(ApiModel):
    type: DashboardItemType
    id: UUID
    title_or_text: str | None
    occurred_on: date | None
    scheduled_on: date | None = None
    scheduled_at: datetime | None
    created_at: datetime | None
    preview_attachment_id: UUID | None = None


class DashboardSharedStorySummary(ApiModel):
    memories: int
    heart_moments: int
    milestones: int


class DashboardView(ApiModel):
    space: DashboardSpaceSummary
    relationship_duration: DashboardRelationshipDuration | None
    retrospective: DashboardItem | None
    keepsake: DashboardItem | None
    upcoming: list[DashboardItem]
    recent_shared: list[DashboardItem]
    shared_story_summary: DashboardSharedStorySummary
    thinking_of_you_available_at: datetime | None


class DashboardModulePreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    visible: bool | SkipJsonSchema[None] = None
    item_limit: preferences.DashboardItemLimit | SkipJsonSchema[None] = None
    selected_collection_id: UUID | None = None

    @model_validator(mode="after")
    def _require_at_least_one_facet(self) -> Self:
        if not self.model_fields_set:
            raise ValueError(
                "at least one of visible, itemLimit or selectedCollectionId must be supplied"
            )
        return self


class DashboardModulePreferenceView(ApiModel):
    module_key: str
    visible: bool
    item_limit: preferences.DashboardItemLimit | SkipJsonSchema[None] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )
    selected_collection_id: UUID | SkipJsonSchema[None] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )


class DashboardModulePreferenceList(ApiModel):
    items: list[DashboardModulePreferenceView]


@router.get(
    "/spaces/{spaceId}/dashboard",
    response_model=DashboardView,
    operation_id="getDashboard",
    responses=problem_responses(401, 404, 422),
)
def get_dashboard(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> DashboardView:
    """Return the shared-only relationship overview for one Space."""
    view = service.read_dashboard(session, authorization)
    shared_story_counts = story_service.read_shared_story_counts(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return DashboardView(
        space=DashboardSpaceSummary(
            space_id=view.space_id,
            partner=(
                DashboardPartner(id=view.partner.id, display_name=view.partner.display_name)
                if view.partner is not None
                else None
            ),
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
        retrospective=_project_item(view.retrospective) if view.retrospective is not None else None,
        keepsake=_project_item(view.keepsake) if view.keepsake is not None else None,
        upcoming=[_project_item(item) for item in view.upcoming],
        recent_shared=[_project_item(item) for item in view.recent_shared],
        shared_story_summary=DashboardSharedStorySummary(
            memories=shared_story_counts.memories,
            heart_moments=shared_story_counts.heart_moments,
            milestones=shared_story_counts.milestones,
        ),
        thinking_of_you_available_at=view.thinking_of_you_available_at,
    )


@router.get(
    "/spaces/{spaceId}/dashboard/preferences",
    response_model=DashboardModulePreferenceList,
    operation_id="listDashboardModulePreferences",
    responses=problem_responses(401, 404),
)
def list_dashboard_module_preferences(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> DashboardModulePreferenceList:
    """Return the current account's effective Dashboard preferences."""
    states = preferences.read_module_preferences(
        session,
        account_id=authorization.account_id,
        space_id=authorization.space_id,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return DashboardModulePreferenceList(
        items=[
            DashboardModulePreferenceView(
                module_key=state.key.value,
                visible=state.visible,
                item_limit=state.item_limit,
                selected_collection_id=state.selected_collection_id,
            )
            for state in states
        ]
    )


@router.patch(
    "/spaces/{spaceId}/dashboard/preferences/{moduleKey}",
    response_model=DashboardModulePreferenceView,
    operation_id="updateDashboardModulePreference",
    responses=problem_responses(401, 404, 422),
)
def update_dashboard_module_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: DashboardModulePreferenceUpdate,
    module_key: Annotated[str, Path(alias="moduleKey")],
) -> DashboardModulePreferenceView:
    """Set one private per-account Dashboard presentation preference."""
    state = preferences.set_module_preference(
        session,
        account_id=authorization.account_id,
        space_id=authorization.space_id,
        module_key=module_key,
        visible=body.visible,
        item_limit=body.item_limit,
        selected_collection_id=body.selected_collection_id,
        selected_collection_id_changed="selected_collection_id" in body.model_fields_set,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return DashboardModulePreferenceView(
        module_key=state.key.value,
        visible=state.visible,
        item_limit=state.item_limit,
        selected_collection_id=state.selected_collection_id,
    )


def _project_item(item: service.DashboardItem) -> DashboardItem:
    return DashboardItem(
        type=item.type,
        id=item.id,
        title_or_text=item.title_or_text,
        occurred_on=item.occurred_on,
        scheduled_on=item.scheduled_on,
        scheduled_at=item.scheduled_at,
        created_at=item.created_at,
        preview_attachment_id=item.preview_attachment_id,
    )
