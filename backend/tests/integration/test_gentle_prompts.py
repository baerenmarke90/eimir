"""Real PostgreSQL coverage for consent, private learning and canonical delivery."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, time, timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core import clock
from eimir.domain.events import EventType
from eimir.engagement import gentle, gentle_delivery, notification_preferences, push, service
from eimir.engagement.models import (
    GentleMemoryExclusion,
    GentleOccasion,
    GentleProfile,
    Notification,
    PushDelivery,
    PushDeliveryStatus,
)
from eimir.memories.models import Memory, MemoryPayload
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationships
from eimir.relationship.models import Membership, MembershipStatus
from eimir.reminders.models import Reminder, ReminderPayload
from eimir.reminders.runtime_models import ReminderOccurrence
from eimir.story import view_service
from eimir.story.service import StoryKind
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_thinking_push import FakePushProvider as BasePushProvider

pytestmark = [pytest.mark.integration, requires_database]
NOW = datetime(2026, 11, 3, 18, 30, tzinfo=UTC)


class FakePushProvider(BasePushProvider):
    def supports_notification_reference(self, endpoint: str) -> bool:
        return self.accepts_endpoint(endpoint)


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: NOW)
    push.providers.clear()
    yield
    push.providers.clear()


def _seed(session: Session):  # type: ignore[no-untyped-def]
    owner = make_account(session, "Recipient")
    partner = make_account(session, "Partner")
    owner.timezone = "UTC"
    space = make_space(session, owner)
    relationships.add_member(session, space.id, partner)
    session.flush()
    context = AuthorizationContext(account_id=owner.id, space_id=space.id)
    return owner, partner, space, context


def _learn(session: Session, context: AuthorizationContext, *, reading: bool = False) -> None:
    gentle.set_enabled(session, context.account_id, True)
    for days in (21, 20, 19):
        gentle.record_use(session, context, at=NOW - timedelta(days=days), memory_read=reading)


def _endpoint(session: Session, account_id: UUID, *, provider: FakePushProvider | None = None):  # type: ignore[no-untyped-def]
    provider = provider or FakePushProvider()
    push.providers.register("gentle-test", provider)
    endpoint = push.register_endpoint(
        session,
        account_id=account_id,
        provider_key="gentle-test",
        endpoint_value=f"secret-{uuid4()}",
    )
    return provider, endpoint


def _queued(session: Session, account_id: UUID) -> tuple[GentleOccasion, PushDelivery]:
    occasion = gentle.reserve(session, account_id)
    assert occasion is not None
    session.flush()
    event = session.scalars(
        select(OutboxEvent).where(
            OutboxEvent.event_type == EventType.GENTLE_PROMPT_READY.value,
            OutboxEvent.subject_id == occasion.id,
        )
    ).one()
    service.project_event(session, event)
    session.flush()
    delivery = session.scalars(
        select(PushDelivery).where(PushDelivery.notification_id == occasion.notification_id)
    ).one()
    return occasion, delivery


def _memory(session: Session, context: AuthorizationContext) -> Memory:
    item = Memory(
        space_id=context.space_id,
        owner_id=context.account_id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        created_at=NOW - timedelta(days=200),
        happened_on=(NOW - timedelta(days=200)).date(),
        payload=MemoryPayload(title="Protected title", body="Protected narrative"),
    )
    session.add(item)
    session.flush()
    return item


def test_default_off_and_group_or_permission_choices_are_not_adaptive_consent(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    owner, partner, space, _context = _seed(session)
    _endpoint(session, owner.id)
    token = auth(sign_in(session, owner))
    preferences = client.get("/api/v1/notification-preferences", headers=token)
    entry = next(item for item in preferences.json()["items"] if item["kind"] == gentle.KIND)
    assert all(not channel["enabled"] for channel in entry["channels"])
    assert [channel["configurable"] for channel in entry["channels"]] == [False, True, False]
    assert not notification_preferences.push_enabled(session, account_id=owner.id, kind=gentle.KIND)
    path = f"/api/v1/spaces/{space.id}/gentle-prompts"
    assert client.post(f"{path}/use", json={"kind": "FOREGROUND"}, headers=token).status_code == 204
    assert client.get(f"{path}/suggestion", headers=token).json() is None
    assert session.get(GentleProfile, owner.id) is None
    assert not gentle.enabled(session, partner.id)
    for channel in ("IN_APP", "EMAIL"):
        assert (
            client.patch(
                f"/api/v1/notification-preferences/{gentle.KIND}/{channel}",
                json={"enabled": True},
                headers=token,
            ).status_code
            == 409
        )


def test_receipts_use_server_time_and_reject_background_import_or_foreign_identity(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    owner, partner, space, _context = _seed(session)
    token = auth(sign_in(session, owner))
    gentle.set_enabled(session, owner.id, True)
    path = f"/api/v1/spaces/{space.id}/gentle-prompts/use"
    for body in (
        {"kind": "IMPORT"},
        {"kind": "BACKGROUND"},
        {"kind": "FOREGROUND", "accountId": str(partner.id)},
        {"kind": "FOREGROUND", "at": "2000-01-01T00:00:00Z"},
    ):
        assert client.post(path, json=body, headers=token).status_code == 422
    assert client.post(path, json={"kind": "FOREGROUND"}).status_code == 401
    assert client.post(path, json={"kind": "FOREGROUND"}, headers=token).status_code == 204
    profile = session.get(GentleProfile, owner.id)
    assert profile is not None and profile.last_use_at == NOW
    assert profile.interval_days is None
    assert session.get(GentleProfile, partner.id) is None
    outsider = make_account(session, "Outsider")
    foreign = auth(sign_in(session, outsider))
    assert client.post(path, json={"kind": "FOREGROUND"}, headers=foreign).status_code == 404


def test_one_account_reservation_and_one_supported_device_do_not_create_an_unread_item(
    session: Session,
) -> None:
    owner, _, _, context = _seed(session)
    _learn(session, context)
    _endpoint(session, owner.id)
    _endpoint(session, owner.id)
    occasion, delivery = _queued(session, owner.id)
    assert gentle.reserve(session, owner.id) is None
    assert (
        session.scalar(
            select(func.count())
            .select_from(PushDelivery)
            .where(PushDelivery.notification_id == occasion.notification_id)
        )
        == 1
    )
    notification = session.get(Notification, delivery.notification_id)
    assert notification is not None and notification.in_app_visible is False
    assert notification.actor_id is None
    assert service.unread_count(session, context) == 0


@pytest.mark.parametrize("change", ["opt_out", "activity", "expiry", "quiet_hours", "membership"])
def test_changes_between_enqueue_and_submission_cancel_delivery(
    session: Session, monkeypatch: pytest.MonkeyPatch, change: str
) -> None:
    owner, _, space, context = _seed(session)
    _learn(session, context)
    provider, _ = _endpoint(session, owner.id)
    occasion, delivery = _queued(session, owner.id)
    if change == "opt_out":
        gentle.set_enabled(session, owner.id, False)
    elif change == "activity":
        gentle.record_use(session, context)
    elif change == "expiry":
        monkeypatch.setattr(clock, "now", lambda: occasion.expires_at)
    elif change == "quiet_hours":
        owner.quiet_hours_start, owner.quiet_hours_end = time(18), time(21)
    else:
        membership = session.scalars(
            select(Membership).where(
                Membership.account_id == owner.id, Membership.space_id == space.id
            )
        ).one()
        membership.status = MembershipStatus.LEFT.value
    session.flush()
    payload = gentle_delivery.prepare(session, {"deliveryId": str(delivery.id)})
    push.handle_delivery(session, payload)
    assert provider.calls == []
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value


def test_exclusion_is_personal_survives_opt_out_and_keeps_content(session: Session) -> None:
    owner, partner, _space, context = _seed(session)
    _learn(session, context, reading=True)
    memory = _memory(session, context)
    suggestion = gentle.suggestion(session, context)
    assert suggestion is not None and suggestion.memory_id == memory.id
    gentle.exclude_memory(session, context, memory.id)
    gentle.set_enabled(session, owner.id, False)
    assert session.get(GentleProfile, owner.id) is None
    assert session.get(GentleMemoryExclusion, (owner.id, memory.id)) is not None
    assert session.get(GentleMemoryExclusion, (partner.id, memory.id)) is None
    assert session.get(Memory, memory.id) is memory
    gentle.set_enabled(session, owner.id, True)
    fresh = session.get(GentleProfile, owner.id)
    assert fresh is not None and fresh.observations == [] and fresh.interval_days is None
    assert not gentle.source_available(session, context, memory.id, at=NOW)


def test_recent_own_views_and_repeat_suppression_do_not_use_partner_views(session: Session) -> None:
    _owner, partner, space, context = _seed(session)
    _learn(session, context, reading=True)
    memory = _memory(session, context)
    partner_context = AuthorizationContext(account_id=partner.id, space_id=space.id)
    view_service.record_intentional_view(
        session, partner_context, account_timezone="UTC", kind=StoryKind.MEMORY, item_id=memory.id
    )
    assert gentle.source_available(session, context, memory.id, at=NOW)
    view_service.record_intentional_view(
        session, context, account_timezone="UTC", kind=StoryKind.MEMORY, item_id=memory.id
    )
    assert not gentle.source_available(session, context, memory.id, at=NOW)
    assert gentle.source_available(session, context, memory.id, at=NOW + timedelta(days=31))


def test_manual_reminder_collision_is_account_wide_and_no_in_app_fetch_consumes_budget(
    session: Session,
) -> None:
    owner, _, space, context = _seed(session)
    _learn(session, context)
    _endpoint(session, owner.id)
    suggestion = gentle.suggestion(session, context)
    assert suggestion is not None
    profile = session.get(GentleProfile, owner.id)
    assert (
        profile is not None and profile.last_attempt_at is None and profile.attempts_since_use == 0
    )
    assert (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.event_type == EventType.GENTLE_PROMPT_READY.value)
        )
        == 0
    )
    reminder = Reminder(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        source="MANUAL",
        schedule_type="ONCE",
        once_at=NOW,
        payload=ReminderPayload(title="Explicit appointment"),
    )
    session.add(reminder)
    session.flush()
    session.add(
        ReminderOccurrence(
            reminder_id=reminder.id,
            recipient_account_id=owner.id,
            occurrence_key="once",
            days_before=0,
            due_at=NOW,
            state="PENDING",
        )
    )
    session.flush()
    assert gentle.reserve(session, owner.id) is None


def test_opt_out_cancels_prepared_candidate_and_releases_certain_non_delivery(
    session: Session,
) -> None:
    owner, _, _, context = _seed(session)
    _learn(session, context)
    provider, _ = _endpoint(session, owner.id)
    occasion, delivery = _queued(session, owner.id)
    payload = gentle_delivery.prepare(session, {"deliveryId": str(delivery.id)})
    assert payload.get("gentleSubmissionToken")
    gentle.set_enabled(session, owner.id, False)
    push.handle_delivery(session, payload)
    session.flush()
    assert provider.calls == []
    assert occasion.attempted_at is None


def test_provider_ambiguity_counts_once_and_never_retries_transport(session: Session) -> None:
    owner, _, _, context = _seed(session)
    _learn(session, context)
    provider, _ = _endpoint(session, owner.id, provider=FakePushProvider(fail_once=True))
    occasion, delivery = _queued(session, owner.id)
    payload = gentle_delivery.prepare(session, {"deliveryId": str(delivery.id)})
    push.handle_delivery(session, payload)
    assert len(provider.calls) == 1
    assert delivery.status == PushDeliveryStatus.FAILED.value
    push.handle_delivery(
        session, gentle_delivery.prepare(session, {"deliveryId": str(delivery.id)})
    )
    profile = session.get(GentleProfile, owner.id)
    assert profile is not None and profile.attempts_since_use == 1
    assert profile.last_attempt_at == occasion.attempted_at == NOW
    assert len(provider.calls) == 1
    assert gentle.reserve(session, owner.id) is None


def test_concurrent_workers_share_one_account_reservation(production_client) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker() as setup:
        owner, _, _, context = _seed(setup)
        _learn(setup, context)
        _endpoint(setup, owner.id)
        account_id = owner.id
        setup.commit()
    barrier = Barrier(2)

    def reserve(_: int) -> bool:
        with maker() as worker:
            barrier.wait(timeout=10)
            result = gentle.reserve(worker, account_id)
            worker.commit()
            return result is not None

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(reserve, range(2))) == 1
    with maker() as check:
        assert (
            check.scalar(
                select(func.count())
                .select_from(GentleOccasion)
                .where(GentleOccasion.account_id == account_id)
            )
            == 1
        )


def test_durable_claim_prevents_resubmission_after_provider_success_and_database_rollback(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker() as setup:
        owner, _, _, context = _seed(setup)
        _learn(setup, context)
        provider, _ = _endpoint(setup, owner.id)
        _, delivery = _queued(setup, owner.id)
        account_id, delivery_id = owner.id, delivery.id
        setup.commit()
    with maker() as preparation:
        payload = gentle_delivery.prepare(preparation, {"deliveryId": str(delivery_id)})
        assert payload.get("gentleSubmissionToken")
        preparation.commit()
    with maker() as crashed:
        push.handle_delivery(crashed, payload)
        assert len(provider.calls) == 1
        crashed.rollback()
    with maker() as recovered:
        replay = gentle_delivery.prepare(recovered, {"deliveryId": str(delivery_id)})
        assert "gentleSubmissionToken" not in replay
        push.handle_delivery(recovered, replay)
        recovered.commit()
    assert len(provider.calls) == 1
    with maker() as check:
        profile = check.get(GentleProfile, account_id)
        assert (
            profile is not None
            and profile.last_attempt_at == NOW
            and profile.attempts_since_use == 1
        )


def test_retention_keeps_derived_rhythm_during_backoff_and_expires_it_without_fallback(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner, _, _, context = _seed(session)
    _learn(session, context)
    _endpoint(session, owner.id)
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(days=90))
    gentle.reserve(session, owner.id)
    profile = session.get(GentleProfile, owner.id)
    assert profile is not None and profile.observations == []
    assert profile.interval_days == 1 and profile.windows == [6]
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(days=102))
    assert gentle.reserve(session, owner.id) is None
    assert profile.last_use_at is None and profile.interval_days is None and profile.windows == []


def test_manual_historical_save_is_current_use_and_domain_import_does_not_train(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    from datetime import date

    from eimir.memories import service as memories

    owner, _, space, context = _seed(session)
    _learn(session, context)
    profile = session.get(GentleProfile, owner.id)
    assert profile is not None
    previous = profile.last_use_at
    memories.create_memory(
        session, context, title="Imported historic source", body="", happened_on=date(2000, 1, 1)
    )
    assert profile.last_use_at == previous
    token = auth(sign_in(session, owner))
    response = client.post(
        f"/api/v1/spaces/{space.id}/memories",
        headers={
            **token,
            "Idempotency-Key": str(uuid4()),
        },
        json={"title": "Deliberate historical save", "body": "", "happenedOn": "2000-01-01"},
    )
    assert response.status_code == 201
    assert profile.last_use_at == profile.last_save_at == NOW
    assert profile.observations[-1]["day"] == NOW.date().isoformat()


def test_source_deletion_removes_references_without_erasing_attempt_budget(
    session: Session,
) -> None:
    owner, _, _, context = _seed(session)
    _learn(session, context, reading=True)
    memory = _memory(session, context)
    provider, _ = _endpoint(session, owner.id)
    occasion, delivery = _queued(session, owner.id)
    assert occasion.memory_id == memory.id
    payload = gentle_delivery.prepare(session, {"deliveryId": str(delivery.id)})
    push.handle_delivery(session, payload)
    assert len(provider.calls) == 1
    session.delete(memory)
    session.flush()
    session.refresh(occasion)
    assert occasion.memory_id is None and occasion.attempted_at == NOW
    gentle.set_enabled(session, owner.id, False)
    gentle.set_enabled(session, owner.id, True)
    profile = session.get(GentleProfile, owner.id)
    assert profile is not None and profile.last_attempt_at == NOW


def test_offboarding_can_finish_while_a_delivery_waits_for_its_membership_barrier(
    production_client, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    from threading import Event

    from eimir.identity import effects

    _, maker = production_client
    with maker() as setup:
        owner, _, space, context = _seed(setup)
        _learn(setup, context)
        provider, _ = _endpoint(setup, owner.id)
        _, delivery = _queued(setup, owner.id)
        account_id, space_id, delivery_id = owner.id, space.id, delivery.id
        setup.commit()
    with maker() as preparation:
        payload = gentle_delivery.prepare(preparation, {"deliveryId": str(delivery_id)})
        assert payload.get("gentleSubmissionToken")
        preparation.commit()
    waiting = Event()
    original = effects.has_active_membership

    def membership_barrier(*args, **kwargs):  # type: ignore[no-untyped-def]
        waiting.set()
        return original(*args, **kwargs)

    monkeypatch.setattr(effects, "has_active_membership", membership_barrier)

    def deliver() -> None:
        with maker() as worker:
            push.handle_delivery(worker, payload)
            worker.commit()

    with maker() as leaver:
        membership = leaver.scalars(
            select(Membership)
            .where(
                Membership.account_id == account_id,
                Membership.space_id == space_id,
            )
            .with_for_update()
        ).one()
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(deliver)
            assert waiting.wait(timeout=10)
            relationships.end_membership(leaver, membership)
            leaver.commit()
            future.result(timeout=10)
    assert provider.calls == []
    with maker() as check:
        profile = check.get(GentleProfile, account_id)
        assert profile is not None and profile.last_use_at is None and profile.observations == []
