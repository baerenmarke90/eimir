"""Fail-closed async convergence after irreversible Account deletion acceptance."""

from __future__ import annotations

from datetime import timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.engagement import push, thinking
from eimir.engagement import service as engagement_service
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
)
from eimir.identity import deletion_async
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.deletion_async import (
    ASYNC_CLEANUP_FAILURE_CODE,
    PUSH_ACCOUNT_DELETED_CODE,
    apply_account_async_cleanup,
)
from eimir.identity.deletion_models import AccountDeletionStatus
from eimir.media.local import LocalMediaStore
from eimir.outbox.models import OutboxEvent
from eimir.relationship.service import add_member
from eimir.reminders import runtime as reminder_runtime
from eimir.reminders.models import (
    Reminder,
    ReminderPayload,
    ReminderPreference,
    ReminderScheduleType,
    ReminderSource,
)
from eimir.reminders.runtime_models import OccurrenceState, ReminderOccurrence, RulePreference
from eimir.transfer import jobs as transfer_jobs
from eimir.transfer import service as transfer_service
from eimir.transfer.models import (
    ExportStatus,
    ImportStatus,
    TransferExport,
    TransferImport,
    TransferScope,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _shared_reminder(session: Session, *, owner_id, space_id) -> Reminder:  # type: ignore[no-untyped-def]
    reminder = Reminder(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        source=ReminderSource.MANUAL.value,
        schedule_type=ReminderScheduleType.ONCE.value,
        once_at=now(),
        payload=ReminderPayload(title="Shared reminder"),
    )
    session.add(reminder)
    session.flush()
    return reminder


def _export(session: Session, *, account_id, space_id, status: ExportStatus) -> TransferExport:  # type: ignore[no-untyped-def]
    transfer = TransferExport(
        space_id=space_id,
        created_by=account_id,
        scope=TransferScope.PERSONAL.value,
        status=status.value,
        artifact_size=8 if status is ExportStatus.READY else None,
        ready_at=now() if status is ExportStatus.READY else None,
        expires_at=now() + timedelta(hours=12),
    )
    session.add(transfer)
    session.flush()
    return transfer


def _import(session: Session, *, account_id, space_id) -> TransferImport:  # type: ignore[no-untyped-def]
    transfer = TransferImport(
        space_id=space_id,
        created_by=account_id,
        status=ImportStatus.READY_TO_APPLY.value,
        scope=TransferScope.PERSONAL.value,
        artifact_size=8,
        expires_at=now() + timedelta(hours=12),
    )
    session.add(transfer)
    session.flush()
    return transfer


def test_async_cleanup_removes_recipient_state_revokes_transfers_and_suppresses_stale_work(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)
    reminder = _shared_reminder(session, owner_id=owner.id, space_id=space.id)

    owner_preference = ReminderPreference(reminder_id=reminder.id, account_id=owner.id, muted=True)
    partner_preference = ReminderPreference(
        reminder_id=reminder.id, account_id=partner.id, muted=True
    )
    owner_rule = RulePreference(
        account_id=owner.id,
        space_id=space.id,
        rule_key="relationship.anniversary",
        enabled=True,
        parameters={},
    )
    partner_rule = RulePreference(
        account_id=partner.id,
        space_id=space.id,
        rule_key="relationship.anniversary",
        enabled=True,
        parameters={},
    )
    owner_occurrence = ReminderOccurrence(
        reminder_id=reminder.id,
        recipient_account_id=owner.id,
        occurrence_key="once:owner",
        days_before=0,
        due_at=now(),
        state=OccurrenceState.PENDING.value,
        generation=1,
    )
    partner_occurrence = ReminderOccurrence(
        reminder_id=reminder.id,
        recipient_account_id=partner.id,
        occurrence_key="once:partner",
        days_before=0,
        due_at=now(),
        state=OccurrenceState.PENDING.value,
        generation=1,
    )
    session.add_all(
        [
            owner_preference,
            partner_preference,
            owner_rule,
            partner_rule,
            owner_occurrence,
            partner_occurrence,
        ]
    )

    stale_thinking = thinking.send(
        session,
        AuthorizationContext(account_id=owner.id, space_id=space.id),
        client_request_id=uuid4(),
    )
    stale_event = session.get(OutboxEvent, stale_thinking.source_event_id)
    assert stale_event is not None

    partner_endpoint = push.register_endpoint(
        session,
        account_id=partner.id,
        provider_key="fake",
        endpoint_value="partner-secret-endpoint",
    )
    historical_notification = Notification(
        space_id=space.id,
        recipient_account_id=partner.id,
        source_event_id=uuid4(),
        kind=NotificationKind.THINKING_OF_YOU.value,
        actor_id=owner.id,
        target_type=None,
        target_id=None,
        created_at=now(),
    )
    session.add(historical_notification)
    session.flush()
    pending_partner_push = PushDelivery(
        notification_id=historical_notification.id,
        push_endpoint_id=partner_endpoint.id,
        provider_key="fake",
        status=PushDeliveryStatus.PENDING.value,
        attempts=0,
    )
    session.add(pending_partner_push)

    ready_export = _export(
        session,
        account_id=owner.id,
        space_id=space.id,
        status=ExportStatus.READY,
    )
    queued_export = _export(
        session,
        account_id=owner.id,
        space_id=space.id,
        status=ExportStatus.QUEUED,
    )
    owner_import = _import(session, account_id=owner.id, space_id=space.id)
    partner_export = _export(
        session,
        account_id=partner.id,
        space_id=space.id,
        status=ExportStatus.READY,
    )
    session.flush()

    store = LocalMediaStore(tmp_path / "media")
    monkeypatch.setattr(deletion_async, "get_media_store", lambda: store)
    store.put(
        transfer_service.export_storage_key(ready_export),
        BytesIO(b"export!!"),
        "application/zip",
    )
    store.put(
        transfer_service.import_storage_key(owner_import),
        BytesIO(b"import!!"),
        "application/zip",
    )
    store.put(
        transfer_service.export_storage_key(partner_export),
        BytesIO(b"partner!"),
        "application/zip",
    )

    accepted_at = now()
    apply_accepted_tombstone(session, owner.id, accepted_at=accepted_at)
    apply_core_cleanup(session, owner.id)
    result = apply_account_async_cleanup(session, owner.id)

    assert result.reminder_preferences_removed == 1
    assert result.rule_preferences_removed == 1
    assert result.occurrences_removed == 1
    assert result.push_deliveries_suppressed == 1
    assert result.exports_revoked == 2
    assert result.imports_revoked == 1
    assert result.storage_failures == 0
    assert result.converged

    assert session.get(ReminderPreference, owner_preference.id) is None
    assert session.get(RulePreference, owner_rule.id) is None
    assert session.get(ReminderOccurrence, owner_occurrence.id) is None
    assert session.get(ReminderPreference, partner_preference.id) is not None
    assert session.get(RulePreference, partner_rule.id) is not None
    assert session.get(ReminderOccurrence, partner_occurrence.id) is not None

    assert ready_export.status == ExportStatus.EXPIRED.value
    assert ready_export.artifact_size is None
    assert queued_export.status == ExportStatus.EXPIRED.value
    assert owner_import.status == ImportStatus.EXPIRED.value
    assert owner_import.artifact_size == 0
    assert not store.exists(transfer_service.export_storage_key(ready_export))
    assert not store.exists(transfer_service.import_storage_key(owner_import))
    assert partner_export.status == ExportStatus.READY.value
    assert store.exists(transfer_service.export_storage_key(partner_export))

    assert pending_partner_push.status == PushDeliveryStatus.UNAVAILABLE.value
    assert pending_partner_push.last_error_code == PUSH_ACCOUNT_DELETED_CODE
    assert session.get(Notification, historical_notification.id) is not None

    engagement_service.project_event(session, stale_event)
    transfer_jobs.handle_export(session, {"exportId": str(queued_export.id)})
    reminder_runtime.handle_occurrence(
        session,
        {"occurrenceId": str(owner_occurrence.id), "generation": 1},
    )
    session.flush()

    assert (
        session.execute(
            select(func.count(Notification.id)).where(
                Notification.source_event_id == stale_event.id
            )
        ).scalar_one()
        == 0
    )
    assert queued_export.status == ExportStatus.EXPIRED.value
    assert session.get(ReminderOccurrence, owner_occurrence.id) is None

    deletion = apply_core_cleanup(session, owner.id)
    assert deletion is not None
    assert deletion.status == AccountDeletionStatus.PENDING.value
    assert deletion.completed_at is None
    assert owner.disabled_at == accepted_at


class _FailDeleteOnceStore(LocalMediaStore):
    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.fail_once = True

    def delete(self, storage_key: str) -> None:
        if self.fail_once:
            self.fail_once = False
            raise OSError("synthetic provider failure")
        super().delete(storage_key)


def test_async_cleanup_transfer_delete_failure_is_fail_closed_and_retryable(
    session: Session,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_account(session, "Anna")
    space = make_space(session, owner)
    transfer = _export(
        session,
        account_id=owner.id,
        space_id=space.id,
        status=ExportStatus.READY,
    )
    store = _FailDeleteOnceStore(tmp_path / "media")
    monkeypatch.setattr(deletion_async, "get_media_store", lambda: store)
    key = transfer_service.export_storage_key(transfer)
    store.put(key, BytesIO(b"export!!"), "application/zip")

    accepted_at = now()
    apply_accepted_tombstone(session, owner.id, accepted_at=accepted_at)
    apply_core_cleanup(session, owner.id)

    first = apply_account_async_cleanup(session, owner.id)
    assert first.storage_failures == 1
    assert not first.converged
    assert transfer.status == ExportStatus.EXPIRED.value
    assert transfer.artifact_size == 8
    assert store.exists(key)

    deletion = apply_core_cleanup(session, owner.id)
    assert deletion is not None
    assert deletion.status == AccountDeletionStatus.FAILED.value
    assert deletion.last_failure_code == ASYNC_CLEANUP_FAILURE_CODE
    assert owner.disabled_at == accepted_at

    second = apply_account_async_cleanup(session, owner.id)
    assert second.storage_failures == 0
    assert second.converged
    assert transfer.status == ExportStatus.EXPIRED.value
    assert transfer.artifact_size is None
    assert not store.exists(key)

    deletion = apply_core_cleanup(session, owner.id)
    assert deletion is not None
    assert deletion.status == AccountDeletionStatus.PENDING.value
    assert deletion.last_failure_code is None
    assert deletion.completed_at is None
    assert owner.disabled_at == accepted_at
