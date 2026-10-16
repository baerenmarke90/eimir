"""Handler-level revalidation for work that predates Account deletion."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement import push, thinking
from eimir.engagement import service as engagement_service
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
)
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.models import Account
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from eimir.relationship.service import add_member
from eimir.reminders import runtime as reminder_runtime
from eimir.reminders.models import (
    Reminder,
    ReminderPayload,
    ReminderScheduleType,
    ReminderSource,
)
from eimir.reminders.runtime_models import OccurrenceState, ReminderOccurrence
from eimir.transfer import jobs as transfer_jobs
from eimir.transfer.models import ExportStatus, TransferExport, TransferScope
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class _RecordingProvider:
    def __init__(self) -> None:
        self.calls = 0

    def send(self, **kwargs):  # type: ignore[no-untyped-def]
        del kwargs
        self.calls += 1
        return push.PushSendResult(provider_message_id="unexpected")


def test_stale_outbox_push_reminder_and_transfer_work_revalidates_deleted_account(
    session: Session,
) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)

    stale_thinking = thinking.send(
        session,
        AuthorizationContext(account_id=owner.id, space_id=space.id),
        client_request_id=uuid4(),
    )
    stale_thinking_event = session.get(OutboxEvent, stale_thinking.source_event_id)
    assert stale_thinking_event is not None

    endpoint = push.register_endpoint(
        session,
        account_id=partner.id,
        provider_key="recording",
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
    delivery = PushDelivery(
        notification_id=historical_notification.id,
        push_endpoint_id=endpoint.id,
        provider_key="recording",
        status=PushDeliveryStatus.PENDING.value,
        attempts=0,
    )
    session.add(delivery)

    reminder = Reminder(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        source=ReminderSource.MANUAL.value,
        schedule_type=ReminderScheduleType.ONCE.value,
        once_at=now(),
        payload=ReminderPayload(title="Shared reminder"),
    )
    session.add(reminder)
    session.flush()
    occurrence = ReminderOccurrence(
        reminder_id=reminder.id,
        recipient_account_id=owner.id,
        occurrence_key="once:stale",
        days_before=0,
        due_at=now(),
        state=OccurrenceState.PENDING.value,
        generation=1,
    )
    session.add(occurrence)
    session.flush()
    stale_reminder_event = outbox_service.record(
        session,
        DomainEvent(
            type=EventType.REMINDER_DUE,
            space_id=space.id,
            actor_id=None,
            subject_type="REMINDER",
            subject_id=reminder.id,
            resource_version=reminder.version,
            payload=PublicEventPayload(
                recipient_id=owner.id,
                occurrence_id=occurrence.id,
                due_at=occurrence.due_at,
            ),
        ),
    )

    transfer = TransferExport(
        space_id=space.id,
        created_by=owner.id,
        scope=TransferScope.PERSONAL.value,
        status=ExportStatus.QUEUED.value,
        expires_at=now() + timedelta(hours=12),
    )
    session.add(transfer)
    session.flush()

    provider = _RecordingProvider()
    push.providers.register("recording", provider)
    try:
        apply_accepted_tombstone(session, owner.id, accepted_at=now())
        apply_core_cleanup(session, owner.id)

        engagement_service.project_event(session, stale_thinking_event)
        engagement_service.project_event(session, stale_reminder_event)
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        reminder_runtime.handle_occurrence(
            session,
            {"occurrenceId": str(occurrence.id), "generation": occurrence.generation},
        )
        transfer_jobs.handle_export(session, {"exportId": str(transfer.id)})
        session.flush()
    finally:
        push.providers.clear()

    assert (
        session.execute(
            select(func.count(Notification.id)).where(
                Notification.source_event_id.in_([stale_thinking_event.id, stale_reminder_event.id])
            )
        ).scalar_one()
        == 0
    )
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == push.ACCOUNT_UNAVAILABLE_CODE
    assert provider.calls == 0
    assert occurrence.state == OccurrenceState.CANCELLED.value
    assert transfer.status == ExportStatus.FAILED.value


def test_push_delivery_locks_accounts_before_delivery_row(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker() as setup, setup.begin():
        owner = make_account(setup, "Anna")
        partner = make_account(setup, "Ben")
        space = make_space(setup, owner)
        add_member(setup, space.id, partner)
        endpoint = push.register_endpoint(
            setup,
            account_id=partner.id,
            provider_key="recording",
            endpoint_value="partner-lock-order-endpoint",
        )
        notification = Notification(
            space_id=space.id,
            recipient_account_id=partner.id,
            source_event_id=uuid4(),
            kind=NotificationKind.THINKING_OF_YOU.value,
            actor_id=owner.id,
            target_type=None,
            target_id=None,
            created_at=now(),
        )
        setup.add(notification)
        setup.flush()
        delivery = PushDelivery(
            notification_id=notification.id,
            push_endpoint_id=endpoint.id,
            provider_key="recording",
            status=PushDeliveryStatus.PENDING.value,
            attempts=0,
        )
        setup.add(delivery)
        setup.flush()
        owner_id = owner.id
        delivery_id = delivery.id

    account_lock_entered = Event()
    original_lock_enabled_accounts = push.account_effects.lock_enabled_accounts

    def observed_account_lock(session, account_ids):  # type: ignore[no-untyped-def]
        account_lock_entered.set()
        return original_lock_enabled_accounts(session, account_ids)

    monkeypatch.setattr(
        push.account_effects,
        "lock_enabled_accounts",
        observed_account_lock,
    )

    provider = _RecordingProvider()
    push.providers.register("recording", provider)
    try:

        def run_delivery() -> None:
            with maker() as worker, worker.begin():
                push.handle_delivery(worker, {"deliveryId": str(delivery_id)})

        with ThreadPoolExecutor(max_workers=1) as pool:
            with maker() as blocker:
                transaction = blocker.begin()
                try:
                    blocker.execute(
                        select(Account).where(Account.id == owner_id).with_for_update()
                    ).scalar_one()
                    future = pool.submit(run_delivery)
                    assert account_lock_entered.wait(timeout=5)
                    locked_delivery = blocker.execute(
                        select(PushDelivery)
                        .where(PushDelivery.id == delivery_id)
                        .with_for_update(nowait=True)
                    ).scalar_one()
                    assert locked_delivery.id == delivery_id
                finally:
                    transaction.rollback()
            future.result(timeout=5)
    finally:
        push.providers.clear()

    with maker() as verify:
        delivery = verify.get(PushDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert provider.calls == 1
