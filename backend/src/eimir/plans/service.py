"""Domain logic for M3 plans and the wish-to-plan lifecycle.

This service owns operations that touch two aggregates at once. Three rules are
important enough to state here.

**Lock order.** The M3 core uses ``Place -> Wish -> Plan``. A plan is always
locked last so two operations cannot deadlock by acquiring the pair in opposite
order. A plan-based entry point may first resolve the plan ID without a lock,
but must then lock the source wish and re-lock/revalidate the plan in the same
transaction. Anything may have changed between the unlocked read and the lock,
so the code verifies state again rather than continuing from the probe.

A request ``placeId`` is resolved *before* the plan for the same reason and held
with ``FOR SHARE``: the place must not disappear between validation and writing
the reference. Place deletion requires ``FOR UPDATE`` and therefore waits.

**Status ownership.** The plan state machine lives here; the wish state machine
lives in ``wishes.service``. This service calls ``plan_created``,
``plan_completed``, and ``plan_returned`` there instead of assigning
``wish.status`` itself. Each wish edge consequently has one implementation that
validates its source state.

**Schedule representation.** A date-only schedule uses ``plannedOn`` (SQL
``DATE``); a timed schedule uses ``plannedStart``/``plannedEnd`` (timezone-aware
instants). The two start representations are mutually exclusive. No lifecycle
path converts a calendar date into a fabricated midnight/noon timestamp.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.authorization import (
    AuthorizationContext,
    readable,
    require_readable,
    require_readable_shared,
    require_writable,
    require_writable_locked,
)
from eimir.core import cursor as cursor_codec
from eimir.core.clock import today_in
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.create_receipts import service as create_receipts
from eimir.create_receipts.models import CreateReceiptResourceType
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity.models import Account
from eimir.outbox import service as outbox_service
from eimir.places.models import Place
from eimir.plans.models import Plan, PlanPayload, PlanStatus, shared_privacy
from eimir.reminders import runtime as reminder_runtime
from eimir.wishes import service as wish_service
from eimir.wishes.models import Wish, WishStatus

_PLAN_SUBJECT_TYPE = "plan"
_RECEIPT_RESOURCE_TYPE = CreateReceiptResourceType.PLAN.value

PLAN_TITLE_REQUIRED = "PLAN_TITLE_REQUIRED"
PLAN_STATUS_TRANSITION_INVALID = "PLAN_STATUS_TRANSITION_INVALID"
PLAN_SOURCE_WISH_REQUIRED = "PLAN_SOURCE_WISH_REQUIRED"
PLAN_HAS_SOURCE_WISH = "PLAN_HAS_SOURCE_WISH"
PLAN_SCHEDULE_START_REQUIRED = "PLAN_SCHEDULE_START_REQUIRED"
PLAN_SCHEDULE_CONFLICT = "PLAN_SCHEDULE_CONFLICT"
PLAN_DATE_RANGE_INVALID = "PLAN_DATE_RANGE_INVALID"
PLAN_EXPERIENCED_ON_REQUIRED = "PLAN_EXPERIENCED_ON_REQUIRED"
PLAN_EXPERIENCED_ON_IN_FUTURE = "PLAN_EXPERIENCED_ON_IN_FUTURE"


@dataclass(frozen=True)
class PlanPageResult:
    items: list[Plan]
    next_cursor: str | None
    has_more: bool


@dataclass(frozen=True)
class WishToPlanResult:
    """Conversion result, including whether this call created the plan.

    ``created`` distinguishes the first call (201) from an idempotent retry
    (200). The response body is the same in both cases; only the status code
    indicates whether this invocation created the plan.
    """

    wish: Wish
    plan: Plan
    created: bool


@dataclass(frozen=True)
class PlanCreateResult:
    plan: Plan
    created: bool
    """``False`` when this is a replay of an earlier request with the same
    ``Idempotency-Key``, not a new Plan."""


@dataclass(frozen=True)
class ReturnToWishResult:
    wish: Wish
    removed_plan_id: UUID


def _normalize_title(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValidationError("Plan title must not be blank.", PLAN_TITLE_REQUIRED)
    return cleaned


def _flush(session: Session) -> None:
    try:
        session.flush()
    except StaleDataError as error:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        ) from error


def _ensure_expected_version(plan: Plan, expected_version: int) -> None:
    if plan.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def _record(session: Session, plan: Plan, actor_id: UUID, event_type: EventType) -> None:
    """Record an event without plan title or description (M3-D13)."""
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=plan.space_id,
            actor_id=actor_id,
            subject_type=_PLAN_SUBJECT_TYPE,
            subject_id=plan.id,
            resource_version=plan.version,
            payload=PublicEventPayload(),
        ),
    )


def _actor_today(session: Session, context: AuthorizationContext) -> date:
    """Return the acting account's local calendar day.

    M3-D04 evaluates ``experiencedOn`` against the *local* day rather than UTC.
    Otherwise users west of UTC could have a valid evening date rejected as a
    future day.
    """
    account = session.get(Account, context.account_id)
    if account is None:
        raise RuntimeError("Acting account disappeared despite an authenticated request.")
    return today_in(account.timezone)


def _validate_experienced_on(
    session: Session, context: AuthorizationContext, value: date | None
) -> date:
    if value is None:
        raise ValidationError(
            "A completed plan needs the day it was experienced.",
            PLAN_EXPERIENCED_ON_REQUIRED,
        )
    if value > _actor_today(session, context):
        raise ValidationError(
            "A plan cannot be experienced in the future.",
            PLAN_EXPERIENCED_ON_IN_FUTURE,
        )
    return value


def _validate_schedule(
    planned_on: date | None,
    planned_start: datetime | None,
    planned_end: datetime | None,
) -> None:
    if planned_on is None and planned_start is None:
        raise ValidationError(
            "Scheduling a plan needs a date or a timed start.",
            PLAN_SCHEDULE_START_REQUIRED,
        )
    if planned_on is not None and planned_start is not None:
        raise ValidationError(
            "A plan schedule cannot be both date-only and timed.",
            PLAN_SCHEDULE_CONFLICT,
        )
    if planned_on is not None and planned_end is not None:
        raise ValidationError(
            "A date-only plan cannot have a timed end.",
            PLAN_SCHEDULE_CONFLICT,
        )
    if planned_end is not None and planned_start is None:
        raise ValidationError(
            "A timed end requires a timed start.",
            PLAN_SCHEDULE_START_REQUIRED,
        )
    if planned_end is not None and planned_start is not None and planned_end < planned_start:
        raise ValidationError(
            "A plan cannot end before it starts.",
            PLAN_DATE_RANGE_INVALID,
        )


def _initial_schedule_status(
    planned_on: date | None,
    planned_start: datetime | None,
    planned_end: datetime | None,
) -> PlanStatus:
    if planned_on is None and planned_start is None and planned_end is None:
        return PlanStatus.IDEA
    _validate_schedule(planned_on, planned_start, planned_end)
    return PlanStatus.PLANNED


def _resolve_place(
    session: Session,
    context: AuthorizationContext,
    place_id: UUID | str | None,
) -> UUID | None:
    """Resolve a place within the space and hold it until commit.

    A place from another space, an unknown ID, and a malformed ID all resolve
    identically to ``PLACE_NOT_FOUND``. A reference must not disclose the
    existence of places in another tenant.
    """
    if place_id is None:
        return None
    return require_readable_shared(session, Place, context, place_id).id


def create_plan(
    session: Session,
    context: AuthorizationContext,
    *,
    title: str,
    description: str | None,
    place_id: UUID | str | None,
    planned_on: date | None = None,
    planned_start: datetime | None = None,
    planned_end: datetime | None = None,
) -> Plan:
    """Create a direct unscheduled, date-only, or timed Plan atomically."""
    status = _initial_schedule_status(planned_on, planned_start, planned_end)
    plan = Plan(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        status=status.value,
        source_wish_id=None,
        place_id=_resolve_place(session, context, place_id),
        planned_on=planned_on,
        planned_start=planned_start,
        planned_end=planned_end,
        payload=PlanPayload(title=_normalize_title(title), description=description),
    )
    session.add(plan)
    _flush(session)
    _record(session, plan, context.account_id, EventType.PLAN_CREATED)
    _flush(session)
    if status == PlanStatus.PLANNED:
        reminder_runtime.reconcile_space(session, context.space_id)
    return plan


def create_plan_once(
    session: Session,
    context: AuthorizationContext,
    *,
    idempotency_key: UUID | None,
    title: str,
    description: str | None,
    place_id: UUID | str | None,
    planned_on: date | None = None,
    planned_start: datetime | None = None,
    planned_end: datetime | None = None,
) -> PlanCreateResult:
    """Create a direct Plan, or return the one an earlier request with this identity created.

    Without a key this is a plain create. With a key, claiming the receipt
    and creating the Plan share this transaction (see
    ``eimir.create_receipts``). Protects a double-tap "save" or a
    lost-response retry from adding the same plan twice.
    """
    if idempotency_key is None:
        plan = create_plan(
            session,
            context,
            title=title,
            description=description,
            place_id=place_id,
            planned_on=planned_on,
            planned_start=planned_start,
            planned_end=planned_end,
        )
        return PlanCreateResult(plan, created=True)

    normalized_title = _normalize_title(title)
    request_fingerprint = create_receipts.fingerprint(
        _RECEIPT_RESOURCE_TYPE,
        {
            "title": normalized_title,
            "description": description,
            "place_id": str(place_id) if place_id is not None else None,
            "planned_on": planned_on.isoformat() if planned_on else None,
            "planned_start": planned_start.isoformat() if planned_start else None,
            "planned_end": planned_end.isoformat() if planned_end else None,
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
        plan = create_receipts.replay(
            session,
            context,
            Plan,
            resource_type=_RECEIPT_RESOURCE_TYPE,
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
            deleted_error=NotFoundError(
                "The plan created by this request no longer exists.",
                ErrorCode.PLAN_CREATE_RESULT_DELETED,
            ),
        )
        return PlanCreateResult(plan, created=False)

    plan = create_plan(
        session,
        context,
        title=normalized_title,
        description=description,
        place_id=place_id,
        planned_on=planned_on,
        planned_start=planned_start,
        planned_end=planned_end,
    )
    create_receipts.attach(session, receipt_id, plan.id)
    return PlanCreateResult(plan, created=True)


def get_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
) -> Plan:
    return require_readable(session, Plan, context, plan_id)


def _lock_plan(session: Session, context: AuthorizationContext, plan_id: UUID | str) -> Plan:
    return require_writable_locked(session, Plan, context, plan_id)


def _lock_plan_and_source_wish(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
) -> tuple[Plan, Wish | None]:
    """Lock both aggregates in canonical order.

    The plan ID is first resolved without a lock only to learn whether there is
    a source wish and which one. The wish is then locked, followed by a fresh
    locked load of the plan.

    Revalidation is essential: while waiting for the wish lock, the plan could
    have been deleted or returned. Continuing with the first object would write
    against state that no longer exists.
    """
    probe = require_writable(session, Plan, context, plan_id)
    source_wish_id = probe.source_wish_id
    if source_wish_id is None:
        return _lock_plan(session, context, plan_id), None

    wish = wish_service.lock(session, context, source_wish_id)
    plan = _lock_plan(session, context, plan_id)
    if plan.source_wish_id != wish.id:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )
    return plan, wish


def update_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
    changed_fields: frozenset[str],
    title: str | None,
    description: str | None,
    place_id: UUID | str | None,
    experienced_on: date | None,
) -> Plan:
    """Correct plan content without changing lifecycle status (M3-D04)."""
    next_place_id = (
        _resolve_place(session, context, place_id) if "place_id" in changed_fields else None
    )

    plan = _lock_plan(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if "place_id" in changed_fields:
        plan.place_id = next_place_id

    next_title = plan.payload.title
    next_description = plan.payload.description
    if "title" in changed_fields:
        assert title is not None
        next_title = _normalize_title(title)
    if "description" in changed_fields:
        next_description = description
    if "experienced_on" in changed_fields:
        if plan.status != PlanStatus.COMPLETED.value:
            raise ConflictError(
                "Only a completed plan carries the day it was experienced.",
                PLAN_STATUS_TRANSITION_INVALID,
            )
        plan.experienced_on = _validate_experienced_on(session, context, experienced_on)

    if "title" in changed_fields or "description" in changed_fields:
        plan.payload = PlanPayload(title=next_title, description=next_description)

    _flush(session)
    _record(session, plan, context.account_id, EventType.PLAN_UPDATED)
    _flush(session)
    return plan


def schedule_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
    planned_on: date | None = None,
    planned_start: datetime | None,
    planned_end: datetime | None,
) -> Plan:
    """Apply ``IDEA -> PLANNED`` or replace a ``PLANNED`` schedule."""
    plan = _lock_plan(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if plan.status == PlanStatus.COMPLETED.value:
        raise ConflictError(
            "A completed plan cannot be scheduled.",
            PLAN_STATUS_TRANSITION_INVALID,
        )

    _validate_schedule(planned_on, planned_start, planned_end)
    plan.planned_on = planned_on
    plan.planned_start = planned_start
    plan.planned_end = planned_end
    plan.status = PlanStatus.PLANNED.value

    _flush(session)
    _record(session, plan, context.account_id, EventType.PLAN_UPDATED)
    _flush(session)
    reminder_runtime.reconcile_space(session, context.space_id)
    return plan


def unschedule_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
) -> Plan:
    """Apply ``PLANNED -> IDEA`` and discard either schedule representation."""
    plan = _lock_plan(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if plan.status != PlanStatus.PLANNED.value:
        raise ConflictError(
            "Only a scheduled plan can be unscheduled.",
            PLAN_STATUS_TRANSITION_INVALID,
        )

    plan.planned_on = None
    plan.planned_start = None
    plan.planned_end = None
    plan.status = PlanStatus.IDEA.value

    _flush(session)
    _record(session, plan, context.account_id, EventType.PLAN_UPDATED)
    _flush(session)
    reminder_runtime.reconcile_space(session, context.space_id)
    return plan


def complete_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
    experienced_on: date | None,
) -> tuple[Plan, Wish | None]:
    """Apply ``IDEA | PLANNED -> COMPLETED`` and complete a source wish too.

    A scheduled plan keeps whichever schedule representation it had as history.
    """
    plan, wish = _lock_plan_and_source_wish(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if plan.status == PlanStatus.COMPLETED.value:
        raise ConflictError(
            "This plan is already completed.",
            PLAN_STATUS_TRANSITION_INVALID,
        )

    plan.experienced_on = _validate_experienced_on(session, context, experienced_on)
    plan.status = PlanStatus.COMPLETED.value

    _flush(session)
    _record(session, plan, context.account_id, EventType.PLAN_COMPLETED)
    _flush(session)

    if wish is not None:
        wish_service.plan_completed(session, wish, context.account_id)

    reminder_runtime.reconcile_space(session, context.space_id)
    return plan, wish


def return_to_wish(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
) -> ReturnToWishResult:
    """Discard the plan and reopen its wish (M3-D03)."""
    plan, wish = _lock_plan_and_source_wish(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if wish is None:
        raise ConflictError(
            "This plan did not come from a wish.",
            PLAN_SOURCE_WISH_REQUIRED,
        )
    if plan.status == PlanStatus.COMPLETED.value:
        raise ConflictError(
            "A completed plan cannot be returned to its wish.",
            PLAN_STATUS_TRANSITION_INVALID,
        )

    removed_plan_id = plan.id
    actor_id = context.account_id
    session.delete(plan)
    _flush(session)
    _record(session, plan, actor_id, EventType.PLAN_DELETED)
    _flush(session)

    wish_service.plan_returned(session, wish, actor_id)
    reminder_runtime.reconcile_space(session, context.space_id)
    return ReturnToWishResult(wish=wish, removed_plan_id=removed_plan_id)


def delete_plan(
    session: Session,
    context: AuthorizationContext,
    plan_id: UUID | str,
    *,
    expected_version: int,
) -> None:
    """Enforce the M3-D05 plan deletion matrix."""
    plan, wish = _lock_plan_and_source_wish(session, context, plan_id)
    _ensure_expected_version(plan, expected_version)

    if wish is not None and plan.status != PlanStatus.COMPLETED.value:
        raise ConflictError(
            "This plan came from a wish. Return it to the wish instead.",
            PLAN_HAS_SOURCE_WISH,
        )

    actor_id = context.account_id
    session.delete(plan)
    _flush(session)
    _record(session, plan, actor_id, EventType.PLAN_DELETED)
    _flush(session)
    reminder_runtime.reconcile_space(session, context.space_id)


def convert_wish_to_plan(
    session: Session,
    context: AuthorizationContext,
    wish_id: UUID | str,
    *,
    expected_version: int,
    title: str | None,
    description: str | None,
    place_id: UUID | str | None,
    planned_on: date | None = None,
    planned_start: datetime | None = None,
    planned_end: datetime | None = None,
) -> WishToPlanResult:
    """Convert one wish into exactly one Plan atomically and idempotently."""
    resolved_place_id = _resolve_place(session, context, place_id)
    status = _initial_schedule_status(planned_on, planned_start, planned_end)

    wish = wish_service.lock(session, context, wish_id)
    existing = session.execute(
        select(Plan).where(Plan.source_wish_id == wish.id).with_for_update()
    ).scalar_one_or_none()

    if wish.status == WishStatus.PLANNED.value:
        if existing is None:
            raise ConflictError(
                "This wish is planned but has no originating plan.",
                wish_service.WISH_PLAN_STATE_CONFLICT,
            )
        return WishToPlanResult(wish=wish, plan=existing, created=False)

    if wish.status == WishStatus.COMPLETED.value:
        raise ConflictError(
            "This wish is already completed.",
            wish_service.WISH_ALREADY_COMPLETED,
        )

    if existing is not None:
        raise ConflictError(
            "This wish is open but already has an originating plan.",
            wish_service.WISH_PLAN_STATE_CONFLICT,
        )

    _ensure_wish_version(wish, expected_version)

    plan = Plan(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=shared_privacy(),
        status=status.value,
        source_wish_id=wish.id,
        place_id=resolved_place_id,
        planned_on=planned_on,
        planned_start=planned_start,
        planned_end=planned_end,
        payload=PlanPayload(
            title=_normalize_title(title if title is not None else wish.payload.title),
            description=description,
        ),
    )
    session.add(plan)
    try:
        _flush(session)
    except IntegrityError as error:
        raise ConflictError(
            "This wish already has an originating plan.",
            wish_service.WISH_HAS_ACTIVE_PLAN,
        ) from error

    _record(session, plan, context.account_id, EventType.PLAN_CREATED)
    _flush(session)

    wish_service.plan_created(session, wish, context.account_id)
    if status == PlanStatus.PLANNED:
        reminder_runtime.reconcile_space(session, context.space_id)
    return WishToPlanResult(wish=wish, plan=plan, created=True)


def _ensure_wish_version(wish: Wish, expected_version: int) -> None:
    if wish.version != expected_version:
        raise ConflictError(
            "The resource was changed since it was loaded.",
            ErrorCode.RESOURCE_VERSION_CONFLICT,
        )


def detach_place(session: Session, place: Place, actor_id: UUID) -> None:
    """Detach all plans from a place that is about to be deleted."""
    affected = list(
        session.execute(
            select(Plan)
            .where(Plan.space_id == place.space_id, Plan.place_id == place.id)
            .order_by(Plan.id)
            .with_for_update()
        )
        .scalars()
        .all()
    )
    for plan in affected:
        plan.place_id = None
    if not affected:
        return
    _flush(session)
    for plan in affected:
        _record(session, plan, actor_id, EventType.PLAN_UPDATED)
    _flush(session)


def _cursor_binding(context: AuthorizationContext, status: PlanStatus | None) -> dict[str, Any]:
    return {
        "collection": "plans",
        "spaceId": str(context.space_id),
        "status": status.value if status is not None else None,
    }


def _encode_cursor(
    *,
    context: AuthorizationContext,
    status: PlanStatus | None,
    created_at: datetime,
    plan_id: UUID,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, status),
        position={
            "createdAt": created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(plan_id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    status: PlanStatus | None,
) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(context, status))
    created_raw = position.get("createdAt")
    plan_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(plan_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        plan_id = UUID(plan_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), plan_id


def list_plans(
    session: Session,
    context: AuthorizationContext,
    *,
    cursor: str | None,
    limit: int,
    status: PlanStatus | None,
) -> PlanPageResult:
    """List newest plans first, ordered by metadata like wishes."""
    statement = readable(Plan, context)
    if status is not None:
        statement = statement.where(Plan.status == status.value)
    if cursor is not None:
        created_at, plan_id = _decode_cursor(cursor, context=context, status=status)
        statement = statement.where(
            or_(
                Plan.created_at < created_at,
                and_(Plan.created_at == created_at, Plan.id < plan_id),
            )
        )

    statement = statement.order_by(Plan.created_at.desc(), Plan.id.desc()).limit(limit + 1)
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
            plan_id=last.id,
        )
    return PlanPageResult(items=items, next_cursor=next_cursor, has_more=has_more)
