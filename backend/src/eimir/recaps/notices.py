"""Readiness notices for retained recaps (#1744, PO 2026-11-17).

A recap is announced when it is final: once its grace week has passed and the
edition is retained. The decisions here are pure; the job only applies them.

- A recently completed month or year gets its own notice ("ready"). December
  is announced by the year film, so the turn of the year is one notice.
- A newer version of a retained edition gets a "grew" notice.
- Older periods that appear only now (late entries, a first Pro month, an
  import) are "earlier"; together with "grew" notices they are sent at most
  once a day, and several at once become one collected notice.
- The running period is never announced, nothing is sent before 09:00 or after
  21:00 in the Space's time zone, and recipient Quiet Hours still apply.
- Both active partners receive the identical notice, only while the Space holds
  the recap capability. Without it nothing is sent (Free composes no recaps).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.outbox import service as outbox_service
from eimir.recaps.models import RecapEdition, RecapKind
from eimir.relationship.models import Membership, MembershipStatus

ANNOUNCE_JOB = "recap.announce.v1"
READY = "READY"
GREW = "GREW"
EARLIER = "EARLIER"
# A period retained within this time after its end still counts as current news.
RECENT = timedelta(days=21)
# Late notices ("grew" and "earlier") are sent at most once per Space and day.
LATE_INTERVAL = timedelta(days=1)
DAY_STARTS = time(9)
DAY_ENDS = time(21)


def announcement(
    kind: str, month: int, period_end: date, today: date, *, grew: bool = False
) -> str | None:
    """Which notice a just retained edition earns, if any."""
    if period_end >= today:
        return None  # the running period is never announced
    if grew:
        return GREW
    if kind == RecapKind.MONTH.value and month == 12:
        return None  # the year film announces the turn of the year
    return READY if today - period_end <= RECENT else EARLIER


def release_at(now: datetime, zone: ZoneInfo) -> datetime:
    """The first instant at or after ``now`` inside the Space's daytime window."""
    instant = clock.ensure_utc(now)
    local = instant.astimezone(zone)
    if DAY_STARTS <= local.time() < DAY_ENDS:
        return instant
    day = local.date() if local.time() < DAY_STARTS else local.date() + timedelta(days=1)
    return clock.resolve_local(day, DAY_STARTS, zone)


@dataclass(frozen=True)
class Pending:
    edition_id: UUID
    announcement: str
    period: tuple[int, int, int]
    """Sort key: newest period first."""


@dataclass
class Plan:
    single: list[tuple[UUID, EventType]] = field(default_factory=list)
    collected: list[UUID] = field(default_factory=list)
    """Editions announced together by one notice; the first one is newest."""
    deferred: list[UUID] = field(default_factory=list)
    retry_at: datetime | None = None


def plan(pending: list[Pending], last_late: datetime | None, now: datetime) -> Plan:
    """Group the pending notices of one Space; pure."""
    result = Plan()
    ordered = sorted(pending, key=lambda item: item.period, reverse=True)
    for item in ordered:
        if item.announcement == READY:
            result.single.append((item.edition_id, EventType.RECAP_READY))
    late = [item for item in ordered if item.announcement != READY]
    if not late:
        return result
    if last_late is not None and now - clock.ensure_utc(last_late) < LATE_INTERVAL:
        result.deferred = [item.edition_id for item in late]
        result.retry_at = clock.ensure_utc(last_late) + LATE_INTERVAL
    elif len(late) == 1:
        (item,) = late
        result.single.append(
            (
                item.edition_id,
                EventType.RECAP_GREW if item.announcement == GREW else EventType.RECAP_READY,
            )
        )
    else:
        result.collected = [item.edition_id for item in late]
    return result


