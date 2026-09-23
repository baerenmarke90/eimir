"""Domain logic for M3 wishes.

The structure deliberately mirrors ``milestones.service``: the same signed
cursor, version check, and outbox. Two domain rules differ and are therefore
made explicit here.

First, write ownership. A wish belongs to the couple rather than the person who
first typed it (M3-D01). That policy lives on the model as ``shared_write``;
``require_writable`` therefore permits both partners without a service-specific
exception.

Second, status. ``Wish.status`` is not a client-settable field:
``OPEN -> PLANNED`` happens only through wish-to-plan conversion,
``PLANNED -> OPEN`` through ``return-to-wish``,
``PLANNED -> COMPLETED`` through completion of the originating plan, and
``OPEN -> COMPLETED`` only through the explicit direct-completion command.

The plan service triggers the three plan-owned edges because only it knows the
plan. The transitions themselves still live here: ``plan_created``,
``plan_completed``, ``plan_returned``, and ``complete_direct_wish`` are the only
functions that write ``status``, and each validates its own source state. PATCH
cannot bypass them, and another caller cannot move the state machine along an
alternate path.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
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
from eimir.outbox import service as outbox_service
from eimir.plans.models import Plan
from eimir.wishes.models import Wish, WishPayload, WishStatus, shared_privacy

_RECEIPT_RESOURCE_TYPE = CreateReceiptResourceType.WISH.value

_WISH_SUBJECT_TYPE = "wish"

WISH_TITLE_REQUIRED = "WISH_TITLE_REQUIRED"
WISH_HAS_ACTIVE_PLAN = "WISH_HAS_ACTIVE_PLAN"
WISH_HAS_COMPLETED_PLAN = "WISH_HAS_COMPLETED_PLAN"
WISH_ALREADY_COMPLETED = "WISH_ALREADY_COMPLETED"
WISH_PLAN_STATE_CONFLICT = "WISH_PLAN_STATE_CONFLICT"
WISH_STATUS_TRANSITION_INVALID = "WISH_STATUS_TRANSITION_INVALID"


@dataclass(frozen=True)
class WishPageResult:
    items: list[Wish]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class WishCreateResult:
    wish: Wish
    created: bool
    """``False`` when this is a replay of an earlier request with the same
    ``Idempotency-Key``, not a new Wish."""


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Wish title must not be blank.", WISH_TITLE_REQUIRED)
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(wish: Wish, expected_version: int) -> None:
    if wish.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def record_event(session: Session, wish: Wish, actor_id: UUID, event_type: EventType) -> None:
    """Record an event without the wish title.

    M3-D13: titles do not belong in the outbox, logs, or analytics. Only IDs,
    actor, version, and event type leave this boundary.
    """
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=wish.space_id,
            actor_id=actor_id,
            subject_type=_WISH_SUBJECT_TYPE,
            subject_id=wish.id,
            resource_version=wish.version,
            payload=PublicEventPayload(),
        ),
    )


def create_wish(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
) -> Wish:
    """Create a wish in the ``OPEN`` state.

    Status never comes from the request. A client that includes it is rejected
    at the API boundary; this service has no parameter through which it could
    enter.
    """
    wish = Wish(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        status=WishStatus.OPEN.value,
        payload=WishPayload(title=_normalize_title(title)),
    )
    session.add(wish)
    _flush(session)
    record_event(session, wish, context.account_id, EventType.WISH_CREATED)
    _flush(session)
    return wish


def create_wish_once(
    session: Session,
    context: AuthorizationContext,
    *,
    idempotency_key: UUID | None,
    title: str,
) -> WishCreateResult:
    """Create a Wish, or return the one an earlier request with this identity created.

    Without a key this is a plain create. With a key, claiming the receipt
    and creating the Wish share this transaction (see
    ``eimir.create_receipts``). Protects a double-tap "save" or a lost-response
    retry from adding the same wish to the shared list twice.
    """
    if idempotency_key is None:
        wish = create_wish(session, context, title=title)
        return WishCreateResult(wish, created=True)

    normalized_title = _normalize_title(title)
    request_fingerprint = create_receipts.fingerprint(
        _RECEIPT_RESOURCE_TYPE, {"title": normalized_title}
    )
    receipt_id = create_receipts.claim(
        session,
        context,
        resource_type=_RECEIPT_RESOURCE_TYPE,
        key=idempotency_key,
        request_fingerprint=request_fingerprint,
    )
    if receipt_id is None:
        wish = create_receipts.replay(
            session,
            context,
            Wish,
            resource_type=_RECEIPT_RESOURCE_TYPE,
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
            deleted_error=NotFoundError(
                "The wish created by this request no longer exists.",
                ErrorCode.WISH_CREATE_RESULT_DELETED,
            ),
        )
        return WishCreateResult(wish, created=False)

    wish = create_wish(session, context, title=normalized_title)
    create_receipts.attach(session, receipt_id, wish.id)
    return WishCreateResult(wish, created=True)


def get_wish(
    session: Session,
    context: AuthorizationContext,
    wish_id: UUID | str,
) -> Wish:
    return require_readable(session, Wish, context, wish_id)


def update_wish(
    session: Session,
    context: AuthorizationContext,
    wish_id: UUID | str,
    *,
    expected_version: int,
    title: str,
) -> Wish:
    """Correct the title and nothing else.

    This is a versioned content update and does not change status (M3-D02).
    ``createdBy``, ``spaceId``, and ``status`` are not function parameters, so
    a request has no path to rewrite them.
    """
    wish = require_writable(session, Wish, context, wish_id)
    _ensure_expected_version(wish, expected_version)

    wish.payload = WishPayload(title=_normalize_title(title))

    _flush(session)
    record_event(session, wish, context.account_id, EventType.WISH_UPDATED)
    _flush(session)
    return wish


def lock(session: Session, context: AuthorizationContext, wish_id: UUID | str) -> Wish:
    """Load and lock a wish for a lifecycle operation.

    The canonical lock order is ``Wish -> Plan`` (M3-D02). Any operation that
    touches both locks here first, preventing two requests from waiting on each
    other in opposite order.

    Authorization happens before locking so an outsider cannot lock a row they
    are not allowed to see. If it disappears in the gap, the guard responds as
    it would for an unknown ID.
    """
    return require_writable_locked(session, Wish, context, wish_id)


def complete_direct_wish(
    session: Session,
    context: AuthorizationContext,
    wish_id: UUID | str,
    *,
    expected_version: int,
) -> Wish:
    """Apply ``OPEN -> COMPLETED`` when a wish happened without a Plan.

    This is deliberately a dedicated lifecycle command instead of a writable
    ``status`` field. A Wish that has entered the Plan lifecycle remains owned
    by that lifecycle, including completion of its originating Plan.
    """
    wish = lock(session, context, wish_id)
    _ensure_expected_version(wish, expected_version)
    plan = session.execute(
        select(Plan).where(Plan.source_wish_id == wish.id).with_for_update()
    ).scalar_one_or_none()

    if wish.status == WishStatus.COMPLETED.value:
        raise ConflictError(
            "This wish is already completed.",
            WISH_ALREADY_COMPLETED,
        )

    if wish.status == WishStatus.PLANNED.value:
        if plan is None:
            raise ConflictError(
                "This wish is planned but has no originating plan.",
                WISH_PLAN_STATE_CONFLICT,
            )
        raise ConflictError(
            "This wish has an active plan. Complete the plan instead.",
            WISH_HAS_ACTIVE_PLAN,
        )

    if plan is not None:
        raise ConflictError(
            "This wish is open but still has an originating plan.",
            WISH_PLAN_STATE_CONFLICT,
        )

    wish.status = WishStatus.COMPLETED.value
    _flush(session)
    record_event(session, wish, context.account_id, EventType.WISH_COMPLETED)
    _flush(session)
    return wish


def plan_created(session: Session, wish: Wish, actor_id: UUID) -> None:
    """Apply ``OPEN -> PLANNED``, the only edge triggered by plan creation."""
    if wish.status != WishStatus.OPEN.value:
        raise ConflictError(
            "This wish is not open.",
            WISH_STATUS_TRANSITION_INVALID,
        )
    wish.status = WishStatus.PLANNED.value
    _flush(session)
    record_event(session, wish, actor_id, EventType.WISH_PLANNED)
    _flush(session)


def plan_completed(session: Session, wish: Wish, actor_id: UUID) -> None:
    """Apply ``PLANNED -> COMPLETED`` only from originating-plan completion."""
    if wish.status != WishStatus.PLANNED.value:
        raise ConflictError(
            "This wish is not planned.",
            WISH_STATUS_TRANSITION_INVALID,
        )
    wish.status = WishStatus.COMPLETED.value
    _flush(session)
    record_event(session, wish, actor_id, EventType.WISH_COMPLETED)
    _flush(session)


def plan_returned(session: Session, wish: Wish, actor_id: UUID) -> None:
    """Apply ``PLANNED -> OPEN`` only from originating-plan return-to-wish.

    The wish deliberately receives no content back from the plan (M3-D03).
    Plan title and description may have diverged; copying either silently into
    the wish would overwrite data nobody asked to replace.
    """
    if wish.status != WishStatus.PLANNED.value:
        raise ConflictError(
            "This wish is not planned.",
            WISH_STATUS_TRANSITION_INVALID,
        )
    wish.status = WishStatus.OPEN.value
    _flush(session)
    record_event(session, wish, actor_id, EventType.WISH_REOPENED)
    _flush(session)


def _ensure_deletable(session: Session, wish: Wish) -> None:
    """Enforce the M3-D05 wish deletion matrix.

    | Wish        | originating Plan | Result                       |
    |-------------|------------------|------------------------------|
    | ``OPEN``      | no               | allowed                      |
    | ``OPEN``      | yes              | ``WISH_PLAN_STATE_CONFLICT`` |
    | ``PLANNED``   | yes              | ``WISH_HAS_ACTIVE_PLAN``     |
    | ``PLANNED``   | no               | ``WISH_PLAN_STATE_CONFLICT`` |
    | ``COMPLETED`` | yes              | ``WISH_HAS_COMPLETED_PLAN``  |
    | ``COMPLETED`` | no               | allowed                      |

    The two ``WISH_PLAN_STATE_CONFLICT`` rows describe states that should never
    occur. They still become a domain conflict rather than a 500 so the
    response names the inconsistent state instead of crashing over it.

    The plan is read under lock. Otherwise ``return-to-wish`` or conversion
    could interleave between this check and deletion, allowing the wish to be
    removed after a check that was valid only momentarily. Lock ordering remains
    correct because the wish is already locked at this point.
    """
    plan = session.execute(
        select(Plan).where(Plan.source_wish_id == wish.id).with_for_update()
    ).scalar_one_or_none()

    if wish.status == WishStatus.PLANNED.value:
        if plan is None:
            raise ConflictError(
                "This wish is planned but has no originating plan.",
                WISH_PLAN_STATE_CONFLICT,
            )
        raise ConflictError(
            "This wish has an active plan. Use the plan instead.",
            WISH_HAS_ACTIVE_PLAN,
        )

    if plan is None:
        return

    if wish.status == WishStatus.COMPLETED.value:
        raise ConflictError(
            "This wish still has its completed plan. Delete the plan first.",
            WISH_HAS_COMPLETED_PLAN,
        )

    raise ConflictError(
        "This wish is open but still has an originating plan.",
        WISH_PLAN_STATE_CONFLICT,
    )


def delete_wish(
    session: Session,
    context: AuthorizationContext,
    wish_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    wish = lock(session, context, wish_id)
    _ensure_expected_version(wish, expected_version)
    _ensure_deletable(session, wish)
    actor_id = context.account_id
    session.delete(wish)
    _flush(session)
    record_event(session, wish, actor_id, EventType.WISH_DELETED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext, status: WishStatus | None) -> dict[str, Any]:
    return {
        "collection": "wishes",
        "spaceId": str(context.space_id),
        "status": status.value if status is not None else None,
    }


def _encode_cursor(
    *,
    context: AuthorizationContext,
    status: WishStatus | None,
    created_at: datetime,
    wish_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, status),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(wish_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    status: WishStatus | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, status))
    created_raw = position.get("createdAt")
    wish_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(wish_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        wish_id = UUID(wish_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), wish_id


def list_wishes(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    status: WishStatus | None,
) -> WishPageResult:
    """List newest wishes first, matching memory and milestone ordering.

    Ordering uses ``createdAt`` and ID rather than title. A sort requiring
    plaintext could not survive a later move to client-side encryption.
    """
    statement = readable(Wish, context)
    if status is not None:
        statement = statement.where(Wish.status == status.value)
    if cursor is not None:
        created_at, wish_id = _decode_cursor(cursor, context=context, status=status)
        statement = statement.where(
            or_(
                Wish.created_at < created_at,
                and_(Wish.created_at == created_at, Wish.id < wish_id),
            )
        )

    statement = statement.order_by(Wish.created_at.desc(), Wish.id.desc()).limit(limit + 1)
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            context=context,
            status=status,
            created_at=last.created_at,
            wish_id=last.id,
        )
    return WishPageResult(items=items, next_cursor=next_cursor, has_more=has_more)
