"""HTTP contract for M4-B Activity, Notifications, and partner nudges."""

from __future__ import annotations

import contextlib
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Response
from fastapi import status as http_status
from pydantic import ConfigDict

from eimir.api.authors import resolve_author_summaries
from eimir.api.deps import Authorization, DbSession, ensure_capability
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary
from eimir.authorization import PrivacyClass, readable
from eimir.engagement import service, thinking
from eimir.engagement.models import (
    Activity,
    ActivityKind,
    EngagementTarget,
    Notification,
    NotificationKind,
    SupportGestureKind,
)
from eimir.entitlements.models import Capability

router = APIRouter()


class ActivityTargetPresentation(ApiModel):
    target_type: EngagementTarget
    target_id: UUID
    title: str | None = None


class ActivityItem(ApiModel):
    id: UUID
    source_event_id: UUID
    kind: ActivityKind
    actor_id: UUID | None
    actor: AuthorSummary | None = None
    target_type: EngagementTarget | None
    target_id: UUID | None
    target: ActivityTargetPresentation | None = None
    occurred_at: datetime
    created_at: datetime


class ActivityPage(ApiModel):
    items: list[ActivityItem]
    next_cursor: str | None
    has_more: bool


class NotificationItem(ApiModel):
    id: UUID
    source_event_id: UUID
    kind: NotificationKind
    actor_id: UUID | None
    actor: AuthorSummary | None = None
    target_type: EngagementTarget | None
    target_id: UUID | None
    target: ActivityTargetPresentation | None = None
    created_at: datetime
    read_at: datetime | None


class NotificationPage(ApiModel):
    items: list[NotificationItem]
    next_cursor: str | None
    has_more: bool


class NotificationUnreadCount(ApiModel):
    unread_count: int


class NotificationsReadAllResult(ApiModel):
    read_through: datetime
    updated: int


class ThinkingOfYouCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID


class ThinkingOfYouAccepted(ApiModel):
    client_request_id: UUID
    thinking_of_you_available_at: datetime


class PartnerQuickActionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    kind: SupportGestureKind
    client_request_id: UUID


class PartnerQuickActionAccepted(ApiModel):
    kind: SupportGestureKind
    client_request_id: UUID
    available_at: datetime


