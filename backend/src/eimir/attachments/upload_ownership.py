"""Cross-process ownership for attachment upload versus retention cleanup.

The request unit of work deliberately spans a whole HTTP request. That makes an
ordinary ORM ``flush()`` unsuitable as upload authority: cleanup in another
process cannot see the change before request commit. Server-stream uploads use a
short committed claim before body transfer, then take the Attachment row lock
only for the bounded provider mutation and DB finalization.

This gives both sides one PostgreSQL authority without holding an Attachment row
lock while a client can stream arbitrarily slowly.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, sessionmaker

from eimir.attachments import service
from eimir.attachments.limits import MediaRule
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import ConflictError, ErrorCode
from eimir.core.ids import parse_id

UPLOAD_LEASE = timedelta(minutes=5)
"""Maximum silence before an in-flight server-stream claim may be reclaimed."""

UPLOAD_LEASE_RENEW_MARGIN = timedelta(minutes=1)
"""Renew active transfer authority before the bounded lease becomes tight."""

UPLOAD_CLAIM_MAX_LIFETIME = timedelta(minutes=30)
"""Hard ceiling for one claim generation, even with continuous activity."""

_OPEN_UPLOAD_STATES = {
    AttachmentStatus.PENDING.value,
    AttachmentStatus.UPLOADING.value,
}


@dataclass(frozen=True)
class UploadClaim:
    attachment_id: UUID
    space_id: UUID
    token: UUID
    rule: MediaRule
    lease_until: datetime
    expires_at: datetime


@contextmanager
def _short_transaction(source: Session) -> Iterator[Session]:
    """Use independently committed authority in production.

    Production request Sessions are Engine-bound. For those, create a second
    short Session so the upload claim is committed and visible to other
    PostgreSQL processes before request-body transfer begins.

    The ordinary integration ``client`` deliberately overrides the request
    Session with one bound to an externally managed Connection/transaction so
    fixture data can stay uncommitted and isolated. Committing or rolling back
    a second Session on that same Connection would accidentally end the outer
    fixture transaction. Use a SAVEPOINT there instead. Concurrency tests use
    the production-style Engine-bound fixture and therefore still exercise the
    real independent-commit protocol.
    """
    bind = source.get_bind()
    if isinstance(bind, Connection):
        with source.begin_nested():
            yield source
        return

    maker = sessionmaker(
        bind=bind,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )
    worker = maker()
    try:
        yield worker
        worker.commit()
    except Exception:
        worker.rollback()
        raise
    finally:
        worker.close()
        # The request Session can have read the lifecycle row before this short
        # independent transaction. Do not retain stale ORM state afterwards.
        source.expire_all()


def active_upload_claim(
    attachment: Attachment,
    *,
    current_time: datetime | None = None,
) -> bool:
    """Return whether cleanup must treat this row as actively owned."""
    current = current_time or now()
    lease_until = attachment.upload_lease_until
    expires_at = attachment.upload_claim_expires_at
    return (
        attachment.upload_claim_id is not None
        and lease_until is not None
        and expires_at is not None
        and lease_until > current
        and expires_at > current
    )


def _claim_conflict() -> ConflictError:
    return ConflictError(
        "The upload is no longer available for this transfer.",
        ErrorCode.ATTACHMENT_NOT_READY,
    )


def _require_matching_claim(attachment: Attachment, claim: UploadClaim) -> None:
    if attachment.space_id != claim.space_id:
        raise Attachment.privacy_absence.error()
    if attachment.status not in _OPEN_UPLOAD_STATES:
        raise _claim_conflict()
    if attachment.upload_claim_id != claim.token:
        raise _claim_conflict()
    if attachment.upload_claim_expires_at != claim.expires_at:
        raise _claim_conflict()
    if not active_upload_claim(attachment):
        raise _claim_conflict()


def claim_upload(
    source: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> UploadClaim:
    """Commit exclusive upload authority before any request body is consumed.

    A stale claim may be replaced only after its lease or absolute lifetime
    expires. Claiming does not touch ``created_at`` or ``uploaded_at``: an
    abandoned retry therefore resumes the existing 24-hour retention clock.
    """
    with _short_transaction(source) as session:
        attachment, rule = service.open_upload(session, context, attachment_id)
        locked = session.execute(
            select(Attachment).where(Attachment.id == attachment.id).with_for_update()
        ).scalar_one_or_none()
        if locked is None:
            raise Attachment.privacy_absence.error()
        if locked.space_id != context.space_id or locked.owner_id != context.account_id:
            raise Attachment.privacy_absence.error()
        if locked.status not in _OPEN_UPLOAD_STATES:
            raise _claim_conflict()
        if active_upload_claim(locked):
            raise _claim_conflict()

        current = now()
        token = uuid4()
        expires_at = current + UPLOAD_CLAIM_MAX_LIFETIME
        lease_until = min(current + UPLOAD_LEASE, expires_at)
        locked.upload_claim_id = token
        locked.upload_lease_until = lease_until
        locked.upload_claim_expires_at = expires_at
        session.flush()

        return UploadClaim(
            attachment_id=locked.id,
            space_id=locked.space_id,
            token=token,
            rule=rule,
            lease_until=lease_until,
            expires_at=expires_at,
        )


def should_renew(claim: UploadClaim) -> bool:
    current = now()
    return current < claim.expires_at and claim.lease_until - current <= UPLOAD_LEASE_RENEW_MARGIN


def renew_upload_claim(source: Session, claim: UploadClaim) -> UploadClaim:
    """Extend observed activity without exceeding the generation hard cap."""
    with _short_transaction(source) as session:
        attachment = session.execute(
            select(Attachment).where(Attachment.id == claim.attachment_id).with_for_update()
        ).scalar_one_or_none()
        if attachment is None:
            raise Attachment.privacy_absence.error()
        _require_matching_claim(attachment, claim)

        current = now()
        expires_at = attachment.upload_claim_expires_at
        if expires_at is None or current >= expires_at:
            raise _claim_conflict()
        lease_until = min(current + UPLOAD_LEASE, expires_at)
        attachment.upload_lease_until = lease_until
        session.flush()
        return replace(claim, lease_until=lease_until)


def release_upload_claim(source: Session, claim: UploadClaim) -> None:
    """Release this request's claim without disturbing a newer generation."""
    with _short_transaction(source) as session:
        attachment = session.execute(
            select(Attachment).where(Attachment.id == claim.attachment_id).with_for_update()
        ).scalar_one_or_none()
        if attachment is None or attachment.upload_claim_id != claim.token:
            return
        attachment.upload_claim_id = None
        attachment.upload_lease_until = None
        attachment.upload_claim_expires_at = None
        session.flush()


