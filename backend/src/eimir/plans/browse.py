"""Bounded anticipation-first browsing; legacy newest-first lists stay compatible."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, case, cast, func, or_, tuple_
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from eimir.authorization import AuthorizationContext, readable
from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.identity.models import Account
from eimir.plans.models import Plan, PlanStatus
from eimir.plans.service import PlanPageResult


def list_overview(
    session: Session,
    context: AuthorizationContext,
    *,
    scope: str,
    cursor: str | None,
    limit: int,
) -> PlanPageResult:
    account = session.get(Account, context.account_id)
    zone = clock.resolve_zone(account.timezone if account else "UTC")
    binding = {
        "collection": "plan-overview-v1",
        "spaceId": str(context.space_id),
        "accountId": str(context.account_id),
        "scope": scope,
        "timezone": str(zone),
    }
    anchor = clock.now()
    position: tuple[int, Decimal, UUID] | None = None
    if cursor:
        raw = cursor_codec.decode(cursor, binding=binding)
        try:
            anchor = datetime.fromisoformat(raw["at"])
            bucket = raw["bucket"]
            order = Decimal(raw["order"])
            identifier = UUID(raw["id"])
            if (
                anchor.tzinfo is None
                or type(bucket) is not int
                or bucket not in {0, 1, 2}
                or not order.is_finite()
            ):
                raise ValueError
            position = bucket, order, identifier
        except (KeyError, TypeError, ValueError, InvalidOperation) as error:
            raise cursor_codec.invalid_cursor() from error

    local_day = anchor.astimezone(zone).date()
    # Calendar dates use a local, timezone-free sorting key, never a stored instant.
    schedule = func.coalesce(
        cast(Plan.planned_on, DateTime), func.timezone(str(zone), Plan.planned_start)
    )
    upcoming = (Plan.status == PlanStatus.PLANNED.value) & or_(
        Plan.planned_on >= local_day, Plan.planned_start >= anchor
    )
    undated = Plan.planned_on.is_(None) & Plan.planned_start.is_(None)
    bucket_key = case((upcoming, 0), (undated, 1), else_=2)
    order_key: ColumnElement[Any] = case(
        (upcoming, func.extract("epoch", schedule)),
        else_=-func.extract("epoch", Plan.updated_at),
    )
    statement = readable(Plan, context)
    if scope == "COMPLETED":
        statement = statement.where(Plan.status == PlanStatus.COMPLETED.value)
        bucket_key = case((Plan.status == PlanStatus.COMPLETED.value, 0), else_=0)
        order_key = -func.extract(
            "epoch",
            func.coalesce(
                cast(Plan.experienced_on, DateTime), func.timezone("UTC", Plan.updated_at)
            ),
        )
    else:
        statement = statement.where(Plan.status != PlanStatus.COMPLETED.value)

    statement = statement.add_columns(bucket_key.label("bucket"), order_key.label("order"))
    if position is not None:
        statement = statement.where(tuple_(bucket_key, order_key, Plan.id) > position)
    rows = session.execute(
        statement.order_by(bucket_key, order_key, Plan.id).limit(limit + 1)
    ).all()
    selected = rows[:limit]
    next_cursor = None
    if len(rows) > limit and selected:
        plan, bucket, order = selected[-1]
        next_cursor = cursor_codec.encode(
            binding=binding,
            position={
                "at": anchor.astimezone(UTC).isoformat(),
                "bucket": bucket,
                "order": str(order),
                "id": str(plan.id),
            },
        )
    return PlanPageResult(
        items=[row[0] for row in selected],
        next_cursor=next_cursor,
        has_more=len(rows) > limit,
    )
