"""#518 revalidation and concurrency guards for stale asynchronous Space work."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from time import sleep
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
from eimir.identity import effects as account_effects
from eimir.identity.models import Account
from eimir.outbox.models import OutboxEvent
from eimir.relationship import offboarding
from eimir.relationship.models import Membership, MembershipStatus
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


def test_async_membership_guard_blocks_self_exit(production_client) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker() as setup, setup.begin():
        owner = make_account(setup, "Anna")
        partner = make_account(setup, "Ben")
        space = make_space(setup, owner)
        add_member(setup, space.id, partner)
        owner_id = owner.id
        space_id = space.id

    guard_acquired = Event()
    release = Event()

    def hold_async_effect_boundary() -> None:
        with maker() as worker, worker.begin():
            assert account_effects.has_active_membership(
                worker,
                account_id=owner_id,
                space_id=space_id,
            )
            guard_acquired.set()
            assert release.wait(timeout=5)

    def leave_space() -> None:
        assert guard_acquired.wait(timeout=5)
        with maker() as leaver, leaver.begin():
            account = leaver.get(Account, owner_id)
            assert account is not None
            offboarding.leave_space(leaver, account, space_id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(hold_async_effect_boundary)
        assert guard_acquired.wait(timeout=5)
        leaver = pool.submit(leave_space)
        sleep(0.2)
        assert not leaver.done(), "self-exit must wait for the async Membership share lock"
        release.set()
        holder.result(timeout=5)
        leaver.result(timeout=5)

    with maker() as verify:
        membership = verify.execute(
            select(Membership).where(
                Membership.account_id == owner_id,
                Membership.space_id == space_id,
            )
        ).scalar_one()
        assert membership.status == MembershipStatus.LEFT.value
        assert not account_effects.has_active_membership(
            verify,
            account_id=owner_id,
            space_id=space_id,
        )


def test_stale_async_work_revalidates_membership_after_space_exit(session: Session) -> None:
    owner = make_account(session, "Anna")
    partner = make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)

    stale_thinking = thinking.send(
        session,
        AuthorizationContext(account_id=owner.id, space_id=space.id),
        client_request_id=uuid4(),
    )
    stale_event = session.get(OutboxEvent, stale_thinking.source_event_id)
    assert stale_event is not None

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
        offboarding.leave_space(session, owner, space.id)

        engagement_service.project_event(session, stale_event)
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
                Notification.source_event_id == stale_event.id
            )
        ).scalar_one()
        == 0
    )
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == push.ACCOUNT_UNAVAILABLE_CODE
    assert provider.calls == 0
    assert occurrence.state == OccurrenceState.CANCELLED.value
    assert transfer.status == ExportStatus.EXPIRED.value
