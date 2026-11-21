"""Space-authorized recap reads, periods and editorial writes (Core).

Reading a stored edition, listing the periods with shared material and the
members' own reflections stay Core on every server. Composing new editions
(the selection pool, requests, preparation, late entries and versions) lives in
``eimir.recaps.composer``, which this module must not import.
"""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core import clock
from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    NotFoundError,
    PremiumEntitlementRequiredError,
    ValidationError,
)
from eimir.core.ids import parse_id
from eimir.entitlements import service as entitlements
from eimir.identity.models import Account
from eimir.recaps.models import (
    RecapEdition,
    RecapKind,
    RecapReflection,
    RecapReflectionPayload,
)
from eimir.recaps.presentation import source_metadata
from eimir.relationship.models import Membership, Space, SpaceConfiguration

CAPABILITY = "relationship.passport"


def can_compose(
    session: Session, context: AuthorizationContext, *, lock_grants: bool = False
) -> bool:
    return entitlements.has_capability(
        session, context.space_id, CAPABILITY, lock_grants=lock_grants
    )


def ensure_capability(session: Session, space_id: UUID, capability: str) -> None:
    if not entitlements.has_capability(session, space_id, capability):
        raise PremiumEntitlementRequiredError(capability)


def calendar_context(session: Session, context: AuthorizationContext) -> tuple[str, str]:
    space = session.get(Space, context.space_id)
    configuration = session.scalar(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == context.space_id)
    )
    founder = (
        session.get(Account, space.configuration_manager_account_id)
        if space and space.configuration_manager_account_id
        else None
    )
    if founder is None:
        founder = session.scalar(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(Membership.space_id == context.space_id)
            .order_by(Membership.created_at, Membership.id)
            .limit(1)
        )
    zone = (
        configuration.daily_context_timezone
        if configuration and configuration.daily_context_timezone
        else founder.timezone
        if founder
        else "UTC"
    )
    return clock.resolve_zone(zone).key, founder.locale if founder else "en"


def periods(session: Session, context: AuthorizationContext, today: date) -> list[dict[str, Any]]:
    source = source_metadata(context)
    from eimir.memories.periods import merged_intervals

    ranges = session.execute(
        select(source.c.day, source.c.through).where(source.c.day <= today).distinct()
    ).all()
    intervals = merged_intervals(
        [
            (
                max(starts, date(1900, 1, 1)).year * 12 + max(starts, date(1900, 1, 1)).month - 1,
                min(through, today).year * 12 + min(through, today).month - 1,
            )
            for starts, through in ranges
        ]
    )
    months = {
        (month // 12, month % 12 + 1)
        for first, last in intervals
        for month in range(first, last + 1)
    }
    keys = {(RecapKind.MONTH, int(year), int(month)) for year, month in months}
    keys |= {(RecapKind.YEAR, int(year), 0) for year, _ in months}
    keys |= {(RecapKind.MONTH, today.year, today.month), (RecapKind.YEAR, today.year, 0)}
    return [
        {"kind": kind, "year": year, "month": month}
        for kind, year, month in sorted(
            keys, key=lambda value: (value[1], value[2], value[0]), reverse=True
        )
    ]


def edition(
    session: Session,
    context: AuthorizationContext,
    edition_id: UUID | str,
    *,
    write: bool = False,
    version: int | None = None,
) -> RecapEdition:
    parsed_id = parse_id(str(edition_id))
    if parsed_id is None:
        raise NotFoundError("Recap not found.", "RESOURCE_NOT_FOUND")
    statement = select(RecapEdition).where(
        RecapEdition.id == parsed_id, RecapEdition.space_id == context.space_id
    )
    if write:
        statement = statement.with_for_update()
    value = session.scalar(statement.execution_options(populate_existing=True))
    if value is None:
        raise NotFoundError("Recap not found.", "RESOURCE_NOT_FOUND")
    if version is not None and value.version != version:
        raise ConflictError("The recap changed. Read it again.", ErrorCode.VERSION_CONFLICT)
    return value


def unprepared(
    session: Session, context: AuthorizationContext, today: date
) -> list[dict[str, Any]]:
    """Periods with shared material that have no edition yet, newest first."""
    existing = {
        (kind, year, month)
        for kind, year, month in session.execute(
            select(RecapEdition.kind, RecapEdition.year, RecapEdition.month)
            .where(RecapEdition.space_id == context.space_id)
            .distinct()
        )
    }
    return [
        item
        for item in periods(session, context, today)
        if (item["kind"].value, item["year"], item["month"]) not in existing
    ]


def write_reflection(
    session: Session,
    context: AuthorizationContext,
    value: RecapEdition,
    text_value: str,
    shared: bool,
    expected_version: int,
) -> None:
    if not text_value.strip():
        raise ValidationError("Reflection must contain text.", ErrorCode.VALIDATION_FAILED)
    privacy = PrivacyClass.SPACE_SHARED.value if shared else PrivacyClass.OWNER_ONLY.value
    existing = session.scalar(
        select(RecapReflection)
        .where(
            RecapReflection.edition_id == value.id,
            RecapReflection.space_id == context.space_id,
            RecapReflection.owner_id == context.account_id,
            RecapReflection.privacy_class == privacy,
        )
        .with_for_update()
    )
    if existing is None:
        ensure_capability(session, context.space_id, CAPABILITY)
        if expected_version != 0:
            raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
        existing = RecapReflection(
            space_id=context.space_id,
            owner_id=context.account_id,
            privacy_class=privacy,
            edition_id=value.id,
            payload=RecapReflectionPayload(text=text_value),
        )
        session.add(existing)
    else:
        if existing.version != expected_version:
            raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
        existing.payload = RecapReflectionPayload(text=text_value)
    # A private draft and its deliberately shared counterpart are distinct rows.
    session.flush()


def withdraw_reflection(
    session: Session, context: AuthorizationContext, value: RecapEdition, expected_version: int
) -> None:
    own = session.scalar(
        readable(RecapReflection, context)
        .where(
            RecapReflection.edition_id == value.id,
            RecapReflection.owner_id == context.account_id,
            RecapReflection.privacy_class == PrivacyClass.SPACE_SHARED.value,
        )
        .with_for_update()
    )
    if own is None:
        raise NotFoundError("Reflection not found.", "RESOURCE_NOT_FOUND")
    if own.version != expected_version:
        raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
    session.delete(own)