def complete_upload(source: Session, claim: UploadClaim, data: bytes) -> None:
    """Write provider data only while holding authoritative row ownership.

    The body has already been read. The row lock therefore covers only the
    bounded provider mutation and DB finalization, not an unbounded client
    transfer. Cleanup, Account deletion and Space retention all serialize on
    the same Attachment row before they purge provider data.

    If the process or DB fails after ``MediaStore.put`` but before commit, the
    earlier committed claim/Attachment row remains an authoritative cleanup
    anchor. PostgreSQL rollback cannot erase the provider write, but it also
    cannot erase that already-committed anchor.
    """
    with _short_transaction(source) as session:
        attachment = session.execute(
            select(Attachment).where(Attachment.id == claim.attachment_id).with_for_update()
        ).scalar_one_or_none()
        if attachment is None:
            raise Attachment.privacy_absence.error()
        _require_matching_claim(attachment, claim)

        service.complete_upload(session, attachment, claim.rule, data)
        attachment.upload_claim_id = None
        attachment.upload_lease_until = None
        attachment.upload_claim_expires_at = None
        session.flush()


def finalize_upload(
    session: Session,
    context: AuthorizationContext,
    attachment_id: UUID | str,
) -> Attachment:
    """Serialize signed-upload finalize with stale-upload cleanup.

    The signed provider capability expires after ten minutes, far before the
    24-hour stale-upload horizon. The remaining race is DB finalize versus
    cleanup, so lock the authoritative row before delegating to the existing
    finalize state machine. Cleanup-wins returns privacy-safe absence/conflict
    instead of leaking ``NoResultFound`` as a 500.
    """
    identifier = attachment_id if isinstance(attachment_id, UUID) else parse_id(attachment_id)
    if identifier is None:
        raise Attachment.privacy_absence.error()

    locked = session.execute(
        select(Attachment)
        .where(
            Attachment.id == identifier,
            Attachment.space_id == context.space_id,
            Attachment.owner_id == context.account_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if locked is None:
        raise Attachment.privacy_absence.error()

    return service.finalize_upload(session, context, locked.id)
