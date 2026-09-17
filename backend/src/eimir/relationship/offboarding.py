"""Server-authoritative self-exit from one relationship Space."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import cleanup as attachment_cleanup
from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.attachments.retention import OwnerAttachmentBinding, classify_owner_attachment
from eimir.authorization.retention import (
    OwnerOnlyCleanupResult,
    hard_delete_owner_only_in_space,
)
from eimir.core.clock import now
from eimir.core.errors import ConflictError, ForbiddenError, NotFoundError
from eimir.demo import canonical
from eimir.identity.models import Account
from eimir.relationship import service
from eimir.relationship.models import Invitation, Membership, MembershipStatus
from eimir.transfer import jobs as transfer_jobs
from eimir.transfer.models import TransferExport, TransferImport


class SpaceOffboardingErrorCode:
    DEMO_FORBIDDEN = "SPACE_OFFBOARDING_DEMO_FORBIDDEN"
    MEDIA_PARENT_INCONSISTENT = "SPACE_OFFBOARDING_MEDIA_PARENT_INCONSISTENT"


@dataclass(frozen=True, slots=True)
class LeaveSpaceResult:
    """Non-sensitive state after one idempotent self-exit attempt."""

    membership: Membership
    changed: bool
    revoked_invitations: int
    owner_only_cleanup: OwnerOnlyCleanupResult


def _ensure_self_exit_allowed() -> None:
    # The demo deployment predicate is shared with the other Demo guards so
    # "this is the demo" has one definition. This guard stays deliberately
    # broader than the reserved-identity one: every relationship in a demo
    # deployment belongs to the demo, not only the canonical personas.
    if canonical.demo_deployment():
        raise ForbiddenError(
            "Demo relationships are managed by the Demo environment and cannot be "
            "ended through the self-service Space flow.",
            SpaceOffboardingErrorCode.DEMO_FORBIDDEN,
        )


def _membership_for_update(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
) -> Membership:
    """Take the exclusive side of the central Membership lifecycle barrier."""
    membership = session.execute(
        select(Membership)
        .where(
            Membership.account_id == account_id,
            Membership.space_id == space_id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if membership is None:
        raise NotFoundError("Space not found.", service.SpaceErrorCode.NOT_FOUND)
    return membership


def _revoke_open_invitations(session: Session, space_id: UUID) -> int:
    """Revoke invitations after the Space lifecycle row is locked.

    Invitation acceptance also locks Space before Invitation. Once self-exit
    owns the Space row, no stale token can cross the transition while these
    invitation rows are being revoked.
    """
    current_time = now()
    invitations = (
        session.execute(
            select(Invitation)
            .where(Invitation.space_id == space_id)
            .order_by(Invitation.id)
            .with_for_update()
        )
        .scalars()
        .all()
    )
    revoked = 0
    for invitation in invitations:
        if invitation.is_open(current_time):
            invitation.revoked_at = current_time
            revoked += 1
    return revoked


def _prepare_owner_media_cleanup(session: Session, *, account_id: UUID, space_id: UUID) -> int:
    """Hide private/unbound media and hand physical purge to existing cleanup.

    The generic OWNER_ONLY database cleanup has already removed private parents
    when this function runs. Shared-parent media must survive for the remaining
    partner, while the Account-profile avatar must survive because self-exit
    does not delete the Account. Any other surviving private/foreign binding is
    an invariant violation and fails closed before Membership exit commits.

    An avatar bound since #692 is Account-owned and has no Space key, so it is
    not even a candidate here. The ``ACCOUNT_PROFILE`` branch still covers rows
    bound under the earlier Space-scoped contract; final retention adopts those
    into the Account storage home before the Space is removed.
    """
    attachments = list(
        session.execute(
            select(Attachment)
            .where(
                Attachment.owner_id == account_id,
                Attachment.space_id == space_id,
            )
            .order_by(Attachment.id)
            .with_for_update()
        ).scalars()
    )
    marked = 0
    needs_cleanup = False
    for attachment in attachments:
        binding_state = classify_owner_attachment(session, attachment, account_id=account_id)
        if binding_state in {
            OwnerAttachmentBinding.RETAIN_SHARED,
            OwnerAttachmentBinding.ACCOUNT_PROFILE,
        }:
            continue
        if binding_state in {
            OwnerAttachmentBinding.OWNER_PRIVATE,
            OwnerAttachmentBinding.INCONSISTENT,
        }:
            raise ConflictError(
                "Space offboarding media retention state is inconsistent.",
                SpaceOffboardingErrorCode.MEDIA_PARENT_INCONSISTENT,
            )

        needs_cleanup = True
        if attachment.status not in {
            AttachmentStatus.DELETING.value,
            AttachmentStatus.DELETE_FAILED.value,
        }:
            attachment_service.mark_for_deletion(session, attachment)
            marked += 1

    if needs_cleanup:
        attachment_cleanup.ensure_scheduled(session)
    return marked


def _shorten_owner_transfer_retention(
    session: Session,
    *,
    account_id: UUID,
    space_id: UUID,
) -> int:
    """Expire the leaver's Space Transfer artifacts through existing cleanup.

    No provider deletion happens in the exit transaction. The existing Transfer
    cleanup job owns physical artifact deletion and retry behavior. Moving the
    retention horizon to now also makes a stale Transfer worker self-expire the
    artifact before doing generation/import work.
    """
    current_time = now()
    exports = list(
        session.execute(
            select(TransferExport)
            .where(
                TransferExport.created_by == account_id,
                TransferExport.space_id == space_id,
            )
            .order_by(TransferExport.id)
            .with_for_update()
        ).scalars()
    )
    imports = list(
        session.execute(
            select(TransferImport)
            .where(
                TransferImport.created_by == account_id,
                TransferImport.space_id == space_id,
            )
            .order_by(TransferImport.id)
            .with_for_update()
        ).scalars()
    )

    changed = 0
    for transfer_export in exports:
        if transfer_export.expires_at > current_time:
            transfer_export.expires_at = current_time
            changed += 1
    for transfer_import in imports:
        if transfer_import.expires_at > current_time:
            transfer_import.expires_at = current_time
            changed += 1

    if exports or imports:
        transfer_jobs.ensure_scheduled(session)
    return changed


def leave_space(session: Session, account: Account, space_id: UUID) -> LeaveSpaceResult:
    """End only the caller's Membership in one Space.

    The caller's Membership is locked first because ordinary tenant requests
    and asynchronous provider effects hold a shared lock on that same row for
    their transaction. This guarantees that already-authorized work finishes
    before `LEFT` becomes durable and that later work cannot pass authorization.
    The Space row is then locked to serialize joining/invitations with the
    history transition.

    A caller who already left receives the same safe historical result without
    creating another lifecycle. A caller that never belonged to the Space
    receives the same privacy-safe 404 used by normal tenant access.

    Space-scoped OWNER_ONLY database rows are removed in the acceptance
    transaction. Private/unbound owner media is made immediately unreadable via
    the existing DELETING lifecycle, physical purge is delegated to the existing
    media cleanup chain, and this Space's Transfer retention is shortened to now
    so existing Transfer cleanup removes stale server-side artifacts. Shared
    media and the still-live Account profile remain untouched.

    If this exit removes the final active Membership, the V1 product-policy
    purge deadline is frozen on the Space in the same transaction. It is not
    recomputed later by the retention worker.
    """
    _ensure_self_exit_allowed()
    membership = _membership_for_update(
        session,
        account_id=account.id,
        space_id=space_id,
    )

    if membership.status != MembershipStatus.ACTIVE.value:
        return LeaveSpaceResult(
            membership=membership,
            changed=False,
            revoked_invitations=0,
            owner_only_cleanup=OwnerOnlyCleanupResult(total=0, by_table={}),
        )

    service.lock_space(session, space_id)
    revoked = _revoke_open_invitations(session, space_id)
    cleanup = hard_delete_owner_only_in_space(session, account.id, space_id)
    session.flush()
    _prepare_owner_media_cleanup(session, account_id=account.id, space_id=space_id)
    _shorten_owner_transfer_retention(session, account_id=account.id, space_id=space_id)
    service.end_membership(session, membership)
    session.flush()
    service.freeze_offboarding_purge_deadline_if_orphaned(session, space_id)
    session.flush()
    return LeaveSpaceResult(
        membership=membership,
        changed=True,
        revoked_invitations=revoked,
        owner_only_cleanup=cleanup,
    )
