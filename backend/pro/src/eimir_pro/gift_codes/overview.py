"""Pro overview figures for the operator (ServerAdmin part 5, design section 5.6).

Only aggregates: no names, no codes. "Premium now" mirrors
``eimir.entitlements.service.evaluate_grant_validity`` as one SQL predicate so
the figures come from a few aggregate queries instead of one evaluation per
Space. eimir. keeps no store event history, so every Google Play figure reads
the stored state of the grants (``status``, ``metadata.autoRenewing``,
``source_event_at``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import ColumnElement, Subquery, and_, func, or_, select
from sqlalchemy.orm import Session

from eimir.config import Environment, get_settings
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship.models import Space
from eimir_pro.gift_codes.codes import GRANT_BATCH_METADATA_KEY, GRANT_REFERENCE_PREFIX
from eimir_pro.gift_codes.models import GiftCodeBatch

RUNNING_GIFTS_LIMIT = 50
WINDOW = timedelta(days=30)
"""The window of "ended" and "cancellations" figures."""

_UNBOUNDED_VALID_STATUSES = (
    EntitlementStatus.ACTIVE.value,
    EntitlementStatus.TRIAL.value,
    EntitlementStatus.GRANDFATHERED.value,
)
_RUNNING_PLAY_STATUSES = (EntitlementStatus.ACTIVE.value, EntitlementStatus.TRIAL.value)
_ENDED_PLAY_STATUSES = (EntitlementStatus.EXPIRED.value, EntitlementStatus.REVOKED.value)

GiftOrigin = Literal["manual", "code"]


@dataclass(frozen=True)
class PlayStates:
    """Spaces by their deciding Google Play grant: a running one, else the newest event."""

    active: int
    cancelled_running: int
    payment_problem: int
    ended_30d: int


@dataclass(frozen=True)
class RunningGift:
    """A Space's running gift with its latest end; ``None`` means unlimited."""

    space_id: UUID
    origin: GiftOrigin
    batch_note: str | None
    effective_until: datetime | None


@dataclass(frozen=True)
class ProOverview:
    spaces_total: int
    spaces_premium: int
    premium_by_play: int
    premium_by_gift: int
    """Premium only through a gift; a Space with Google Play counts under Play."""
    play: PlayStates
    cancellations_30d: int
    running_gifts: list[RunningGift]
    running_gifts_total: int


def effective_premium(at: datetime) -> ColumnElement[bool]:
    """SQL form of a PREMIUM grant that ``get_effective_space_entitlement`` counts at ``at``."""
    grant = EntitlementGrant
    conditions = [
        grant.tier == EntitlementTier.PREMIUM.value,
        grant.effective_from <= at,
        or_(
            and_(
                grant.status.in_(_UNBOUNDED_VALID_STATUSES),
                or_(grant.effective_until.is_(None), grant.effective_until >= at),
            ),
            # A grace period without an end fails closed, as in the service.
            and_(
                grant.status == EntitlementStatus.GRACE_PERIOD.value,
                grant.effective_until >= at,
            ),
        ),
    ]
    if get_settings().environment is Environment.PRODUCTION:
        conditions.append(grant.source_type != EntitlementSourceType.TEST_FIXTURE.value)
    return and_(*conditions)


def auto_renewing() -> ColumnElement[bool]:
    """``metadata.autoRenewing`` is true; a missing or other value counts as not renewing."""
    return EntitlementGrant.metadata_.contains({"autoRenewing": True})


def overview(session: Session, at: datetime) -> ProOverview:
    spaces_total = session.scalar(select(func.count()).select_from(Space)) or 0
    premium_total, premium_by_play, premium_by_gift = _premium_counts(session, at)
    return ProOverview(
        spaces_total=spaces_total,
        spaces_premium=premium_total,
        premium_by_play=premium_by_play,
        premium_by_gift=premium_by_gift,
        play=_play_states(session, at),
        cancellations_30d=_cancellations(session, at),
        running_gifts=_running_gifts(session, at),
        running_gifts_total=_running_gifts_total(session, at),
    )


def _premium_counts(session: Session, at: datetime) -> tuple[int, int, int]:
    grant = EntitlementGrant
    per_space = (
        select(
            grant.space_id,
            func.bool_or(grant.source_type == EntitlementSourceType.GOOGLE_PLAY.value).label(
                "play"
            ),
            func.bool_or(grant.source_type == EntitlementSourceType.ADMIN_GRANT.value).label(
                "gift"
            ),
        )
        .where(effective_premium(at))
        .group_by(grant.space_id)
        .subquery()
    )
    total, play, gift_only = session.execute(
        select(
            func.count(),
            func.count().filter(per_space.c.play),
            func.count().filter(and_(per_space.c.gift, ~per_space.c.play)),
        ).select_from(per_space)
    ).one()
    return int(total), int(play), int(gift_only)


