"""Authoritative convergence workflow for irreversibly accepted Account deletion."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.core.clock import now
from eimir.db.session import unit_of_work
from eimir.identity.deletion import (
    DeletionAcceptanceConflictError,
    DeletionNotAcceptedError,
    apply_accepted_tombstone,
    apply_core_cleanup,
)
from eimir.identity.deletion_async import apply_account_async_cleanup
from eimir.identity.deletion_media import apply_account_media_cleanup
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import Account


class DeletionMediaCleanupError(RuntimeError):
    """An accepted deletion could not converge provider-backed Account media."""


class DeletionAsyncCleanupError(RuntimeError):
    """An accepted deletion could not converge stale asynchronous Account work."""


class DeletionCompletionError(RuntimeError):
    """Completion was attempted while a required deletion phase was not converged."""


def _mark_completed(account_id: UUID, *, accepted_at: datetime) -> None:
    """Set the only terminal success state after every prior phase committed."""
    with unit_of_work() as session:
        account = session.execute(
            select(Account).where(Account.id == account_id).with_for_update()
        ).scalar_one_or_none()
        if account is None:
            # Future final retention may remove the pseudonymous Account row.
            # A journal replay after that point remains idempotently complete.
            return

        deletion = session.execute(
            select(AccountDeletion)
            .where(AccountDeletion.account_id == account_id)
            .with_for_update()
        ).scalar_one_or_none()
        if deletion is None or account.disabled_at is None:
            raise DeletionNotAcceptedError(
                "Account deletion completion requires a committed fail-closed tombstone."
            )
        if deletion.accepted_at != accepted_at:
            raise DeletionAcceptanceConflictError(
                "Account deletion acceptance timestamp conflicts with the forward journal."
            )
        if deletion.status == AccountDeletionStatus.COMPLETED.value:
            return
        if deletion.status != AccountDeletionStatus.PENDING.value:
            raise DeletionCompletionError(
                "Account deletion cannot complete while a cleanup phase is failed."
            )

        deletion.status = AccountDeletionStatus.COMPLETED.value
        deletion.completed_at = now()
        deletion.failed_at = None
        deletion.last_failure_code = None
        administration.record_account_deletion_outcome(
            session,
            target_account_id=account_id,
            action=AdministrationAction.ACCOUNT_DELETION_COMPLETED,
        )
        session.flush()


def converge_accepted_deletion(account_id: UUID, *, accepted_at: datetime) -> None:
    """Converge one journal-accepted Account deletion to its terminal state.

    Each boundary commits independently. The first transaction establishes the
    irreversible fail-closed state. Core cleanup, provider-backed media cleanup,
    and stale async convergence then commit separately so a later failure can
    never roll back Account deactivation or already completed privacy cleanup.
    Only after every required phase reports convergence does the final small
    transaction mark the lifecycle ``COMPLETED``.
    """
    with unit_of_work() as session:
        deletion = apply_accepted_tombstone(
            session,
            account_id,
            accepted_at=accepted_at,
        )
        if deletion is None:
            return
        already_completed = deletion.status == AccountDeletionStatus.COMPLETED.value
    if already_completed:
        return

    with unit_of_work() as session:
        apply_core_cleanup(session, account_id)

    with unit_of_work() as session:
        media_result = apply_account_media_cleanup(session, account_id)
    if not media_result.converged:
        raise DeletionMediaCleanupError("Account deletion media cleanup did not converge.")

    with unit_of_work() as session:
        async_result = apply_account_async_cleanup(session, account_id)
    if not async_result.converged:
        raise DeletionAsyncCleanupError("Account deletion async cleanup did not converge.")

    _mark_completed(account_id, accepted_at=accepted_at)
