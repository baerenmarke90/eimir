"""Ephemeral, recipient-authorized fields for encrypted native presentation only."""

from __future__ import annotations

import json
import unicodedata
from datetime import timedelta

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.engagement import presentation
from eimir.engagement.models import EngagementTarget, Notification
from eimir.identity.models import Account


def _label(value: str, limit: int) -> str:
    # Plain text only, with bounded display and without directional controls.
    clean = "".join(
        " " if c.isspace() else c
        for c in value
        if c.isspace() or not unicodedata.category(c).startswith("C") or c == "\u200d"
    )
    return " ".join(clean.split())[:limit]


def for_notification(session: Session, notification: Notification, *, digest: bool) -> str | None:
    from eimir.engagement import service

    context = AuthorizationContext(
        account_id=notification.recipient_account_id, space_id=notification.space_id
    )
    if not service.notification_target_available(session, notification, context):
        return None
    actor = (
        session.get(Account, notification.actor_id) if notification.actor_id is not None else None
    )
    name = _label(actor.display_name, 80) if actor is not None and actor.is_active else ""
    title = ""
    if notification.target_type is not None and notification.target_id is not None:
        target_type = EngagementTarget(notification.target_type)
        # A heart moment's text is authored body content, not a title preview.
        if target_type is not EngagementTarget.HEART_MOMENT:
            target = (target_type, notification.target_id)
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
            "v": 1,
            "notificationId": str(notification.id),
            "kind": notification.kind,
            "name": name,
            "title": title,
            "targetType": notification.target_type or "",
            "digest": digest,
            "issuedAt": int(now.timestamp()),
            "expiresAt": int(expires.timestamp()),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
