"""Automatic relationship recap films on the existing PostgreSQL queue (plugin code).

The Pro plugin registers these handlers and schedules the scan through its
``register_jobs()`` and ``ensure_scheduled()`` hooks (Decision 0017). A worker
without the plugin leaves queued recap jobs unclaimed; they run once a worker
with the plugin is back.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.jobs import queue
from eimir.jobs.members import authorized_context, first_member
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.recap_composition import composer, freshness, montage, notices
from eimir.recaps import presentation, service
from eimir.recaps.composition import theme_for
from eimir.recaps.models import RecapKind, RecapPayload
from eimir.relationship.models import Membership, MembershipStatus

SCAN_JOB = "recap.scan.v1"
SCAN_INTERVAL = timedelta(hours=6)
SCAN_LOCK = 8_150_228
# Moments per kind and month a film may weigh; a month rarely has more.
FILM_POOL = 60


def generate(session: Session, payload: dict[str, Any]) -> None:
    space_id, edition_id, token = (
        UUID(payload[key]) for key in ("space_id", "edition_id", "request_token")
    )
    # Older queued jobs may lack a requesting member.
    account_id = (
        UUID(payload["account_id"])
        if payload.get("account_id")
        else first_member(session, space_id)
    )
    if account_id is None:
        return
    context = authorized_context(session, account_id, space_id)
    if context is None:
        return
    value = service.edition(session, context, edition_id)
    if value.request_token != token or value.saved_at or value.customized:
        return
    if not service.can_compose(session, context):
        value.status = "PAUSED"
        return
    kind = RecapKind(value.kind)
    pool = composer.candidates(
        session,
        context,
        value.starts_on,
        value.through_on,
        value.variant,
        per_month=FILM_POOL,
        starting_only=True,
    )
    compose_film = montage.compose_year if kind == RecapKind.YEAR else montage.compose
    selected, film = compose_film(session, context, value, pool, {})

    # Match source mutation/invalidation lock order: canonical content, then edition.
    # This prevents an in-flight privacy change from missing newly inserted references.
    live_sources = [
        item
        for source in sorted(selected, key=lambda item: (item.kind, str(item.id)))
        if (item := presentation.source_material(session, context, source, lock=True)) is not None
    ]
    value = service.edition(session, context, edition_id, write=True)
    if value.request_token != token or value.saved_at or value.customized:
        return
    if not service.can_compose(session, context, lock_grants=True):
        value.status = "PAUSED"
        return
    composer.store_selection(session, value, selected)
    value.payload = RecapPayload(film=film)
    value.generated_by = "RULES"
    value.theme = theme_for(selected)
    value.status = "READY" if live_sources else "EMPTY"
    value.generated_at = clock.now()
    # The material this composition accounts for; late entries change it (#1744).
    value.material_digest = freshness.period_digest(
        session, context, value.kind, value.year, value.month
    )
    value.material_at = func.now()
    value.observed_digest = value.observed_at = None
    if value.supersedes_id is not None:
        zone, _ = service.calendar_context(session, context)
        composer.settle_version(session, context, value, clock.today_in(zone))


def ensure_scheduled(
    session: Session, *, delay: timedelta | None = None, running: bool = False
) -> None:
    session.execute(select(func.pg_advisory_xact_lock(SCAN_LOCK)))
    statuses = (
        [JobStatus.PENDING.value] if running else [JobStatus.PENDING.value, JobStatus.RUNNING.value]
    )
    if (
        session.scalar(
            select(Job.id).where(Job.kind == SCAN_JOB, Job.status.in_(statuses)).limit(1)
        )
        is None
    ):
        queue.enqueue(session, SCAN_JOB, delay=delay)


def scan(session: Session, payload: dict[str, Any]) -> None:
    after = payload.get("after")
    query = select(Membership.space_id).where(Membership.status == MembershipStatus.ACTIVE.value)
    if after:
        query = query.where(Membership.space_id > UUID(after))
    spaces = list(session.scalars(query.distinct().order_by(Membership.space_id).limit(100)))
    for space_id in spaces:
        account_id = first_member(session, space_id)
        if account_id is None:
            continue
        context = authorized_context(session, account_id, space_id)
        if context and service.can_compose(session, context):
            composer.prepare_current(session, context)
    if len(spaces) == 100:
        queue.enqueue(session, SCAN_JOB, {"after": str(spaces[-1])})
    else:
        ensure_scheduled(session, delay=SCAN_INTERVAL, running=True)


def backfill(session: Session, payload: dict[str, Any]) -> None:
    """Continue preparing earlier periods; stops by itself once none are left."""
    context = authorized_context(session, UUID(payload["account_id"]), UUID(payload["space_id"]))
    if context and service.can_compose(session, context):
        composer.prepare_current(session, context)


JOB_KINDS = frozenset(
    {
        composer.GENERATE_JOB,
        composer.BACKFILL_JOB,
        composer.REFRESH_JOB,
        notices.ANNOUNCE_JOB,
        SCAN_JOB,
    }
)
"""Every recap job kind; the Core manifest declares them as plugin job kinds."""


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    for kind, handler in (
        (composer.GENERATE_JOB, generate),
        (composer.BACKFILL_JOB, backfill),
        (composer.REFRESH_JOB, backfill),
        (notices.ANNOUNCE_JOB, notices.announce),
        (SCAN_JOB, scan),
    ):
        if destination.get(kind) is None:
            destination.register(kind, handler)
