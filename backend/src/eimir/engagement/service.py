"""M4-B projection, pagination and recipient-state services."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import (
    AuthorizationContext,
    ContentVisibility,
    PrivacyClass,
    readable,
)
from eimir.chapters.models import Chapter
from eimir.collections.models import Collection
from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ErrorCode, NotFoundError
from eimir.core.ids import parse_id
from eimir.domain.events import EventType
from eimir.engagement import email_delivery, notification_preferences, push, thinking
from eimir.engagement.models import (
    Activity,
    ActivityKind,
    EngagementTarget,
    Notification,
    NotificationKind,
)
from eimir.heart_moments.models import HeartMoment
from eimir.identity import effects as account_effects
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.observability import safe_exception_summary
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place
from eimir.plans.models import Plan
from eimir.relationship.models import Membership, MembershipStatus
from eimir.reminders import delivery as reminder_delivery
from eimir.wishes.models import Wish

log = logging.getLogger(__name__)

DEFAULT_LIMIT = 25
MAX_LIMIT = 50
ACTIVITY_CURSOR_VERSION = "activity-v1"
NOTIFICATION_CURSOR_VERSION = "notification-v1"

_OWN_NOISE_KINDS = {
    ActivityKind.PLAN_CREATED.value,
    ActivityKind.PLACE_CREATED.value,
    ActivityKind.COLLECTION_CREATED.value,
    ActivityKind.WISH_CREATED.value,
}

_TARGET_MODELS: dict[EngagementTarget, Any] = {
    EngagementTarget.MEMORY: Memory,
    EngagementTarget.HEART_MOMENT: HeartMoment,
    EngagementTarget.MILESTONE: Milestone,
    EngagementTarget.WISH: Wish,
    EngagementTarget.PLAN: Plan,
    EngagementTarget.PLACE: Place,
    EngagementTarget.CHAPTER: Chapter,
    EngagementTarget.COLLECTION: Collection,
}

_ACTIVITY_EVENTS: dict[EventType, tuple[ActivityKind, EngagementTarget]] = {
    EventType.MEMORY_CREATED: (ActivityKind.MEMORY_CREATED, EngagementTarget.MEMORY),
    EventType.MILESTONE_CREATED: (
        ActivityKind.MILESTONE_CREATED,
        EngagementTarget.MILESTONE,
    ),
    EventType.HEART_MOMENT_CREATED: (
        ActivityKind.HEART_MOMENT_CREATED,
        EngagementTarget.HEART_MOMENT,
    ),
    EventType.HEART_MOMENT_VISIBILITY_CHANGED: (
        ActivityKind.HEART_MOMENT_CREATED,
        EngagementTarget.HEART_MOMENT,
    ),
    EventType.WISH_CREATED: (ActivityKind.WISH_CREATED, EngagementTarget.WISH),
    EventType.PLAN_CREATED: (ActivityKind.PLAN_CREATED, EngagementTarget.PLAN),
    EventType.PLAN_COMPLETED: (ActivityKind.PLAN_COMPLETED, EngagementTarget.PLAN),
    EventType.PLACE_CREATED: (ActivityKind.PLACE_CREATED, EngagementTarget.PLACE),
    EventType.CHAPTER_CREATED: (ActivityKind.CHAPTER_CREATED, EngagementTarget.CHAPTER),
    EventType.COLLECTION_CREATED: (
        ActivityKind.COLLECTION_CREATED,
        EngagementTarget.COLLECTION,
    ),
}


@dataclass(frozen=True)
class ActivityPage:
    items: list[Activity]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class NotificationPage:
    items: list[Notification]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class MarkAllResult:
    read_through: datetime
    updated: int


def project_pending(session: Session, *, limit: int = 50) -> int:
    """Project one locked Outbox batch with per-event retry isolation."""
    events = list(outbox_service.claim_unprocessed(session, limit=limit))
    for event in events:
        try:
            with session.begin_nested():
                project_event(session, event)
        except Exception as exc:
            # Same rationale as jobs/worker.py: an unexpected projection
            # failure's own text is not developer-authored and must not be
            # persisted verbatim (#680, extended to Outbox per its own
            # follow-up comment; #695 tracks whether Outbox needs anything
            # beyond this).
            became_terminal = outbox_service.mark_failed(event, safe_exception_summary(exc))
            log.exception(
                "outbox event projection failed",
                extra={"event_id": str(event.id), "event_type": event.event_type},
            )
            if became_terminal:
                # Distinct from the retry-scheduled case above: this event
                # will never be reclaimed again and needs operator attention,
                # the same way jobs/worker.py's "unknown job kind" does.
                log.error(
                    "outbox event permanently failed after exhausting retries",
                    extra={
                        "event_id": str(event.id),
                        "event_type": event.event_type,
                        "attempts": event.attempts,
                    },
                )
        else:
            outbox_service.mark_processed(event)
    return len(events)


def _event_effects_allowed(session: Session, event: OutboxEvent) -> bool:
    account_ids = {
        account_id
        for account_id in (event.actor_id, event.payload.recipient_id)
        if account_id is not None
    }
    locked = account_effects.lock_enabled_accounts(session, account_ids)
    if locked is None:
        return False
    return all(
        account_effects.has_active_membership(
            session,
            account_id=account_id,
            space_id=event.space_id,
        )
        for account_id in account_ids
    )


def project_event(session: Session, event: OutboxEvent) -> None:
    """Apply the controlled M4-B catalog for one safe Outbox event."""
    try:
        event_type = EventType(event.event_type)
    except ValueError:
        return

    # Lock all actor/recipient Accounts in deterministic order before any
    # projection. This serializes stale Outbox work with deletion acceptance
    # and makes accepted deletion a hard boundary for new activity,
    # Notification and PushDelivery state.
    if not _event_effects_allowed(session, event):
        return

    if event_type is EventType.PARTNER_THINKING_OF_YOU:
        thinking.project_notification(session, event)
        push.ensure_deliveries_for_source_event(session, event.id)
        email_delivery.ensure_deliveries_for_source_event(session, event.id)
        return

    if event_type in {EventType.PARTNER_KISS, EventType.PARTNER_CHECK_IN}:
        thinking.project_support_gesture_notification(session, event)
        push.ensure_deliveries_for_source_event(session, event.id)
        email_delivery.ensure_deliveries_for_source_event(session, event.id)
        return

    if event_type is EventType.REMINDER_DUE:
        reminder_delivery.project_notification(session, event)
        push.ensure_deliveries_for_source_event(session, event.id)
        email_delivery.ensure_deliveries_for_source_event(session, event.id)
        return

    activity_target = _activity_target(event, event_type)
    if activity_target is not None:
        kind, target_type, target_id = activity_target
        if _target_is_shared(session, event.space_id, target_type, target_id):
            _insert_activity(session, event, kind, target_type, target_id)

    if event_type is EventType.COMMENT_CREATED:
        comment_target = _comment_target(event)
        if comment_target is None or event.actor_id is None:
            return
        target_type, target_id = comment_target
        _project_comment_notification(session, event, target_type, target_id)

    push.ensure_deliveries_for_source_event(session, event.id)
    email_delivery.ensure_deliveries_for_source_event(session, event.id)


def _activity_target(
    event: OutboxEvent,
    event_type: EventType,
) -> tuple[ActivityKind, EngagementTarget, UUID] | None:
    if (
        event_type in {EventType.HEART_MOMENT_CREATED, EventType.HEART_MOMENT_VISIBILITY_CHANGED}
        and event.payload.visibility is not ContentVisibility.SHARED
    ):
        return None

    mapped = _ACTIVITY_EVENTS.get(event_type)
    if mapped is not None:
        kind, target_type = mapped
        return kind, target_type, event.subject_id

    if event_type is EventType.COMMENT_CREATED:
        comment_target = _comment_target(event)
        if comment_target is None:
            return None
        target_type, target_id = comment_target
        return ActivityKind.COMMENT_CREATED, target_type, target_id

    return None


def _comment_target(event: OutboxEvent) -> tuple[EngagementTarget, UUID] | None:
    raw_type = event.payload.target_type
    target_id = event.payload.target_id
    if raw_type is None or target_id is None:
        return None
    try:
        return EngagementTarget(raw_type), target_id
    except ValueError:
        return None


def _target_is_shared(
    session: Session,
    space_id: UUID,
    target_type: EngagementTarget,
    target_id: UUID,
) -> bool:
    model = _TARGET_MODELS[target_type]
    statement = select(model.id).where(
        model.id == target_id,
        model.space_id == space_id,
        model.privacy_class == PrivacyClass.SPACE_SHARED.value,
    )
    return session.execute(statement).scalar_one_or_none() is not None


def _insert_activity(
    session: Session,
    event: OutboxEvent,
    kind: ActivityKind,
    target_type: EngagementTarget,
    target_id: UUID,
) -> None:
    insert = postgresql.insert(Activity).values(
        space_id=event.space_id,
        source_event_id=event.id,
        kind=kind.value,
        actor_id=event.actor_id,
        target_type=target_type.value,
        target_id=target_id,
        occurred_at=event.created_at,
    )
    # A HeartMoment can reach shared visibility at creation or through a
    # later transition. The partial unique index keeps those event paths and
    # repeated private/share transitions from adding a second feed entry.
    if kind is ActivityKind.HEART_MOMENT_CREATED:
        statement = insert.on_conflict_do_nothing()
    else:
        statement = insert.on_conflict_do_nothing(index_elements=["source_event_id", "kind"])
    session.execute(statement)


def _project_comment_notification(
    session: Session,
    event: OutboxEvent,
    target_type: EngagementTarget,
    target_id: UUID,
) -> None:
    recipient_id = event.payload.recipient_id
    if recipient_id is None or recipient_id == event.actor_id:
        return

    active_recipient = session.execute(
        select(Membership.account_id).where(
            Membership.space_id == event.space_id,
            Membership.account_id == recipient_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one_or_none()
    if active_recipient is None:
        return

    context = AuthorizationContext(account_id=recipient_id, space_id=event.space_id)
    if not _target_is_projectable(session, context, target_type, target_id):
        return

    statement = (
        postgresql.insert(Notification)
        .values(
            space_id=event.space_id,
            recipient_account_id=recipient_id,
            source_event_id=event.id,
            kind=NotificationKind.COMMENT_CREATED.value,
            actor_id=event.actor_id,
            target_type=target_type.value,
            target_id=target_id,
            created_at=event.created_at,
            in_app_visible=notification_preferences.in_app_enabled(
                session, account_id=recipient_id, kind=NotificationKind.COMMENT_CREATED.value
            ),
        )
        .on_conflict_do_nothing(index_elements=["recipient_account_id", "source_event_id", "kind"])
    )
    session.execute(statement)


def _target_is_projectable(
    session: Session,
    context: AuthorizationContext,
    target_type: EngagementTarget,
    target_id: UUID,
) -> bool:
    model = _TARGET_MODELS[target_type]
    statement = readable(model, context).where(
        model.id == target_id,
        model.privacy_class == PrivacyClass.SPACE_SHARED.value,
    )
    return session.execute(statement.with_only_columns(model.id)).scalar_one_or_none() is not None


def _projectable_predicate(
    target_type_column: Any,
    target_id_column: Any,
    context: AuthorizationContext,
) -> Any:
    clauses: list[Any] = [target_type_column.is_(None)]
    for target_type, model in _TARGET_MODELS.items():
        exists = (
            readable(model, context)
            .where(
                model.id == target_id_column,
                model.privacy_class == PrivacyClass.SPACE_SHARED.value,
            )
            .with_only_columns(model.id)
            .exists()
        )
        clauses.append(and_(target_type_column == target_type.value, exists))
    return or_(*clauses)


def notification_target_available(
    session: Session, notification: Notification, context: AuthorizationContext
) -> bool:
    """Recheck the Center target authorization before external delivery."""
    return (
        session.execute(
            select(Notification.id).where(
                Notification.id == notification.id,
                Notification.space_id == context.space_id,
                Notification.recipient_account_id == context.account_id,
                _projectable_predicate(Notification.target_type, Notification.target_id, context),
            )
        ).scalar_one_or_none()
        is not None
    )


def _activity_binding(context: AuthorizationContext) -> dict[str, str]:
    return {
        "collection": ACTIVITY_CURSOR_VERSION,
        "accountId": str(context.account_id),
        "spaceId": str(context.space_id),
    }


def _notification_binding(context: AuthorizationContext) -> dict[str, str]:
    return {
        "collection": NOTIFICATION_CURSOR_VERSION,
        "accountId": str(context.account_id),
        "spaceId": str(context.space_id),
    }


def _encode_position(binding: dict[str, str], at: datetime, item_id: UUID) -> str:
    return cursor_codec.encode(
        binding=binding,
        position={
            "at": clock.ensure_utc(at).isoformat().replace("+00:00", "Z"),
            "id": str(item_id),
        },
    )


def _decode_position(
    token: str,
    binding: dict[str, str],
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=binding)
    at_raw = position.get("at")
    id_raw = position.get("id")
    if not isinstance(at_raw, str) or not isinstance(id_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        at = datetime.fromisoformat(at_raw.replace("Z", "+00:00"))
        item_id = UUID(id_raw)
    except ValueError as exc:
        raise cursor_codec.invalid_cursor() from exc
    if at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return at.astimezone(UTC), item_id


def read_activity(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> ActivityPage:
    binding = _activity_binding(context)
    statement = select(Activity).where(
        Activity.space_id == context.space_id,
        _projectable_predicate(Activity.target_type, Activity.target_id, context),
        or_(
            Activity.actor_id != context.account_id,
            Activity.actor_id.is_(None),
            Activity.kind.not_in(_OWN_NOISE_KINDS),
        ),
    )
    if cursor is not None:
        occurred_at, item_id = _decode_position(cursor, binding)
        statement = statement.where(
            or_(
                Activity.occurred_at < occurred_at,
                and_(Activity.occurred_at == occurred_at, Activity.id < item_id),
            )
        )
    rows = list(
        session.execute(
            statement.order_by(Activity.occurred_at.desc(), Activity.id.desc()).limit(limit + 1)
        ).scalars()
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_position(binding, last.occurred_at, last.id)
    return ActivityPage(items=items, next_cursor=next_cursor, has_more=has_more)


def read_notifications(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> NotificationPage:
    binding = _notification_binding(context)
    statement = select(Notification).where(
        Notification.space_id == context.space_id,
        Notification.recipient_account_id == context.account_id,
        Notification.in_app_visible.is_(True),
        _projectable_predicate(Notification.target_type, Notification.target_id, context),
    )
    if cursor is not None:
        created_at, item_id = _decode_position(cursor, binding)
        statement = statement.where(
            or_(
                Notification.created_at < created_at,
                and_(Notification.created_at == created_at, Notification.id < item_id),
            )
        )
    rows = list(
        session.execute(
            statement.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(
                limit + 1
            )
        ).scalars()
    )
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_position(binding, last.created_at, last.id)
    return NotificationPage(items=items, next_cursor=next_cursor, has_more=has_more)


def unread_count(session: Session, context: AuthorizationContext) -> int:
    statement = select(func.count(Notification.id)).where(
        Notification.space_id == context.space_id,
        Notification.recipient_account_id == context.account_id,
        Notification.read_at.is_(None),
        Notification.in_app_visible.is_(True),
        _projectable_predicate(Notification.target_type, Notification.target_id, context),
    )
    return int(session.execute(statement).scalar_one())


def mark_notification_read(
    session: Session,
    context: AuthorizationContext,
    notification_id: UUID | str,
) -> Notification:
    identifier = notification_id if isinstance(notification_id, UUID) else parse_id(notification_id)
    if identifier is None:
        raise NotFoundError(
            "Notification not found.",
            ErrorCode.NOTIFICATION_NOT_FOUND,
        )
    statement = (
        select(Notification)
        .where(
            Notification.id == identifier,
            Notification.space_id == context.space_id,
            Notification.recipient_account_id == context.account_id,
            Notification.in_app_visible.is_(True),
            _projectable_predicate(Notification.target_type, Notification.target_id, context),
        )
        .with_for_update()
    )
    notification = session.execute(statement).scalar_one_or_none()
    if notification is None:
        raise NotFoundError("Notification not found.", ErrorCode.NOTIFICATION_NOT_FOUND)
    if notification.read_at is None:
        notification.read_at = clock.now()
        session.flush()
    return notification


def mark_all_notifications_read(
    session: Session,
    context: AuthorizationContext,
) -> MarkAllResult:
    cutoff = clock.now()
    statement = (
        update(Notification)
        .where(
            Notification.space_id == context.space_id,
            Notification.recipient_account_id == context.account_id,
            Notification.read_at.is_(None),
            Notification.in_app_visible.is_(True),
            Notification.created_at <= cutoff,
            _projectable_predicate(Notification.target_type, Notification.target_id, context),
        )
        .values(read_at=cutoff)
    )
    result = session.execute(statement)
    updated = getattr(result, "rowcount", 0)
    return MarkAllResult(read_through=cutoff, updated=int(updated or 0))
