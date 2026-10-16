"""Bounded retention and final purge for relationship Spaces with no active members."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from eimir.attachments import account_media as attachment_account_media
from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.core.clock import now
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry
from eimir.media import get_media_store
from eimir.outbox.models import OutboxEvent
from eimir.relationship.models import Membership, MembershipStatus, Space
from eimir.transfer import service as transfer_service
from eimir.transfer.models import TransferExport, TransferImport

log = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=6)
"""Cadence for bounded orphan scanning on the existing durable Job queue."""

JOB_KIND = "space_offboarding_retention"
BATCH_SIZE = 50
_LOCK_KEY = 8_150_518


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.kind == JOB_KIND,
                Job.status.in_([status.value for status in statuses]),
            )
        ).scalar_one()
    )


def _schedule_lock(session: Session) -> None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    """Ensure one retention scan exists, using the repository's normal queue."""
    _schedule_lock(session)
    if _open_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay)


def schedule_next(session: Session, *, delay: timedelta | None = None) -> Job | None:
    """Schedule the next scan while the current retention Job is running."""
    _schedule_lock(session)
    if _open_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(session, JOB_KIND, delay=delay or SCAN_INTERVAL)


def _due_space_ids(
    session: Session,
    *,
    current_time: datetime,
    limit: int = BATCH_SIZE,
) -> list[UUID]:
    """Find zero-active Spaces whose frozen product-policy deadline is due."""
    active_membership_exists = (
        select(Membership.id)
        .where(
            Membership.space_id == Space.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .exists()
    )
    return list(
        session.execute(
            select(Space.id)
            .where(
                Space.offboarding_purge_at.is_not(None),
                Space.offboarding_purge_at <= current_time,
                ~active_membership_exists,
            )
            .order_by(Space.offboarding_purge_at, Space.id)
            .limit(limit)
        ).scalars()
    )


def _still_due(
    space: Space,
    memberships: list[Membership],
    *,
    current_time: datetime,
) -> bool:
    if not memberships:
        # Empty Spaces are an operator anomaly, not a relationship history the
        # offboarding lifecycle is allowed to classify or destroy implicitly.
        return False
    if any(membership.status == MembershipStatus.ACTIVE.value for membership in memberships):
        return False
    if any(membership.ended_at is None for membership in memberships):
        return False
    if space.offboarding_purge_at is None:
        # A missing frozen deadline is an invariant failure. Do not reconstruct
        # it from today's policy because that could retroactively alter a prior
        # Product-Owner promise. Migration/lifecycle repair must make it explicit.
        return False
    return space.offboarding_purge_at <= current_time


def _purge_space_media(session: Session, *, space_id: UUID) -> tuple[int, int]:
    """Converge all remaining Space-backed media through the existing lifecycle.

    Account-global profile media is the one thing here this Space does not own.
    Its authoritative parent is the still-live Account, so it is adopted into
    the Account storage home instead of purged (#692). Adoption clears the row's
    Space key in this same transaction, so the Space deletion below still leaves
    no ``Attachment`` referencing a removed Space, and an Account that stays
    active elsewhere keeps its avatar.

    Avatars bound before adoption existed are Space-owned rows and are collected
    here; every avatar bound since is already Account-owned and never appears in
    this query at all.
    """
    attachments = list(
        session.execute(
            select(Attachment)
            .where(Attachment.space_id == space_id)
            .order_by(Attachment.id)
            .with_for_update()
        ).scalars()
    )
    purged = 0
    adopted = 0
    failures = 0
    for attachment in attachments:
        try:
            if attachment_account_media.adopt_if_account_profile(session, attachment):
                adopted += 1
                continue
        except OSError:
            # Same contract as a failed purge: keep the Space so the next
            # bounded scan retries instead of destroying a live binding.
            log.warning(
                "account profile media adoption failed",
                extra={"attachmentId": str(attachment.id)},
            )
            failures += 1
            continue
        if attachment.status not in {
            AttachmentStatus.DELETING.value,
            AttachmentStatus.DELETE_FAILED.value,
        }:
            attachment_service.mark_for_deletion(session, attachment)
        if attachment_service.purge(session, attachment):
            purged += 1
        else:
            failures += 1
    session.flush()
    if adopted:
        log.info(
            "account profile media adopted before space purge",
            extra={"adopted": adopted},
        )
    return purged, failures


def _purge_transfer_artifacts(session: Session, *, space_id: UUID) -> tuple[int, int]:
    """Remove provider objects before Space cascade removes Transfer metadata."""
    exports = list(
        session.execute(
            select(TransferExport)
            .where(TransferExport.space_id == space_id)
            .order_by(TransferExport.id)
            .with_for_update()
        ).scalars()
    )
    imports = list(
        session.execute(
            select(TransferImport)
            .where(TransferImport.space_id == space_id)
            .order_by(TransferImport.id)
            .with_for_update()
        ).scalars()
    )
    store = get_media_store()
    removed = 0
    failures = 0
    for transfer_export in exports:
        try:
            store.delete(transfer_service.export_storage_key(transfer_export))
        except OSError:
            failures += 1
        else:
            removed += 1
    for transfer_import in imports:
        try:
            store.delete(transfer_service.import_storage_key(transfer_import))
        except OSError:
            failures += 1
        else:
            removed += 1
    return removed, failures


def _purge_one_space(
    session: Session,
    *,
    space_id: UUID,
    current_time: datetime,
) -> tuple[bool, int, int]:
    """Revalidate one candidate under lifecycle locks and purge it if converged."""
    space = session.execute(
        select(Space).where(Space.id == space_id).with_for_update()
    ).scalar_one_or_none()
    if space is None:
        return False, 0, 0

    memberships = list(
        session.execute(
            select(Membership)
            .where(Membership.space_id == space_id)
            .order_by(Membership.id)
            .with_for_update()
        ).scalars()
    )
    if not _still_due(space, memberships, current_time=current_time):
        return False, 0, 0

    media_purged, media_failures = _purge_space_media(session, space_id=space_id)
    transfer_removed, transfer_failures = _purge_transfer_artifacts(
        session,
        space_id=space_id,
    )
    if media_failures or transfer_failures:
        # Provider cleanup is idempotent. Keep the Space/history row so the next
        # bounded scan retries instead of cascading metadata while blobs remain.
        return False, media_purged, transfer_removed

    # Outbox is intentionally a safe-envelope queue without a Space foreign key.
    # At final whole-Space retention it no longer has a legitimate relationship
    # history to reference, so remove it explicitly rather than leaving stale IDs.
    session.execute(delete(OutboxEvent).where(OutboxEvent.space_id == space_id))

    # All normal Space-owned domain tables use ON DELETE CASCADE. Provider-backed
    # objects have converged above, so the Space row can now be the single final
    # database retention boundary for memberships, invitations, shared history,
    # reminders, notifications, transfers and other tenant rows.
    session.execute(delete(Space).where(Space.id == space.id))
    session.flush()
    return True, media_purged, transfer_removed


def purge_due_spaces(
    session: Session,
    *,
    current_time: datetime | None = None,
    limit: int = BATCH_SIZE,
) -> tuple[int, int, int]:
    """Purge one bounded batch and return only non-sensitive technical counters."""
    instant = current_time or now()
    purged_spaces = 0
    purged_media = 0
    removed_transfers = 0
    for space_id in _due_space_ids(session, current_time=instant, limit=limit):
        purged, media_count, transfer_count = _purge_one_space(
            session,
            space_id=space_id,
            current_time=instant,
        )
        purged_spaces += int(purged)
        purged_media += media_count
        removed_transfers += transfer_count
    return purged_spaces, purged_media, removed_transfers


def handle_retention(session: Session, payload: dict[str, Any]) -> None:
    """Run one bounded retention pass and keep the normal Job chain alive."""
    del payload
    spaces, media, transfers = purge_due_spaces(session)
    log.info(
        "space offboarding retention completed",
        extra={
            "spaces_purged": spaces,
            "media_purged": media,
            "transfer_artifacts_removed": transfers,
        },
    )
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, handle_retention)
