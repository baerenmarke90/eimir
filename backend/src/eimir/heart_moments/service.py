"""Domain logic for M2 HeartMoments.

The difference from Memory is visibility. A HeartMoment can be shared or
owner-only, and that choice is a domain operation with its own route - not a
field that a normal update may change incidentally.

The visibility boundary is not redefined anywhere in this file. Reads and
writes go through the same central authorization as every other private
resource; `readable` already carries the condition in the statement before a
filter or ordering is added here. A private HeartMoment is therefore never
loaded for the partner rather than merely being filtered afterwards.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.attachments import service as attachment_service
from eimir.authorization import (
    AuthorizationContext,
    ContentVisibility,
    PrivacyClass,
    privacy_for,
    readable,
    require_readable,
    require_writable,
    require_writable_locked,
    visibility_of,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.create_receipts import service as create_receipts
from eimir.create_receipts.models import CreateReceiptResourceType
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.outbox import service as outbox_service

_HEART_MOMENT_SUBJECT_TYPE = "heart_moment"
_RECEIPT_RESOURCE_TYPE = CreateReceiptResourceType.HEART_MOMENT.value


@dataclass(frozen=True)
class HeartMomentPageResult:
    items: list[HeartMoment]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class HeartMomentCreateResult:
    heart_moment: HeartMoment
    created: bool
    """``False`` when this is a replay of an earlier request with the same
    ``Idempotency-Key``, not a new HeartMoment."""


def _normalize_text(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Heart moment text must not be blank.", "HEART_MOMENT_TEXT_REQUIRED")
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(heart_moment: HeartMoment, expected_version: int) -> None:
    if heart_moment.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(
    session: Session,
    heart_moment: HeartMoment,
    actor_id: UUID,
    event_type: EventType,
    *,
    visibility: ContentVisibility,
) -> None:
    """Record an event without text or emotion.

    `visibility` is the only domain value in the envelope. Consumers need it
    to avoid writing an owner-only event into a partner projection; they do
    not need content for that decision (M2-D06, M2-D16).
    """
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=heart_moment.space_id,
            actor_id=actor_id,
            subject_type=_HEART_MOMENT_SUBJECT_TYPE,
            subject_id=heart_moment.id,
            resource_version=heart_moment.version,
            payload=PublicEventPayload(visibility=visibility),
        ),
    )


def create_heart_moment(
    session: Session,
    context: AuthorizationContext,
    *,
    text: str,
    emotion: HeartEmotion,
    visibility: ContentVisibility,
    happened_on: date,
    attachment_id: UUID | None = None,
) -> HeartMoment:
    heart_moment = HeartMoment(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=privacy_for(visibility).value,
        happened_on=happened_on,
        payload=HeartMomentPayload(text=_normalize_text(text), emotion=emotion),
    )
    if attachment_id is not None:
        _bind(session, context, heart_moment, attachment_id)
    session.add(heart_moment)
    _flush(session)
    _record(
        session,
        heart_moment,
        context.account_id,
        EventType.HEART_MOMENT_CREATED,
        visibility=visibility,
    )
    _flush(session)
    return heart_moment


def create_heart_moment_once(
    session: Session,
    context: AuthorizationContext,
    *,
    idempotency_key: UUID | None,
    text: str,
    emotion: HeartEmotion,
    visibility: ContentVisibility,
    happened_on: date,
    attachment_id: UUID | None = None,
) -> HeartMomentCreateResult:
    """Create a HeartMoment, or return the one an earlier request with this identity created.

    Without a key this is a plain create. With a key, claiming the receipt
    and creating the HeartMoment share this transaction (see
    ``eimir.create_receipts``). Protects a double-tap "save" or a
    lost-response retry from adding the same heart moment twice.
    """
    if idempotency_key is None:
        heart_moment = create_heart_moment(
            session,
            context,
            text=text,
            emotion=emotion,
            visibility=visibility,
            happened_on=happened_on,
            attachment_id=attachment_id,
        )
        return HeartMomentCreateResult(heart_moment, created=True)

    normalized_text = _normalize_text(text)
    request_fingerprint = create_receipts.fingerprint(
        _RECEIPT_RESOURCE_TYPE,
        {
            "text": normalized_text,
            "emotion": emotion.value,
            "visibility": visibility.value,
            "happened_on": happened_on.isoformat(),
            "attachment_id": str(attachment_id) if attachment_id is not None else None,
        },
    )
    receipt_id = create_receipts.claim(
        session,
        context,
        resource_type=_RECEIPT_RESOURCE_TYPE,
        key=idempotency_key,
        request_fingerprint=request_fingerprint,
    )
    if receipt_id is None:
        heart_moment = create_receipts.replay(
            session,
            context,
            HeartMoment,
            resource_type=_RECEIPT_RESOURCE_TYPE,
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
            deleted_error=NotFoundError(
                "The heart moment created by this request no longer exists.",
                ErrorCode.HEART_MOMENT_CREATE_RESULT_DELETED,
            ),
        )
        return HeartMomentCreateResult(heart_moment, created=False)

    heart_moment = create_heart_moment(
        session,
        context,
        text=normalized_text,
        emotion=emotion,
        visibility=visibility,
        happened_on=happened_on,
        attachment_id=attachment_id,
    )
    create_receipts.attach(session, receipt_id, heart_moment.id)
    return HeartMomentCreateResult(heart_moment, created=True)


def get_heart_moment(
    session: Session,
    context: AuthorizationContext,
    heart_moment_id: UUID | str,
) -> HeartMoment:
    return require_readable(session, HeartMoment, context, heart_moment_id)


def update_heart_moment(
    session: Session,
    context: AuthorizationContext,
    heart_moment_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    text: str | None,
    emotion: HeartEmotion | None,
    happened_on: date | None,
    attachment_id: UUID | None = None,
) -> HeartMoment:
    """Change content but explicitly not visibility.

    The `SHARED -> PRIVATE` transition deletes comments and is therefore
    destructive. It remains a separate operation and cannot happen as a side
    effect of a text update.
    """
    heart_moment = require_writable(session, HeartMoment, context, heart_moment_id)
    _ensure_expected_version(heart_moment, expected_version)

    next_text = heart_moment.payload.text
    next_emotion = heart_moment.payload.emotion
    if "text" in changed_fields:
        assert text is not None
        next_text = _normalize_text(text)
    if "emotion" in changed_fields:
        assert emotion is not None
        next_emotion = emotion
    if "happened_on" in changed_fields:
        assert happened_on is not None
        heart_moment.happened_on = happened_on

    if "text" in changed_fields or "emotion" in changed_fields:
        heart_moment.payload = HeartMomentPayload(text=next_text, emotion=next_emotion)

    if "attachment_id" in changed_fields:
        _rebind(session, context, heart_moment, attachment_id)

    _flush(session)
    _record(
        session,
        heart_moment,
        context.account_id,
        EventType.HEART_MOMENT_UPDATED,
        visibility=visibility_of(heart_moment.privacy_class),
    )
    _flush(session)
    return heart_moment


def _delete_dependent_comments(session: Session, heart_moment: HeartMoment) -> None:
    """Delete comments in the same transaction as a privacy transition.

    The mapper cascade in ``comments.cascades`` repeats this deletion after
    the actual privacy UPDATE. This is intentionally redundant: the domain
    hook makes M2-D07 explicit, while the listener also closes the race window
    for a concurrently started comment.
    """
    from eimir.comments import service as comment_service
    from eimir.comments.models import CommentTarget

    comment_service.delete_for_parent(
        session,
        space_id=heart_moment.space_id,
        target_type=CommentTarget.HEART_MOMENT,
        target_id=heart_moment.id,
    )


def _drop_shared_relations(session: Session, heart_moment: HeartMoment) -> None:
    """Remove shared relations during a privacy transition (M3-D09).

    The reasoning is the same as for comments, but stricter: a comment on a
    private moment would be orphaned content, while a shared relation to that
    moment proves its existence. The partner can see the link at the place
    even if they cannot read the moment itself.

    This runs before the class transition and in the same transaction. The
    foreign key in `place_heart_moments` would catch an omitted call by
    carrying the new class into the join row and colliding with its CHECK.
    """
    from eimir.relations import service as relation_service

    relation_service.drop_shared_relations_of_heart_moment(session, heart_moment)


def change_visibility(
    session: Session,
    context: AuthorizationContext,
    heart_moment_id: UUID | str,
    *,
    expected_version: int,
    visibility: ContentVisibility,
) -> HeartMoment:
    """Change visibility atomically together with all consequences.

    The transition and deletion of dependent comments run in the same request
    transaction. If anything fails, the previous state remains fully intact;
    there is no intermediate state where the class is already private while
    comments still exist.

    `PRIVATE -> SHARED` does not restore deleted comments, nor previously
    removed relations (M3-D09). Story-view aggregate state never crosses a
    privacy boundary in either direction: owner-private views allowed by #1021
    are purged before sharing so #971 partner affinity always starts fresh.

    The row is locked exclusively before anything is checked (M3-D26). Without
    the lock, a concurrent relation create could insert a shared relation in
    the window between removing relations and changing the class. The lock is
    acquired either before or after the create path's target `FOR SHARE`; in
    both orders exactly one valid final state remains.
    """
    heart_moment = require_writable_locked(session, HeartMoment, context, heart_moment_id)
    _ensure_expected_version(heart_moment, expected_version)

    target = privacy_for(visibility)
    if heart_moment.privacy_class == target.value:
        # No state transition means no version change and no event. Emitting an
        # event without a change would be a false signal for every consumer.
        return heart_moment

    if target is PrivacyClass.OWNER_ONLY:
        _delete_dependent_comments(session, heart_moment)
        _drop_shared_relations(session, heart_moment)

    # A visibility boundary must also be a behavioral-data boundary. #1021
    # permits the owner to record views while a HeartMoment is private, but
    # those private returns must never become partner-affinity input if the
    # HeartMoment is later shared. Purging on every real visibility transition
    # also preserves the existing SHARED -> PRIVATE cleanup contract.
    from eimir.story import view_service
    from eimir.story.service import StoryKind

    view_service.purge_target(
        session,
        space_id=heart_moment.space_id,
        kind=StoryKind.HEART_MOMENT,
        item_id=heart_moment.id,
    )

    heart_moment.privacy_class = target.value
    _flush(session)
    _record(
        session,
        heart_moment,
        context.account_id,
        EventType.HEART_MOMENT_VISIBILITY_CHANGED,
        visibility=visibility,
    )
    _flush(session)
    return heart_moment


def delete_heart_moment(
    session: Session,
    context: AuthorizationContext,
    heart_moment_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    heart_moment = require_writable_locked(session, HeartMoment, context, heart_moment_id)
    _ensure_expected_version(heart_moment, expected_version)
    actor_id = context.account_id
    visibility = visibility_of(heart_moment.privacy_class)
    from eimir.story import view_service
    from eimir.story.service import StoryKind

    view_service.purge_target(
        session,
        space_id=heart_moment.space_id,
        kind=StoryKind.HEART_MOMENT,
        item_id=heart_moment.id,
    )
    session.delete(heart_moment)
    _flush(session)
    _record(
        session,
        heart_moment,
        actor_id,
        EventType.HEART_MOMENT_DELETED,
        visibility=visibility,
    )
    _flush(session)


def _cursor_binding(
    context: AuthorizationContext, visibility: ContentVisibility | None
) -> dict[str, Any]:
    return {
        "collection": "heart_moments",
        "spaceId": str(context.space_id),
        "visibility": visibility.value if visibility is not None else None,
    }


def _encode_cursor(
    *,
    context: AuthorizationContext,
    visibility: ContentVisibility | None,
    created_at: datetime,
    heart_moment_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, visibility),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(heart_moment_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    visibility: ContentVisibility | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, visibility))
    created_raw = position.get("createdAt")
    heart_moment_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(heart_moment_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        heart_moment_id = UUID(heart_moment_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), heart_moment_id


def list_heart_moments(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    visibility: ContentVisibility | None,
) -> HeartMomentPageResult:
    """Return one page of visible HeartMoments.

    The `visibility` filter narrows the already authorized set; it never
    expands it. `visibility=PRIVATE` therefore returns an empty page to the
    partner rather than somebody else's private rows, because the condition
    from `readable` is already part of the statement.
    """
    statement = readable(HeartMoment, context)
    if visibility is not None:
        statement = statement.where(HeartMoment.privacy_class == privacy_for(visibility).value)
    if cursor is not None:
        created_at, heart_moment_id = _decode_cursor(cursor, context=context, visibility=visibility)
        statement = statement.where(
            or_(
                HeartMoment.created_at < created_at,
                and_(HeartMoment.created_at == created_at, HeartMoment.id < heart_moment_id),
            )
        )

    statement = statement.order_by(HeartMoment.created_at.desc(), HeartMoment.id.desc()).limit(
        limit + 1
    )
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            visibility=visibility,
            created_at=last.created_at,
            heart_moment_id=last.id,
        )
    return HeartMomentPageResult(items=items, next_cursor=next_cursor, has_more=has_more)


def _bind(
    session: Session,
    context: AuthorizationContext,
    heart_moment: HeartMoment,
    attachment_id: UUID,
) -> None:
    """Attach an attachment to this HeartMoment (M2-D03).

    The rules live in the binding module rather than here. Otherwise every
    domain would carry its own subset and differences would only become
    visible once a visibility decision had already gone wrong.
    """
    from eimir.attachments import binding

    locked = binding.lock_for_binding(session, [attachment_id])
    binding.ensure_bindable(
        locked.get(attachment_id),
        space_id=context.space_id,
        account_id=context.account_id,
    )
    binding.ensure_unlinked(session, attachment_id, allow=("HEART_MOMENT", heart_moment.id))
    heart_moment.attachment_id = attachment_id


def _rebind(
    session: Session,
    context: AuthorizationContext,
    heart_moment: HeartMoment,
    attachment_id: UUID | None,
) -> None:
    """Replace or detach an attachment.

    A detached attachment loses its final reference and becomes immediately
    invisible at the domain level under M2-D11; provider cleanup follows
    asynchronously.
    """
    from eimir.attachments.models import Attachment

    previous_id = heart_moment.attachment_id
    if previous_id == attachment_id:
        return

    if attachment_id is None:
        heart_moment.attachment_id = None
    else:
        _bind(session, context, heart_moment, attachment_id)

    if previous_id is not None:
        detached = session.get(Attachment, previous_id)
        if detached is not None:
            attachment_service.mark_for_deletion(session, detached)
