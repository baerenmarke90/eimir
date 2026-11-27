"""What is new for the reader, as tiles on Wir (#2345 B).

The Wir reel shows the reader's unread, current notices of a closed set of
kinds, newest first, each with a small authorized preview of its content. It
reuses the notification centre's filters, so a notice leaves Wir exactly when
it leaves the centre: once read anywhere, expired or no longer current.

Previews are read afresh through the reader's own authorization, never copied
into the notice: a comment's text, the first open items of a sent list, a
shared note's opening (not when the note asks Wir for its title only) and a
photo reaction's preset. Everything else is told by the notice's kind, its
target title and its existing fields.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.collections.models import Collection, CollectionItem
from eimir.engagement import push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import EngagementTarget, Notification, NotificationKind
from eimir.shared_notes.models import SharedNote

WIR_NOTICE_KINDS = frozenset(
    {
        NotificationKind.WISH_DATE_PROPOSED,
        NotificationKind.WISH_DATE_COUNTERED,
        NotificationKind.WISH_SELECTION_RANDOM_REQUESTED,
        NotificationKind.WISH_SELECTION_SHARED,
        NotificationKind.WISH_SELECTION_READY,
        NotificationKind.COLLECTION_SENT,
        NotificationKind.SHARED_NOTE_CREATED,
        NotificationKind.PICTURE_PING_PONG_FINISHED,
        NotificationKind.HEART_HUNT_FOUND,
        NotificationKind.COMMENT_CREATED,
        NotificationKind.PHOTO_REACTION,
    }
)
"""Things the partner did that wait on the reader (Product Owner, 2026-11-27).

Not on Wir: technical notices, reminders and plan changes (Planen owns them),
gestures (their own receipt), game turns (the game tiles) and once messages
(their own signal)."""

WIR_NOTICE_LIMIT = 12
PREVIEW_ITEMS = 3
_TEXT_LIMIT = 140
_ITEM_LIMIT = 60


@dataclass(frozen=True)
class WirNoticePreview:
    text: str | None = None
    reaction: str | None = None
    items: list[str] = field(default_factory=list)
    more_items: int = 0


def read_wir_notices(
    session: Session, context: AuthorizationContext, *, limit: int = WIR_NOTICE_LIMIT
) -> list[Notification]:
    """The reader's unread, current Wir notices, newest first."""
    return list(
        session.scalars(
            select(Notification)
            .where(
                Notification.space_id == context.space_id,
                Notification.recipient_account_id == context.account_id,
                Notification.read_at.is_(None),
                Notification.in_app_visible.is_(True),
                Notification.kind.in_([kind.value for kind in WIR_NOTICE_KINDS]),
                engagement.current_notification_predicate(session, context),
            )
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
        )
    )


def previews(
    session: Session, context: AuthorizationContext, notices: Sequence[Notification]
) -> dict[UUID, WirNoticePreview]:
    """One preview per notice that has content worth showing."""
    found: dict[UUID, WirNoticePreview] = {}
    for notice in notices:
        preview = _preview(session, context, notice)
        if preview is not None:
            found[notice.id] = preview
    return found


def _preview(
    session: Session, context: AuthorizationContext, notice: Notification
) -> WirNoticePreview | None:
    kind = notice.kind
    if kind == NotificationKind.COMMENT_CREATED.value:
        text = push_preview.comment_text(session, notice, context)
        return WirNoticePreview(text=text) if text else None
    if kind == NotificationKind.PHOTO_REACTION.value:
        reaction = push_preview.reaction_code(session, notice, context)
        return WirNoticePreview(reaction=reaction) if reaction else None
    if notice.target_id is None:
        return None
    if (
        kind == NotificationKind.SHARED_NOTE_CREATED.value
        and notice.target_type == EngagementTarget.SHARED_NOTE.value
    ):
        note = session.scalar(
            readable(SharedNote, context).where(
                SharedNote.id == notice.target_id,
                SharedNote.privacy_class == PrivacyClass.SPACE_SHARED.value,
            )
        )
        # A note that asks Wir for its title only (door codes) shows no opening.
        if note is None or note.wir_title_only or not note.payload.body.strip():
            return None
        return WirNoticePreview(text=push_preview.label(note.payload.body, _TEXT_LIMIT))
    if (
        kind == NotificationKind.COLLECTION_SENT.value
        and notice.target_type == EngagementTarget.COLLECTION.value
    ):
        collection = session.scalar(
            readable(Collection, context).where(Collection.id == notice.target_id)
        )
        if collection is None:
            return None
        open_items = (
            CollectionItem.collection_id == collection.id,
            CollectionItem.completed.is_(False),
        )
        first = session.scalars(
            select(CollectionItem)
            .where(*open_items)
            .order_by(CollectionItem.position)
            .limit(PREVIEW_ITEMS)
        ).all()
        if not first:
            return None
        total = session.scalar(select(func.count(CollectionItem.id)).where(*open_items)) or 0
        return WirNoticePreview(
            items=[push_preview.label(item.payload.title, _ITEM_LIMIT) for item in first],
            more_items=max(0, int(total) - len(first)),
        )
    return None