def _play_states(session: Session, at: datetime) -> PlayStates:
    """Spaces by their deciding Google Play grant.

    Billing keeps one grant per purchase token. After a plan switch or a
    resubscription, the replaced token's late EXPIRED event can be newer than
    the running token's last event, so an effective grant wins first and the
    newest event only decides among equals.
    """
    grant = EntitlementGrant
    effective = func.coalesce(effective_premium(at), False)
    latest = (
        select(
            grant.status,
            grant.effective_until,
            grant.source_event_at,
            effective.label("effective"),
            auto_renewing().label("auto_renewing"),
        )
        .where(grant.source_type == EntitlementSourceType.GOOGLE_PLAY.value)
        .distinct(grant.space_id)
        .order_by(
            grant.space_id,
            effective.desc(),
            grant.source_event_at.desc(),
            grant.created_at.desc(),
            grant.id.desc(),
        )
        .subquery()
    )
    running = and_(latest.c.status.in_(_RUNNING_PLAY_STATUSES), latest.c.effective)
    active, cancelled, payment_problem, ended = session.execute(
        select(
            func.count().filter(and_(running, latest.c.auto_renewing)),
            func.count().filter(and_(running, ~latest.c.auto_renewing)),
            func.count().filter(
                and_(
                    latest.c.status == EntitlementStatus.GRACE_PERIOD.value,
                    latest.c.effective,
                )
            ),
            func.count().filter(
                and_(
                    latest.c.status.in_(_ENDED_PLAY_STATUSES),
                    latest.c.source_event_at >= at - WINDOW,
                    latest.c.source_event_at <= at,
                )
            ),
        ).select_from(latest)
    ).one()
    return PlayStates(
        active=int(active),
        cancelled_running=int(cancelled),
        payment_problem=int(payment_problem),
        ended_30d=int(ended),
    )


def _cancellations(session: Session, at: datetime) -> int:
    """Play grants whose last event in the window turned renewal off or revoked them.

    Without a cancellation history this counts the currently cancelled (still
    running or in grace) or revoked subscriptions; an expired one is an ending,
    not a cancellation.
    """
    grant = EntitlementGrant
    count = session.scalar(
        select(func.count()).where(
            grant.source_type == EntitlementSourceType.GOOGLE_PLAY.value,
            grant.source_event_at >= at - WINDOW,
            grant.source_event_at <= at,
            or_(
                grant.status == EntitlementStatus.REVOKED.value,
                and_(
                    grant.status.in_(
                        (*_RUNNING_PLAY_STATUSES, EntitlementStatus.GRACE_PERIOD.value)
                    ),
                    ~auto_renewing(),
                ),
            ),
        )
    )
    return int(count or 0)


def _latest_gift_per_space(at: datetime) -> Subquery:
    """One row per Space: its running gift with the latest end (no end first)."""
    grant = EntitlementGrant
    return (
        select(
            grant.space_id,
            grant.effective_until,
            grant.external_reference,
            grant.metadata_[GRANT_BATCH_METADATA_KEY].astext.label("batch_id"),
        )
        .where(
            grant.source_type == EntitlementSourceType.ADMIN_GRANT.value,
            effective_premium(at),
        )
        .distinct(grant.space_id)
        .order_by(
            grant.space_id,
            grant.effective_until.desc().nulls_first(),
            grant.created_at.desc(),
            grant.id.desc(),
        )
        .subquery()
    )


def _running_gifts_total(session: Session, at: datetime) -> int:
    return int(session.scalar(select(func.count()).select_from(_latest_gift_per_space(at))) or 0)


def _running_gifts(session: Session, at: datetime) -> list[RunningGift]:
    latest = _latest_gift_per_space(at)
    rows = session.execute(
        select(latest)
        .order_by(latest.c.effective_until.asc().nulls_last(), latest.c.space_id)
        .limit(RUNNING_GIFTS_LIMIT)
    ).all()
    batch_ids = {
        batch_id
        for row in rows
        if _is_code_gift(row.external_reference)
        and (batch_id := _parse_uuid(row.batch_id)) is not None
    }
    notes: dict[UUID, str | None] = {}
    if batch_ids:
        notes = {
            batch_id: note
            for batch_id, note in session.execute(
                select(GiftCodeBatch.id, GiftCodeBatch.note).where(GiftCodeBatch.id.in_(batch_ids))
            ).tuples()
        }
    gifts: list[RunningGift] = []
    for row in rows:
        is_code = _is_code_gift(row.external_reference)
        batch_id = _parse_uuid(row.batch_id) if is_code else None
        gifts.append(
            RunningGift(
                space_id=row.space_id,
                origin="code" if is_code else "manual",
                batch_note=notes.get(batch_id) if batch_id is not None else None,
                effective_until=row.effective_until,
            )
        )
    return gifts


def _is_code_gift(external_reference: str | None) -> bool:
    return external_reference is not None and external_reference.startswith(GRANT_REFERENCE_PREFIX)


def _parse_uuid(value: str | None) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None