@router.get(
    "/spaces/{spaceId}/activity",
    response_model=ActivityPage,
    operation_id="getActivity",
    responses=problem_responses(400, 401, 404, 422),
    tags=["activity"],
)
def get_activity(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIMIT)] = service.DEFAULT_LIMIT,
) -> ActivityPage:
    page = service.read_activity(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
    )
    actor_ids = {item.actor_id for item in page.items if item.actor_id is not None}
    actors = _resolve_actors(session, actor_ids)

    targets: set[tuple[EngagementTarget, UUID]] = set()
    for item in page.items:
        if item.target_type is not None and item.target_id is not None:
            with contextlib.suppress(ValueError):
                targets.add((EngagementTarget(item.target_type), item.target_id))
    target_titles = _resolve_target_titles(session, authorization, targets)

    response.headers["Cache-Control"] = "private, no-store"
    return ActivityPage(
        items=[_activity_item(item, actors, target_titles) for item in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/notifications",
    response_model=NotificationPage,
    operation_id="getNotifications",
    responses=problem_responses(400, 401, 404, 422),
    tags=["notifications"],
)
def get_notifications(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_LIMIT)] = service.DEFAULT_LIMIT,
) -> NotificationPage:
    page = service.read_notifications(
        session,
        authorization,
        cursor=cursor,
        limit=limit,
    )
    actor_ids = {item.actor_id for item in page.items if item.actor_id is not None}
    actors = _resolve_actors(session, actor_ids)
    targets = {
        (EngagementTarget(item.target_type), item.target_id)
        for item in page.items
        if item.target_type is not None and item.target_id is not None
    }
    target_titles = _resolve_target_titles(session, authorization, targets)
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationPage(
        items=[_notification_item(item, actors, target_titles) for item in page.items],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.get(
    "/spaces/{spaceId}/notifications/unread-count",
    response_model=NotificationUnreadCount,
    operation_id="getNotificationUnreadCount",
    responses=problem_responses(401, 404, 422),
    tags=["notifications"],
)
def get_notification_unread_count(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> NotificationUnreadCount:
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationUnreadCount(unread_count=service.unread_count(session, authorization))


@router.post(
    "/spaces/{spaceId}/notifications/{notificationId}/read",
    response_model=NotificationItem,
    operation_id="markNotificationRead",
    responses=problem_responses(401, 404, 422),
    tags=["notifications"],
)
def mark_notification_read(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    notification_id: Annotated[str, Path(alias="notificationId")],
) -> NotificationItem:
    notification = service.mark_notification_read(
        session,
        authorization,
        notification_id,
    )
    actors = (
        _resolve_actors(session, {notification.actor_id})
        if notification.actor_id is not None
        else {}
    )
    target_titles = {}
    if notification.target_type is not None and notification.target_id is not None:
        with contextlib.suppress(ValueError):
            target_titles = _resolve_target_titles(
                session,
                authorization,
                {(EngagementTarget(notification.target_type), notification.target_id)},
            )
    response.headers["Cache-Control"] = "private, no-store"
    return _notification_item(notification, actors, target_titles)


@router.post(
    "/spaces/{spaceId}/notifications/read-all",
    response_model=NotificationsReadAllResult,
    operation_id="markAllNotificationsRead",
    responses=problem_responses(401, 404, 422),
    tags=["notifications"],
)
def mark_all_notifications_read(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> NotificationsReadAllResult:
    result = service.mark_all_notifications_read(session, authorization)
    response.headers["Cache-Control"] = "private, no-store"
    return NotificationsReadAllResult(
        read_through=result.read_through,
        updated=result.updated,
    )


@router.post(
    "/spaces/{spaceId}/thinking-of-you",
    response_model=ThinkingOfYouAccepted,
    status_code=http_status.HTTP_202_ACCEPTED,
    operation_id="sendThinkingOfYou",
    responses=problem_responses(401, 404, 422, 429),
    tags=["notifications"],
)
def send_thinking_of_you(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ThinkingOfYouCreate,
) -> ThinkingOfYouAccepted:
    request = thinking.send(
        session,
        authorization,
        client_request_id=body.client_request_id,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return ThinkingOfYouAccepted(
        client_request_id=request.client_request_id,
        thinking_of_you_available_at=request.created_at
        + timedelta(seconds=thinking.COOLDOWN_SECONDS),
    )


@router.post(
    "/spaces/{spaceId}/partner-quick-actions",
    response_model=PartnerQuickActionAccepted,
    status_code=http_status.HTTP_202_ACCEPTED,
    operation_id="sendPartnerQuickAction",
    responses=problem_responses(401, 403, 404, 422, 429),
    tags=["notifications"],
)
def send_partner_quick_action(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: PartnerQuickActionCreate,
) -> PartnerQuickActionAccepted:
    ensure_capability(
        session,
        authorization.space_id,
        Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value,
    )
    request = thinking.send_support_gesture(
        session,
        authorization,
        kind=body.kind,
        client_request_id=body.client_request_id,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return PartnerQuickActionAccepted(
        kind=body.kind,
        client_request_id=request.client_request_id,
        available_at=request.created_at
        + timedelta(seconds=thinking.SUPPORT_GESTURE_COOLDOWN_SECONDS),
    )


def _resolve_actors(
    session: DbSession,
    actor_ids: set[UUID],
) -> dict[UUID, AuthorSummary]:
    return resolve_author_summaries(session, actor_ids)


def _resolve_target_titles(
    session: DbSession,
    authorization: Authorization,
    targets: set[tuple[EngagementTarget, UUID]],
) -> dict[tuple[EngagementTarget, UUID], str]:
    if not targets:
        return {}

    by_type: dict[EngagementTarget, set[UUID]] = {}
    for target_type, target_id in targets:
        by_type.setdefault(target_type, set()).add(target_id)

    titles: dict[tuple[EngagementTarget, UUID], str] = {}
    for target_type, ids in by_type.items():
        model = service._TARGET_MODELS.get(target_type)
        if model is None:
            continue
        statement = readable(model, authorization).where(
            model.id.in_(ids),
            model.privacy_class == PrivacyClass.SPACE_SHARED.value,
        )
        rows = session.execute(statement).scalars().all()
        for row in rows:
            title: str | None = None
            if hasattr(row, "payload") and row.payload is not None:
                if target_type is EngagementTarget.HEART_MOMENT:
                    title = getattr(row.payload, "text", None)
                elif target_type is EngagementTarget.PLACE:
                    title = getattr(row.payload, "name", None)
                else:
                    title = getattr(row.payload, "title", None)
            if title:
                titles[(target_type, row.id)] = title
    return titles


def _activity_item(
    item: Activity,
    actors: dict[UUID, AuthorSummary],
    target_titles: dict[tuple[EngagementTarget, UUID], str],
) -> ActivityItem:
    target_presentation = None
    if item.target_type is not None and item.target_id is not None:
        with contextlib.suppress(ValueError):
            target_type = EngagementTarget(item.target_type)
            target_presentation = ActivityTargetPresentation(
                target_type=target_type,
                target_id=item.target_id,
                title=target_titles.get((target_type, item.target_id)),
            )

    return ActivityItem(
        id=item.id,
        source_event_id=item.source_event_id,
        kind=ActivityKind(item.kind),
        actor_id=item.actor_id,
        actor=actors.get(item.actor_id) if item.actor_id is not None else None,
        target_type=EngagementTarget(item.target_type) if item.target_type is not None else None,
        target_id=item.target_id,
        target=target_presentation,
        occurred_at=item.occurred_at,
        created_at=item.created_at,
    )


def _notification_item(
    item: Notification,
    actors: dict[UUID, AuthorSummary] | None = None,
    target_titles: dict[tuple[EngagementTarget, UUID], str] | None = None,
) -> NotificationItem:
    target_presentation = None
    if item.target_type is not None and item.target_id is not None:
        with contextlib.suppress(ValueError):
            target_type = EngagementTarget(item.target_type)
            target_presentation = ActivityTargetPresentation(
                target_type=target_type,
                target_id=item.target_id,
                title=target_titles.get((target_type, item.target_id)) if target_titles else None,
            )
    return NotificationItem(
        id=item.id,
        source_event_id=item.source_event_id,
        kind=NotificationKind(item.kind),
        actor_id=item.actor_id,
        actor=actors.get(item.actor_id) if actors and item.actor_id is not None else None,
        target_type=EngagementTarget(item.target_type) if item.target_type is not None else None,
        target_id=item.target_id,
        target=target_presentation,
        created_at=item.created_at,
        read_at=item.read_at,
    )
