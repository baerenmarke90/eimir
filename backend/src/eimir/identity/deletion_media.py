"""Binding-aware media cleanup for accepted Account deletions.

Attachment rows are technically OWNER_ONLY even when their binding points at a
retained SPACE_SHARED parent. Account deletion therefore cannot bulk-delete
media by ``owner_id`` alone. This module treats ownership only as the candidate
set, resolves every current binding through the shared retention classifier,
and delegates physical deletion to the existing retry-safe attachment lifecycle.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.attachments.retention import OwnerAttachmentBinding, classify_owner_attachment
from eimir.identity.deletion import DeletionNotAcceptedError, mark_deletion_failed
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import Account

MEDIA_CLEANUP_FAILURE_CODE = "MEDIA_CLEANUP_FAILED"
MEDIA_PARENT_INCONSISTENT_CODE = "MEDIA_PARENT_INCONSISTENT"


@dataclass(frozen=True)
class AccountMediaCleanupResult:
    """Non-sensitive counters from one idempotent Account media pass."""

    retained_shared: int = 0
    purged: int = 0
    purge_failures: int = 0
    inconsistent_bindings: int = 0

    @property
    def converged(self) -> bool:
        return self.purge_failures == 0 and self.inconsistent_bindings == 0


def _account_for_update(session: Session, account_id: UUID) -> Account | None:
    return session.execute(
        select(Account).where(Account.id == account_id).with_for_update()
    ).scalar_one_or_none()


def _deletion_for_update(session: Session, account_id: UUID) -> AccountDeletion | None:
    return session.execute(
        select(AccountDeletion).where(AccountDeletion.account_id == account_id).with_for_update()
    ).scalar_one_or_none()


def apply_account_media_cleanup(
    session: Session,
    account_id: UUID,
) -> AccountMediaCleanupResult:
    """Converge media owned by one already accepted/deactivated Account.

    The Account tombstone and fail-closed phase must already be committed.
    Shared-parent media remains untouched. Unbound uploads and Account-profile
    media are immediately hidden and purged through the existing
    ``DELETING``/``DELETE_FAILED`` lifecycle. Storage failures never reactivate
    the Account and remain retryable.
    """
    account = _account_for_update(session, account_id)
    if account is None:
        # Future final retention may hard-delete the pseudonymous Account row.
        # Replaying an older journal entry must then remain idempotent.
        return AccountMediaCleanupResult()

    deletion = _deletion_for_update(session, account_id)
    if deletion is None or account.disabled_at is None:
        raise DeletionNotAcceptedError(
            "Account media cleanup requires a committed fail-closed deletion tombstone."
        )

    candidates = list(
        session.execute(
            select(Attachment)
            .where(Attachment.owner_id == account_id)
            .order_by(Attachment.id)
            .with_for_update()
        ).scalars()
    )

    retained_shared = 0
    purged = 0
    purge_failures = 0
    inconsistent_bindings = 0

    for attachment in candidates:
        binding_state = classify_owner_attachment(session, attachment, account_id=account_id)
        if binding_state is OwnerAttachmentBinding.RETAIN_SHARED:
            retained_shared += 1
            continue
        if binding_state in {
            OwnerAttachmentBinding.OWNER_PRIVATE,
            OwnerAttachmentBinding.INCONSISTENT,
        }:
            # Core cleanup is expected to remove every owner-private parent
            # before this media phase. A surviving private parent or a foreign
            # binding is therefore a fail-closed lifecycle inconsistency.
            inconsistent_bindings += 1
            continue

        # Account deletion removes both unbound media and the Account profile
        # avatar. Space self-offboarding reuses the same classifier but retains
        # ACCOUNT_PROFILE because the Account itself remains active.
        if attachment.status not in {
            AttachmentStatus.DELETING.value,
            AttachmentStatus.DELETE_FAILED.value,
        }:
            service.mark_for_deletion(session, attachment)
        if service.purge(session, attachment):
            purged += 1
        else:
            purge_failures += 1

    if purge_failures or inconsistent_bindings:
        mark_deletion_failed(
            session,
            account_id,
            failure_code=(
                MEDIA_PARENT_INCONSISTENT_CODE
                if inconsistent_bindings
                else MEDIA_CLEANUP_FAILURE_CODE
            ),
        )
    elif deletion.status == AccountDeletionStatus.FAILED.value and deletion.last_failure_code in {
        MEDIA_CLEANUP_FAILURE_CODE,
        MEDIA_PARENT_INCONSISTENT_CODE,
    }:
        # Allow a direct retry of this slice to converge without requiring a
        # second journal acceptance. Never clear failures owned by another
        # lifecycle slice.
        deletion.status = AccountDeletionStatus.PENDING.value
        deletion.failed_at = None
        deletion.last_failure_code = None
        deletion.completed_at = None

    session.flush()
    return AccountMediaCleanupResult(
        retained_shared=retained_shared,
        purged=purged,
        purge_failures=purge_failures,
        inconsistent_bindings=inconsistent_bindings,
    )
