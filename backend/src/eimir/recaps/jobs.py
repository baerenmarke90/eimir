"""Automatic recaps on the existing PostgreSQL queue, with local-only wording."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core import clock
from eimir.core.errors import NotFoundError
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import registry
from eimir.recaps import local_ai, mood, service
from eimir.recaps.composition import select_candidates, theme_for
from eimir.recaps.models import RecapKind, RecapPayload
from eimir.relationship.models import Membership, MembershipStatus
from eimir.relationship.service import require_membership

SCAN_JOB = "recap.scan.v1"
SCAN_INTERVAL = timedelta(hours=6)
SCAN_LOCK = 8_150_228
EVIDENCE_LIMIT = 8


def authorized_context(
    session: Session, account_id: UUID, space_id: UUID
) -> AuthorizationContext | None:
    account = session.get(Account, account_id)
    if account is None or account.disabled_at:
        return None
    try:
        require_membership(session, account, space_id)
    except NotFoundError:
        return None
    return AuthorizationContext(account_id=account_id, space_id=space_id)


def first_member(session: Session, space_id: UUID) -> UUID | None:
    return session.scalar(
        select(Membership.account_id)
        .join(Account, Account.id == Membership.account_id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Account.disabled_at.is_(None),
        )
        .order_by(Membership.created_at, Membership.id)
        .limit(1)
    )


def generate(session: Session, payload: dict[str, Any]) -> None:
    space_id, edition_id, token = (
        UUID(payload[key]) for key in ("space_id", "edition_id", "request_token")
    )
    # A rewrite queued by a source change has no requesting member.
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
    pool = service.candidates(session, context, value.starts_on, value.through_on, value.variant)
    selected = select_candidates(
        pool, kind, f"{space_id}:{kind}:{value.year}:{value.month}", value.variant
    )
    material = [
        current
        for item in selected
        if (current := service.source_material(session, context, item)) is not None
    ]
    evidence = [
        {
            "key": item["key"],
            "kind": str(item["kind"]),
            "occurred_on": item["occurred_on"].isoformat(),
            "title": item["title"] or "",
            "excerpt": "" if item["excerpt"] == item["title"] else item["excerpt"] or "",
        }
        for item in material
        if (item["title"] or "").strip() or (item["excerpt"] or "").strip()
    ]
    # The wording model reads a bounded, evenly spread sample of a longer selection.
    if len(evidence) > EVIDENCE_LIMIT:
        step = len(evidence) / EVIDENCE_LIMIT
        evidence = [evidence[int(index * step)] for index in range(EVIDENCE_LIMIT)]
    versions = {item["key"]: item["version"] for item in material}
    locale, period = value.locale, f"{value.starts_on.isoformat()}/{value.through_on.isoformat()}"

    narration = None
    if get_settings().recap_ai_url and evidence:
        # No membership/grant/content locks or open read transaction during inference.
        # The job was claimed in a separately committed transaction by the worker.
        session.rollback()
        narration = local_ai.compose(evidence, locale, period)

    # Revocation, manual edits and source changes win over an in-flight model call.
    context = authorized_context(session, account_id, space_id)
    if context is None:
        return
    value = service.edition(session, context, edition_id)
    if value.request_token != token or value.saved_at or value.customized:
        return
    if not service.can_compose(session, context):
        value.status = "PAUSED"
        return
    fresh_pool = service.candidates(
        session, context, value.starts_on, value.through_on, value.variant
    )
    fresh_selected = select_candidates(
        fresh_pool, kind, f"{space_id}:{kind}:{value.year}:{value.month}", value.variant
    )
    # Match source mutation/invalidation lock order: canonical content, then edition.
    # This prevents an in-flight privacy change from missing newly inserted references.
    fresh = [
        item
        for source in sorted(fresh_selected, key=lambda item: (item.kind, str(item.id)))
        if (item := service.source_material(session, context, source, lock=True)) is not None
    ]
    value = service.edition(session, context, edition_id, write=True)
    if value.request_token != token or value.saved_at or value.customized:
        return
    if not service.can_compose(session, context, lock_grants=True):
        value.status = "PAUSED"
        return
    if {item["key"]: item["version"] for item in fresh} != versions:
        narration = None
    service.store_selection(session, value, fresh_selected)
    rhythm = mood.refreshed(
        session, space_id, kind, value.starts_on, value.through_on, value.payload.mood
    )
    value.payload = (
        RecapPayload(headline=narration.title, introduction=narration.introduction, mood=rhythm)
        if narration
        else RecapPayload(mood=rhythm)
    )
    value.generated_by = "LOCAL_AI" if narration else "RULES"
    value.theme = theme_for(fresh_selected)
    value.status = "READY" if fresh else "EMPTY"
    value.generated_at = clock.now()


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
            service.prepare_current(session, context)
    if len(spaces) == 100:
        queue.enqueue(session, SCAN_JOB, {"after": str(spaces[-1])})
    else:
        ensure_scheduled(session, delay=SCAN_INTERVAL, running=True)


def backfill(session: Session, payload: dict[str, Any]) -> None:
    """Continue preparing earlier periods; stops by itself once none are left."""
    context = authorized_context(session, UUID(payload["account_id"]), UUID(payload["space_id"]))
    if context and service.can_compose(session, context):
        service.prepare_current(session, context)


def register_handlers() -> None:
    registry.register(service.GENERATE_JOB, generate)
    registry.register(service.BACKFILL_JOB, backfill)
    registry.register(SCAN_JOB, scan)
