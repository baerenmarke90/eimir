"""Fail-closed convergence for asynchronous state after Account deletion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.engagement.models import Notification, PushDelivery, PushDeliveryStatus
from eimir.identity.deletion import DeletionNotAcceptedError, mark_deletion_failed
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import Account
from eimir.media import get_media_store
from eimir.reminders.models import ReminderPreference
from eimir.reminders.runtime_models import ReminderOccurrence, RulePreference
from eimir.transfer import service as transfer_service
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
)

ASYNC_CLEANUP_FAILURE_CODE = "ASYNC_CLEANUP_FAILED"
PUSH_ACCOUNT_DELETED_CODE = "ACCOUNT_DELETED"


@dataclass(frozen=True)
class AccountAsyncCleanupResult:
    """Non-sensitive counters from one idempotent async convergence pass."""

    reminder_preferences_removed: int = 0
    rule_preferences_removed: int = 0
    occurrences_removed: int = 0
    push_deliveries_suppressed: int = 0
    exports_revoked: int = 0
    imports_revoked: int = 0
    storage_failures: int = 0

    @property
    def converged(self) -> bool:
        return self.storage_failures == 0


def _account_for_update(session: Session, account_id: UUID) -> Account | None:
    return session.execute(
        select(Account).where(Account.id == account_id).with_for_update()
    ).scalar_one_or_none()


def _deletion_for_update(session: Session, account_id: UUID) -> AccountDeletion | None:
    return session.execute(
        select(AccountDeletion).where(AccountDeletion.account_id == account_id).with_for_update()
    ).scalar_one_or_none()


def _delete_count(session: Session, model: type[Any], predicate: Any) -> int:
    identifiers = list(session.execute(select(model.id).where(predicate)).scalars())
    if identifiers:
        session.execute(delete(model).where(model.id.in_(identifiers)))
    return len(identifiers)


def _suppress_actor_push_deliveries(session: Session, account_id: UUID) -> int:
    deliveries = list(
        session.execute(
            select(PushDelivery)
            .join(Notification, Notification.id == PushDelivery.notification_id)
            .where(
                Notification.actor_id == account_id,
                PushDelivery.status.in_(
                    [
                        PushDeliveryStatus.PENDING.value,
                        PushDeliveryStatus.RETRYING.value,
                    ]
                ),
            )
            .with_for_update()
        ).scalars()
    )
    moment = now()
    for delivery in deliveries:
        delivery.status = PushDeliveryStatus.UNAVAILABLE.value
        delivery.last_error_code = PUSH_ACCOUNT_DELETED_CODE
        delivery.finished_at = moment
    return len(deliveries)


def _revoke_transfers(
    session: Session,
    account_id: UUID,
) -> tuple[int, int, int]:
    exports = list(
        session.execute(
            select(TransferExport)
            .where(TransferExport.created_by == account_id)
            .order_by(TransferExport.id)
            .with_for_update()
        ).scalars()
    )
    imports = list(
        session.execute(
            select(TransferImport)
            .where(TransferImport.created_by == account_id)
            .order_by(TransferImport.id)
            .with_for_update()
        ).scalars()
    )
    store = get_media_store()
    storage_failures = 0

    for export in exports:
        export.status = ExportStatus.EXPIRED.value
        try:
            store.delete(transfer_service.export_storage_key(export))
        except OSError:
            storage_failures += 1
        else:
            export.artifact_size = None

    for import_transfer in imports:
        import_transfer.status = ImportStatus.EXPIRED.value
        try:
            store.delete(transfer_service.import_storage_key(import_transfer))
        except OSError:
            storage_failures += 1
        else:
            # Import artifacts have a non-null size contract; zero is the
            # existing marker used after provider cleanup.
            import_transfer.artifact_size = 0

    return len(exports), len(imports), storage_failures


def apply_account_async_cleanup(
    session: Session,
    account_id: UUID,
) -> AccountAsyncCleanupResult:
    """Converge recipient/runtime work for an accepted, disabled Account.

    Shared domain rows are not touched. Recipient-scoped preference/occurrence
    state is removed, pending pushes caused by the deleted actor are made
    terminal, and temporary Transfer artifacts are made unusable before their
    provider objects are deleted. Provider failures leave the Account disabled
    and the lifecycle retryable with a bounded technical code.
    """
    account = _account_for_update(session, account_id)
    if account is None:
        return AccountAsyncCleanupResult()

    deletion = _deletion_for_update(session, account_id)
    if deletion is None or account.disabled_at is None:
        raise DeletionNotAcceptedError(
            "Account async cleanup requires a committed fail-closed deletion tombstone."
        )

    reminder_preferences_removed = _delete_count(
        session,
        ReminderPreference,
        ReminderPreference.account_id == account_id,
    )
    rule_preferences_removed = _delete_count(
        session,
        RulePreference,
        RulePreference.account_id == account_id,
    )
    occurrences_removed = _delete_count(
        session,
        ReminderOccurrence,
        ReminderOccurrence.recipient_account_id == account_id,
    )
    push_deliveries_suppressed = _suppress_actor_push_deliveries(session, account_id)
    exports_revoked, imports_revoked, storage_failures = _revoke_transfers(session, account_id)

    if storage_failures:
        mark_deletion_failed(
            session,
            account_id,
            failure_code=ASYNC_CLEANUP_FAILURE_CODE,
        )
    elif (
        deletion.status == AccountDeletionStatus.FAILED.value
        and deletion.last_failure_code == ASYNC_CLEANUP_FAILURE_CODE
    ):
        deletion.status = AccountDeletionStatus.PENDING.value
        deletion.failed_at = None
        deletion.last_failure_code = None
        deletion.completed_at = None

    session.flush()
    return AccountAsyncCleanupResult(
        reminder_preferences_removed=reminder_preferences_removed,
        rule_preferences_removed=rule_preferences_removed,
        occurrences_removed=occurrences_removed,
        push_deliveries_suppressed=push_deliveries_suppressed,
        exports_revoked=exports_revoked,
        imports_revoked=imports_revoked,
        storage_failures=storage_failures,
    )