def schedule(session: Session, space_id: UUID, *, at: datetime | None = None) -> None:
    """Keep one waiting announcement run per Space, never later than needed."""
    when = clock.ensure_utc(at) if at is not None else clock.now()
    waiting = session.scalar(
        select(func.min(Job.run_after)).where(
            Job.kind == ANNOUNCE_JOB,
            Job.status == JobStatus.PENDING.value,
            Job.payload["space_id"].astext == str(space_id),
        )
    )
    if waiting is not None and clock.ensure_utc(waiting) <= when:
        return
    queue.enqueue(
        session,
        ANNOUNCE_JOB,
        {"space_id": str(space_id)},
        delay=max(when - clock.now(), timedelta(0)),
        max_attempts=3,
    )


def _members(session: Session, space_id: UUID) -> list[UUID]:
    from eimir.identity.models import Account

    return list(
        session.scalars(
            select(Membership.account_id)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
            .order_by(Membership.account_id)
        )
    )


def _emit(session: Session, space_id: UUID, kind: EventType, subject_id: UUID) -> None:
    # One event per partner; the projection gives both the identical notice.
    for account_id in _members(session, space_id):
        outbox_service.record(
            session,
            DomainEvent(
                type=kind,
                space_id=space_id,
                subject_type="recap_edition",
                subject_id=subject_id,
                payload=PublicEventPayload(recipient_id=account_id),
            ),
        )


def announce(session: Session, payload: dict[str, Any]) -> None:
    """Send the pending readiness notices of one Space."""
    from eimir.recaps import jobs, service

    space_id = UUID(payload["space_id"])
    session.execute(select(func.pg_advisory_xact_lock(space_id.int & ((1 << 63) - 1))))
    pending_rows = list(
        session.scalars(
            select(RecapEdition)
            .where(
                RecapEdition.space_id == space_id,
                RecapEdition.announcement.is_not(None),
                RecapEdition.announced_at.is_(None),
            )
            .with_for_update()
        )
    )
    if not pending_rows:
        return
    now = clock.now()
    account_id = jobs.first_member(session, space_id)
    context = (
        jobs.authorized_context(session, account_id, space_id) if account_id is not None else None
    )
    if context is None or not service.can_compose(session, context):
        # Without the capability (or without members) nothing is announced later.
        for row in pending_rows:
            row.announced_at = now
        return
    zone, _ = service.calendar_context(session, context)
    release = release_at(now, clock.resolve_zone(zone))
    if release > now:
        schedule(session, space_id, at=release)
        return
    readable = [row for row in pending_rows if row.status == "READY" and row.saved_at is not None]
    for row in pending_rows:
        if row not in readable:
            row.announced_at = now  # an emptied or withdrawn edition is not announced
    last_late = session.scalar(
        select(func.max(RecapEdition.announced_at)).where(
            RecapEdition.space_id == space_id,
            RecapEdition.announcement.in_((GREW, EARLIER)),
            RecapEdition.announced_at.is_not(None),
        )
    )
    decided = plan(
        [
            Pending(
                row.id, row.announcement or READY, (row.year, row.month, int(row.kind == "YEAR"))
            )
            for row in readable
        ],
        last_late,
        now,
    )
    by_id = {row.id: row for row in readable}
    for edition_id, kind in decided.single:
        _emit(session, space_id, kind, edition_id)
        by_id[edition_id].announced_at = now
    if decided.collected:
        _emit(session, space_id, EventType.RECAPS_COLLECTED, decided.collected[0])
        for edition_id in decided.collected:
            by_id[edition_id].announced_at = now
    if decided.retry_at is not None:
        schedule(session, space_id, at=release_at(decided.retry_at, clock.resolve_zone(zone)))


def announce_retained(
    session: Session,
    context: AuthorizationContext,
    value: RecapEdition,
    today: date,
    *,
    grew: bool = False,
) -> None:
    """Record the notice a just retained edition earns and queue its delivery."""
    from eimir.recaps.composition import period_bounds

    _, period_end, _ = period_bounds(RecapKind(value.kind), value.year, value.month, today)
    value.announcement = announcement(value.kind, value.month, period_end, today, grew=grew)
    if value.announcement is not None:
        schedule(session, context.space_id)
