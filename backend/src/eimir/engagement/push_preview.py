"""Ephemeral, recipient-authorized fields for encrypted device presentation."""

from __future__ import annotations

import json
import unicodedata
from datetime import timedelta

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
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
from eimir.places.models import Place
from eimir.plans import discreet
from eimir.plans.models import Plan
from eimir.plugins.loader import loaded_plugins
from eimir.plugins.manifest import PLUGIN_ENGAGEMENT_TARGETS
from eimir.reminders.models import Reminder, ReminderScheduleType, ReminderSource
from eimir.shared_notes.models import SharedNote

# A once message is sealed on the sender's device: the server cannot read it, so
# it never enters native content presentation, in any preview version. A support
# reply (#2189) is operator text about the person's own report; it stays in the
# app and never reaches a device preview either. A ServerAdmin alert (#2314)
# stays neutral below preview v4, whose clients name its topic (#2337).
NEUTRAL_ONLY_KINDS = frozenset(
    {
        NotificationKind.ONCE_MESSAGE_RECEIVED.value,
        NotificationKind.SUPPORT_REPLY.value,
        NotificationKind.OPERATOR_ALERT.value,
    }
)
# Preview v1 and v2 name the actor but never these targets' titles or text.
SHARED_NOTE_KINDS = frozenset(
    {NotificationKind.SHARED_NOTE_CREATED.value, NotificationKind.SHARED_NOTE_CHANGED.value}
)
SUPPORTED_VERSIONS = frozenset({1, 2, 3, 4})
# Preview v3 (#2158, Product Owner 2026-11-21): every kind carries its real
# content, and the device's own lock-screen setting for sensitive content decides
# what a locked screen shows. v1 and v2 keep their exact fields and semantics.
DETAIL_VERSION = 3
# Preview v4 (#2337) keeps every v3 field and meaning. An operator notice then
# names its closed topic code in ``targetType`` (never a name, title or body)
# and may stay valid for up to an hour, so a device whose push connection
# stalled for a while still shows it. Every other kind keeps five minutes.
OPERATOR_VERSION = 4
VALIDITY = timedelta(minutes=5)
OPERATOR_VALIDITY = timedelta(hours=1)
# UTF-8 plaintext bound that keeps the compact JWE within the 3000-character
# provider and native limit (header, IV and tag included) and the native
# 1600-unit plaintext limit. Longer free text is shortened, never dropped.
PLAINTEXT_BYTES = 2000
# The kinds whose v3 preview names when and where the Plan takes place.
_SCHEDULE_KINDS = frozenset(
    {
        NotificationKind.PLAN_CREATED.value,
        NotificationKind.PLAN_CHANGED.value,
        NotificationKind.REMINDER_DUE.value,
    }
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


def _detail_content(
    session: Session, notification: Notification, context: AuthorizationContext
) -> str:
    """The v3 body of the kinds v2 kept without one; every read is reauthorized."""
    kind = notification.kind
    if notification.target_id is None:
        return ""
    if kind in SHARED_NOTE_KINDS and notification.target_type == EngagementTarget.SHARED_NOTE:
        note = session.scalar(
            readable(SharedNote, context).where(
                SharedNote.id == notification.target_id,
                SharedNote.privacy_class == PrivacyClass.SPACE_SHARED.value,
            )
        )
        return _label(note.payload.body, 180) if note is not None else ""
    if (
        kind in {NotificationKind.REMINDER_CREATED.value, NotificationKind.REMINDER_DUE.value}
        and notification.target_type == EngagementTarget.REMINDER
    ):
        reminder = _manual_reminder(session, context, notification.target_id)
        description = reminder.payload.description if reminder is not None else None
        return _label(description, 180) if description else ""
    if kind == NotificationKind.PHOTO_REACTION.value:
        # The closed preset the partner chose; the device shows its symbol.
        memory = session.scalar(
            readable(Memory, context).where(Memory.id == notification.target_id)
        )
        reactions = [
            reaction.reaction.value
            for reaction in (memory.payload.photo_reactions if memory is not None else [])
            if reaction.account_id == notification.actor_id
        ]
        return reactions[-1] if reactions else ""
    return ""


def _manual_reminder(
    session: Session, context: AuthorizationContext, reminder_id: object
) -> Reminder | None:
    return session.scalar(
        readable(Reminder, context).where(
            Reminder.id == reminder_id,
            Reminder.source == ReminderSource.MANUAL.value,
            Reminder.privacy_class == PrivacyClass.SPACE_SHARED.value,
        )
    )


def _shared_plan(session: Session, context: AuthorizationContext, plan_id: object) -> Plan | None:
    return session.scalar(
        readable(Plan, context).where(
            Plan.id == plan_id, Plan.privacy_class == PrivacyClass.SPACE_SHARED.value
        )
    )


def _schedule(
    session: Session, notification: Notification, context: AuthorizationContext
) -> tuple[str, str]:
    """When, and for a Plan also where: a UTC instant or a calendar date, and a place name.

    A discreet Plan shows its date like its overview does, but never its place
    (#1790 F3).
    """
    if notification.target_id is None:
        return "", ""
    if notification.kind in _SCHEDULE_KINDS and notification.target_type == EngagementTarget.PLAN:
        plan = _shared_plan(session, context, notification.target_id)
        if plan is None:
            return "", ""
        when = (
            clock.ensure_utc(plan.planned_start).isoformat()
            if plan.planned_start is not None
            else plan.planned_on.isoformat()
            if plan.planned_on is not None
            else ""
        )
        place = None
        if plan.place_id is not None and not plan.discreet:
            place = session.scalar(
                readable(Place, context).where(
                    Place.id == plan.place_id,
                    Place.privacy_class == PrivacyClass.SPACE_SHARED.value,
                )
            )
        return when, _label(place.payload.name, 80) if place is not None else ""
    if (
        notification.kind == NotificationKind.REMINDER_CREATED.value
        and notification.target_type == EngagementTarget.REMINDER
    ):
        reminder = _manual_reminder(session, context, notification.target_id)
        if (
            reminder is not None
            and reminder.schedule_type == ReminderScheduleType.ONCE.value
            and reminder.once_at is not None
        ):
            return clock.ensure_utc(reminder.once_at).isoformat(), ""
    return "", ""


def _cancelled_plan_title(
    session: Session, notification: Notification, context: AuthorizationContext
) -> str:
    """A cancellation names the Plan only while it still exists; nothing is copied."""
    event = session.get(OutboxEvent, notification.source_event_id)
    if event is None or event.space_id != notification.space_id or event.subject_type != "plan":
        return ""
    plan = _shared_plan(session, context, event.subject_id)
    title = discreet.list_title(plan) if plan is not None else None
    return _label(title, 140) if title else ""


def _fit(value: dict[str, object]) -> dict[str, object]:
    """Shorten free text, longest-lived last, until the envelope fits its bound."""

    def size() -> int:
        return len(_encode(value).encode())

    for field in ("body", "place", "title", "name"):
        current = value.get(field)
        while isinstance(current, str) and current and size() > PLAINTEXT_BYTES:
            # At most four UTF-8 bytes per code point: remove at least the excess.
            limit = len(current) - max(2, (size() - PLAINTEXT_BYTES) // 4 + 1)
            current = _label(current, limit) if limit > 1 else ""
            value[field] = current
    return value


def _encode(value: dict[str, object]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _recipient_nickname_for(
    session: Session, context: AuthorizationContext, actor_id: object
) -> str:
    """The nickname the recipient gave this actor, or an empty string."""
    # Imported here: profiles depends on engagement-adjacent modules.
    from eimir.profiles import service as profiles

    partner_id, row = profiles.partner_nickname(session, context)
    if row is None or partner_id != actor_id:
        return ""
    nickname = row.payload.nickname
    return _label(nickname, 80) if nickname else ""


def for_notification(
    session: Session,
    notification: Notification,
    *,
    digest: bool,
    version: int = 1,
    neutral_reference: bool = False,
) -> str | None:
    from eimir.engagement import service

    neutral = is_neutral(notification.kind, version)
    if neutral and not neutral_reference:
        return None
    if version not in SUPPORTED_VERSIONS:
        return None
    if notification.kind in notification_policy.OPERATOR_KINDS:
        # A ServerAdmin alert (#2314) has no Space to authorize against; the
        # delivery has just checked the recipient. Below v4 it is the neutral
        # notice; v4 names its topic code and nothing else (#2337).
        if neutral:
            return _neutral(notification, digest=digest, version=version)
        return _operator(notification, digest=digest, version=version)
    if notification.space_id is None:
        return None
    context = AuthorizationContext(
        account_id=notification.recipient_account_id, space_id=notification.space_id
    )
    if not service.notification_target_available(session, notification, context):
        return None
    detailed = version >= DETAIL_VERSION
    actor = (
        session.get(Account, notification.actor_id)
        if not neutral and notification.actor_id is not None
        else None
    )
    name = _label(actor.display_name, 80) if actor is not None and actor.is_active else ""
    if actor is not None and actor.is_active:
        # The recipient's own private nickname for their partner wins over the
        # partner's display name. The preview is encrypted for the recipient's
        # own devices, so it never reaches anyone else.
        nickname = _recipient_nickname_for(session, context, actor.id)
        if nickname:
            name = nickname
    title = ""
    plugin_body: str | None = None
    concealed = False
    if not neutral and notification.target_type is not None and notification.target_id is not None:
        target_type = EngagementTarget(notification.target_type)
        target = (target_type, notification.target_id)
        # A discreet Plan never shows its place, description or comments outside
        # its detail. Up to v2 the device preview had no title either (M4-D41,
        # #1790 F3); v3 shows the list title the creator chose for overviews,
        # which is the preview title, never the real one (#2158).
        concealed = bool(presentation.concealed_targets(session, {target}))
        if detailed and target_type in PLUGIN_ENGAGEMENT_TARGETS:
            # Plugin targets (the garden) name only closed codes the device localizes.
            detail = loaded_plugins().push_preview_detail(
                session, context, target_type, notification.target_id
            )
            if detail is not None:
                title, plugin_body = _codes(detail[0]), _codes(detail[1])
        elif detailed:
            # A heart moment presents its own text: the partner wrote it to share.
            title = _label(
                presentation.target_titles(session, context, {target}).get(target, ""), 140
            )
        # A heart moment's text is authored body content, not a title preview.
        elif (
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
    elif detailed and notification.kind == NotificationKind.PLAN_CANCELLED.value:
        title = _cancelled_plan_title(session, notification, context)
    now = clock.now()
    expires = now + VALIDITY
    if notification.expires_at is not None:
        expires = min(expires, clock.ensure_utc(notification.expires_at))
    if expires <= now:
        return None
    value: dict[str, object] = {
        "v": version,
        "notificationId": str(notification.id),
        "kind": notification.kind,
        "name": name,
        "title": title,
        "targetType": "" if neutral else notification.target_type or "",
        "digest": digest,
        "issuedAt": int(now.timestamp()),
        "expiresAt": int(expires.timestamp()),
    }
    if version >= 2:
        body = ""
        if not (digest or neutral or concealed):
            body = _content(session, notification, context)
            if detailed and not body:
                body = (
                    plugin_body
                    if plugin_body is not None
                    else _detail_content(session, notification, context)
                )
        value["body"] = body
    if detailed:
        when, place = ("", "") if digest or neutral else _schedule(session, notification, context)
        value["when"] = when
        value["place"] = place
        return _encode(_fit(value))
    return _encode(value)


def is_neutral(kind: str, version: int) -> bool:
    """Whether ``kind`` reaches a device on this preview version as the neutral notice."""
    if kind in notification_policy.OPERATOR_KINDS and version >= OPERATOR_VERSION:
        return False
    return kind in NEUTRAL_ONLY_KINDS


def validity(kind: str, version: int) -> timedelta:
    """How long a preview of ``kind`` may live in transit and on the device."""
    if kind in notification_policy.OPERATOR_KINDS and version >= OPERATOR_VERSION:
        return OPERATOR_VALIDITY
    return VALIDITY


def operator_topic_code(topic: str) -> str:
    """The closed device code of an operator topic, for example ``SUPPORT_REPORTS``."""
    return topic.upper()


def _operator(notification: Notification, *, digest: bool, version: int) -> str | None:
    """A v4 operator notice: its topic code and validity, no name, title or body."""
    topic = notification.operator_topic
    return _neutral(
        notification,
        digest=digest,
        version=version,
        target_type=operator_topic_code(topic) if topic else "",
    )


def _neutral(
    notification: Notification, *, digest: bool, version: int, target_type: str = ""
) -> str | None:
    """The neutral envelope: the kind and validity only, no name, title or body."""
    now = clock.now()
    expires = now + validity(notification.kind, version)
    if notification.expires_at is not None:
        expires = min(expires, clock.ensure_utc(notification.expires_at))
    if expires <= now:
        return None
    value: dict[str, object] = {
        "v": version,
        "notificationId": str(notification.id),
        "kind": notification.kind,
        "name": "",
        "title": "",
        "targetType": target_type,
        "digest": digest,
        "issuedAt": int(now.timestamp()),
        "expiresAt": int(expires.timestamp()),
    }
    if version >= 2:
        value["body"] = ""
    if version >= DETAIL_VERSION:
        value["when"] = ""
        value["place"] = ""
        return _encode(_fit(value))
    return _encode(value)


def _codes(value: str) -> str:
    """Closed machine codes only: up to three comma-separated ``A_Z`` tokens."""
    tokens = value.split(",") if value else []
    valid = len(tokens) <= 3 and all(
        0 < len(token) <= 24 and token.replace("_", "").isalpha() and token.isupper()
        for token in tokens
    )
    return value if valid else ""


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
