"""Ephemeral, recipient-authorized fields for encrypted native presentation only."""

from __future__ import annotations

import json
import unicodedata
from datetime import timedelta

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.comments.models import Comment
from eimir.core import clock
from eimir.domain.events import EventType
from eimir.engagement import presentation
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.outbox.models import OutboxEvent

# These kinds deliberately never enter native content presentation.
NEUTRAL_ONLY_KINDS = frozenset({NotificationKind.ONCE_MESSAGE_RECEIVED.value})


def _label(value: str, limit: int) -> str:
    # Plain text only, with bounded display and without directional controls.
    clean = "".join(
        " " if c.isspace() else c
        for c in value
        if c.isspace() or not unicodedata.category(c).startswith("C") or c == "\u200d"
    )
    normalized = " ".join(clean.split())
    return normalized if len(normalized) <= limit else normalized[: limit - 1].rstrip() + "…"


def _content(session: Session, notification: Notification, context: AuthorizationContext) -> str:
    if notification.kind == NotificationKind.COMMENT_CREATED.value:
        # The parent was reauthorized by for_notification. Read only the exact
        # current comment referenced by this event, never the latest sibling.
        comment = session.scalar(
            readable(Comment, context)
            .join(OutboxEvent, OutboxEvent.subject_id == Comment.id)
            .where(
                OutboxEvent.id == notification.source_event_id,
                OutboxEvent.event_type == EventType.COMMENT_CREATED.value,
                OutboxEvent.space_id == notification.space_id,
                OutboxEvent.actor_id == notification.actor_id,
                Comment.owner_id == notification.actor_id,
                Comment.target_type == notification.target_type,
                Comment.target_id == notification.target_id,
            )
        )
        return _label(comment.payload.body, 180) if comment is not None else ""
    if (
        notification.kind == NotificationKind.COUPLE_EXPERIENCE_SHARED.value
        and notification.target_type == EngagementTarget.MEMORY.value
    ):
        memory = session.scalar(
            readable(Memory, context).where(
                Memory.id == notification.target_id,
                Memory.owner_id == notification.actor_id,
                Memory.experience_kind.is_not(None),
            )
        )
        return _label(memory.payload.body, 180) if memory is not None else ""
    return ""


def for_notification(
    session: Session,
    notification: Notification,
    *,
    digest: bool,
    version: int = 1,
    neutral_reference: bool = False,
) -> str | None:
    from eimir.engagement import service

    neutral = notification.kind in NEUTRAL_ONLY_KINDS
    if neutral and not neutral_reference:
        return None
    context = AuthorizationContext(
        account_id=notification.recipient_account_id, space_id=notification.space_id
    )
    if version not in {1, 2} or not service.notification_target_available(
        session, notification, context
    ):
        return None
    actor = (
        session.get(Account, notification.actor_id)
        if not neutral and notification.actor_id is not None
        else None
    )
    name = _label(actor.display_name, 80) if actor is not None and actor.is_active else ""
    title = ""
    concealed = False
    if not neutral and notification.target_type is not None and notification.target_id is not None:
        target_type = EngagementTarget(notification.target_type)
        target = (target_type, notification.target_id)
        # A discreet Plan keeps device previews generic: no title and no
        # comment text, not even the list title (M4-D41, #1790 F3).
        concealed = bool(presentation.concealed_targets(session, {target}))
        # A heart moment's text is authored body content, not a title preview.
        if (
            target_type is not EngagementTarget.HEART_MOMENT
            and not concealed
            and notification.kind != NotificationKind.WISH_REMINDER_DUE.value
            and not (
                notification.kind == NotificationKind.REMINDER_DUE.value
                and target_type is EngagementTarget.PLAN
            )
        ):
            title = _label(
                presentation.target_titles(session, context, {target}).get(target, ""), 140
            )
    now = clock.now()
    expires = now + timedelta(minutes=5)
    if notification.expires_at is not None:
        expires = min(expires, clock.ensure_utc(notification.expires_at))
    if expires <= now:
        return None
    return json.dumps(
        {
            "v": version,
            "notificationId": str(notification.id),
            "kind": notification.kind,
            "name": name,
            "title": title,
            "targetType": "" if neutral else notification.target_type or "",
            "digest": digest,
            "issuedAt": int(now.timestamp()),
            "expiresAt": int(expires.timestamp()),
            **(
                {
                    "body": _content(session, notification, context)
                    if not (digest or neutral or concealed)
                    else ""
                }
                if version == 2
                else {}
            ),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
