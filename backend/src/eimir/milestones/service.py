"""Domain logic for M2 milestones.

Deliberately close to ``memories.service``: the same author-only write rule
(M2-D25 confirms it for milestones), the same concurrency, and the same signed
cursor. Differences are intentional domain semantics: ``happenedOn`` is
required here, so the year filter needs no fallback to ``createdAt``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_writable,
    require_writable_locked,
)
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.create_receipts import service as create_receipts
from eimir.create_receipts.models import CreateReceiptResourceType
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.milestones.models import Milestone, MilestonePayload, shared_privacy
from eimir.outbox import service as outbox_service

_MILESTONE_SUBJECT_TYPE = "milestone"
_RECEIPT_RESOURCE_TYPE = CreateReceiptResourceType.MILESTONE.value


@dataclass(frozen=True)
class MilestonePageResult:
    items: list[Milestone]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class MilestoneCreateResult:
    milestone: Milestone
    created: bool
    """``False`` when this is a replay of an earlier request with the same
    ``Idempotency-Key``, not a new Milestone."""


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Milestone title must not be blank.", "MILESTONE_TITLE_REQUIRED")
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(milestone: Milestone, expected_version: int) -> None:
    if milestone.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(session: Session, milestone: Milestone, actor_id: UUID, event_type: EventType) -> None:
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=milestone.space_id,
            actor_id=actor_id,
            subject_type=_MILESTONE_SUBJECT_TYPE,
            subject_id=milestone.id,
            resource_version=milestone.version,
            payload=PublicEventPayload(),
        ),
    )


def create_milestone(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    body: str | None,
    happened_on: date,
) -> Milestone:
    milestone = Milestone(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        happened_on=happened_on,
        payload=MilestonePayload(title=_normalize_title(title), body=body),
    )
    session.add(milestone)
    _flush(session)
    _record(session, milestone, context.account_id, EventType.MILESTONE_CREATED)
    _flush(session)
    return milestone


def create_milestone_once(
    session: Session,
    context: AuthorizationContext,
    *,
    idempotency_key: UUID | None,
    title: str,
    body: str | None,
    happened_on: date,
) -> MilestoneCreateResult:
    """Create a Milestone, or return the one an earlier request with this identity created.

    Without a key this is a plain create. With a key, claiming the receipt
    and creating the Milestone share this transaction (see
    ``eimir.create_receipts``). Protects a double-tap "save" or a
    lost-response retry from adding the same milestone twice.
    """
    if idempotency_key is None:
        milestone = create_milestone(
            session, context, title=title, body=body, happened_on=happened_on
        )
        return MilestoneCreateResult(milestone, created=True)

    normalized_title = _normalize_title(title)
    request_fingerprint = create_receipts.fingerprint(
        _RECEIPT_RESOURCE_TYPE,
        {
            "title": normalized_title,
            "body": body,
            "happened_on": happened_on.isoformat(),
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
        milestone = create_receipts.replay(
            session,
            context,
            Milestone,
            resource_type=_RECEIPT_RESOURCE_TYPE,
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
            deleted_error=NotFoundError(
                "The milestone created by this request no longer exists.",
                ErrorCode.MILESTONE_CREATE_RESULT_DELETED,
            ),
        )
        return MilestoneCreateResult(milestone, created=False)

    milestone = create_milestone(
        session, context, title=normalized_title, body=body, happened_on=happened_on
    )
    create_receipts.attach(session, receipt_id, milestone.id)
    return MilestoneCreateResult(milestone, created=True)


def get_milestone(
    session: Session,
    context: AuthorizationContext,
    milestone_id: UUID | str,
) -> Milestone:
    return require_readable(session, Milestone, context, milestone_id)


def update_milestone(
    session: Session,
    context: AuthorizationContext,
    milestone_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    body: str | None,
    happened_on: date | None,
) -> Milestone:
    milestone = require_writable(session, Milestone, context, milestone_id)
    _ensure_expected_version(milestone, expected_version)

    next_title = milestone.payload.title
    next_body = milestone.payload.body
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    if "body" in changed_fields:
        # Unlike title, body may explicitly be cleared.
        next_body = body
    if "happened_on" in changed_fields:
        assert happened_on is not None
        milestone.happened_on = happened_on

    if "title" in changed_fields or "body" in changed_fields:
        milestone.payload = MilestonePayload(title=next_title, body=next_body)

    _flush(session)
    _record(session, milestone, context.account_id, EventType.MILESTONE_UPDATED)
    _flush(session)
    return milestone


def delete_milestone(
    session: Session,
    context: AuthorizationContext,
    milestone_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    milestone = require_writable_locked(session, Milestone, context, milestone_id)
    _ensure_expected_version(milestone, expected_version)
    actor_id = context.account_id
    from eimir.story import view_service
    from eimir.story.service import StoryKind

    view_service.purge_target(
        session,
        space_id=milestone.space_id,
        kind=StoryKind.MILESTONE,
        item_id=milestone.id,
    )
    session.delete(milestone)
    _flush(session)
    _record(session, milestone, actor_id, EventType.MILESTONE_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext, year: int | None) -> dict[str, Any]:
    return {"collection": "milestones", "spaceId": str(context.space_id), "year": year}


def _encode_cursor(
    *,
    context: AuthorizationContext,
    year: int | None,
    created_at: datetime,
    milestone_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, year),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(milestone_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    year: int | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, year))
    created_raw = position.get("createdAt")
    milestone_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(milestone_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        milestone_id = UUID(milestone_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), milestone_id


def list_milestones(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    year: int | None,
) -> MilestonePageResult:
    statement = readable(Milestone, context)
    if year is not None:
        # No createdAt fallback as for Memory: ``happenedOn`` is required, so
        # every milestone has a domain date.
        statement = statement.where(
            and_(
                Milestone.happened_on >= date(year, 1, 1),
                Milestone.happened_on < date(year + 1, 1, 1),
            )
        )
    if cursor is not None:
        created_at, milestone_id = _decode_cursor(cursor, context=context, year=year)
        statement = statement.where(
            or_(
                Milestone.created_at < created_at,
                and_(Milestone.created_at == created_at, Milestone.id < milestone_id),
            )
        )

    statement = statement.order_by(Milestone.created_at.desc(), Milestone.id.desc()).limit(
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
            year=year,
            created_at=last.created_at,
            milestone_id=last.id,
        )
    return MilestonePageResult(items=items, next_cursor=next_cursor, has_more=has_more)
