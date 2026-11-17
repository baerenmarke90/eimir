"""Ephemeral, recipient-authorized fields for encrypted device presentation."""

from __future__ import annotations

import json
import unicodedata
from datetime import timedelta

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.comments.models import Comment
from eimir.core import clock
from eimir.domain.events import EventType
from eimir.engagement import notification_policy, presentation, wish_date_notice
from eimir.engagement.models import (
    WISH_DATE_NOTICE_KINDS,
    EngagementTarget,
    Notification,
    NotificationKind,
)
from eimir.i18n import account_locale, text
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.outbox.models import OutboxEvent

# These kinds deliberately never enter native content presentation.
NEUTRAL_ONLY_KINDS = frozenset({NotificationKind.ONCE_MESSAGE_RECEIVED.value})
# These kinds name the actor but never the target's title or text on a device.
SHARED_NOTE_KINDS = frozenset(
    {NotificationKind.SHARED_NOTE_CREATED.value, NotificationKind.SHARED_NOTE_CHANGED.value}
)


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
    if notification.kind in WISH_DATE_NOTICE_KINDS:
        if not notification_policy.allows_wish_date_preview(notification.kind):
            return ""
        start = wish_date_notice.appointment_start(notification)
        return clock.ensure_utc(start).isoformat() if start is not None else ""
    if (
        notification.kind == NotificationKind.WISH_SELECTION_SHARED.value
        and notification.target_id is not None
    ):
        # Only the number of ideas in the round; never titles or choices.
        size = presentation.selection_sizes(
            session, context, {(EngagementTarget.WISH_SELECTION, notification.target_id)}
        ).get(notification.target_id)
        return str(size) if size else ""
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
            # A sent list may be a surprise (a gift list): never its title (#1907 E2).
            and notification.kind != NotificationKind.COLLECTION_SENT.value
            # A shared note's title is its own words: only who did what (#1969).
            and notification.kind not in SHARED_NOTE_KINDS
            # A garden seed never shows its attached words (#1907 H3).
            and notification.kind != NotificationKind.GARDEN_SEED_ARRIVED.value
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


def wish_date_web_push(
    session: Session, notification: Notification, recipient: Account
) -> dict[str, str] | None:
    """Reuse the same authorization and size bounds for encrypted RFC 8291 devices."""
    if not notification_policy.allows_wish_date_preview(notification.kind):
        return None
    encoded = for_notification(session, notification, digest=False, version=2)
    if encoded is None:
        return None
    preview = json.loads(encoded)
    if not preview["title"] or not preview["body"]:
        return None
    locale = account_locale(recipient)
    name = preview["name"] or text("push.wish_date.partner", locale)
    return {
        "kind": preview["kind"],
        "headline": text(f"push.wish_date.{notification.kind.lower()}", locale, name=name),
        "title": preview["title"],
        "appointmentStart": preview["body"],
    }
