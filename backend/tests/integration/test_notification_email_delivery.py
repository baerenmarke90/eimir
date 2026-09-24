"""PostgreSQL evidence for independent, at-most-once notification mail."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, time, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.engagement import email_delivery, notification_preferences
from eimir.engagement.models import (
    EmailDelivery,
    EmailDeliveryStatus,
    Notification,
    NotificationChannel,
    NotificationKind,
    NotificationPreference,
)
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.identity.models import Account, AccountEmail
from eimir.jobs.errors import DeferredJobError
from eimir.jobs.models import Job
from eimir.mail import MailMessage, MailSender, MailTransportError
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import _clear_database, make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class CapturingMail(MailSender):
    def __init__(self, fail: bool = False) -> None:
        self.messages: list[MailMessage] = []
        self.fail = fail

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)
        if self.fail:
            raise MailTransportError("The provider may already have accepted the mail.")


@pytest.fixture
def mail_setup(engine: Engine, monkeypatch):  # type: ignore[no-untyped-def]
    _clear_database(engine)

    @contextmanager
    def work() -> Iterator[Session]:
        with Session(engine, expire_on_commit=False) as session:
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise

    provider = CapturingMail()
    monkeypatch.setattr(email_delivery, "unit_of_work", work)
    monkeypatch.setattr(email_delivery, "transport_available", lambda: True)
    monkeypatch.setattr(email_delivery, "configured_mail_sender", lambda: provider)

    with work() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        session.add(
            AccountEmail(
                account_id=ben.id,
                email="first@example.org",
                is_primary=True,
                verified_at=now(),
            )
        )
        notification_preferences.set_email_enabled(
            session, account_id=ben.id, kind=NotificationKind.REMINDER_DUE, enabled=True
        )
        notification = Notification(
            space_id=space.id,
            recipient_account_id=ben.id,
            source_event_id=uuid4(),
            kind=NotificationKind.REMINDER_DUE.value,
            actor_id=None,
            target_type=None,
            target_id=None,
            in_app_visible=False,
        )
        session.add(notification)
        session.flush()
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        delivery_id = session.execute(select(EmailDelivery.id)).scalar_one()
        assert session.execute(select(func.count(Job.id))).scalar_one() == 1
        ids = (anna.id, ben.id, space.id, notification.id, delivery_id)
    try:
        yield engine, provider, ids
    finally:
        _clear_database(engine)


def _handle(engine: Engine, delivery_id) -> None:  # type: ignore[no-untyped-def]
    with Session(engine) as outer:
        email_delivery.handle_delivery(outer, {"deliveryId": str(delivery_id)})


def _queue_partner_mail(engine: Engine, *, ben_id, space_id, anna_id, created_at: datetime):  # type: ignore[no-untyped-def]
    with Session(engine) as session:
        notification_preferences.set_email_enabled(
            session, account_id=ben_id, kind=NotificationKind.PARTNER_KISS, enabled=True
        )
        notification = Notification(
            space_id=space_id,
            recipient_account_id=ben_id,
            actor_id=anna_id,
            source_event_id=uuid4(),
            kind=NotificationKind.PARTNER_KISS.value,
            created_at=created_at,
        )
        session.add(notification)
        session.flush()
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        delivery_id = session.execute(
            select(EmailDelivery.id).where(EmailDelivery.notification_id == notification.id)
        ).scalar_one()
        session.commit()
        return delivery_id, notification.id


def _opt_in_comment_digest(engine: Engine, account_id) -> None:  # type: ignore[no-untyped-def]
    # The public API intentionally keeps this future choice unavailable.
    with Session(engine) as session:
        session.add(
            NotificationPreference(
                account_id=account_id,
                kind=NotificationKind.COMMENT_CREATED.value,
                channel=NotificationChannel.EMAIL.value,
                enabled=True,
            )
        )
        session.commit()


def _queue_comment_mail(engine: Engine, *, ben_id, space_id, anna_id):  # type: ignore[no-untyped-def]
    with Session(engine) as session:
        notification = Notification(
            space_id=space_id,
            recipient_account_id=ben_id,
            actor_id=anna_id,
            source_event_id=uuid4(),
            kind=NotificationKind.COMMENT_CREATED.value,
            target_type=None,
            target_id=None,
        )
        session.add(notification)
        session.flush()
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        delivery_id = session.execute(
            select(EmailDelivery.id).where(EmailDelivery.notification_id == notification.id)
        ).scalar_one_or_none()
        session.commit()
        return delivery_id, notification.id


def test_comment_digest_requires_opt_in_and_sends_one_mail_per_hour(
    mail_setup, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    current = {"at": datetime(2026, 9, 24, 18, 10, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])

    absent, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    assert absent is None
    _opt_in_comment_digest(engine, ben_id)
    with Session(engine) as session:
        assert notification_preferences.digest_email_enabled(
            session, account_id=ben_id, kind=NotificationKind.COMMENT_CREATED.value
        )

    first_id, first_notification = _queue_comment_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id
    )
    assert first_id is not None
    current["at"] += timedelta(minutes=20)
    second_id, second_notification = _queue_comment_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id
    )
    assert second_id is not None
    with pytest.raises(DeferredJobError) as deferred:
        _handle(engine, first_id)
    assert deferred.value.until == datetime(2026, 9, 24, 19, tzinfo=UTC)
    assert provider.messages == []

    current["at"] = deferred.value.until
    _handle(engine, first_id)
    _handle(engine, second_id)
    _handle(engine, second_id)
    assert len(provider.messages) == 1
    assert provider.messages[0].to == "first@example.org"
    assert "COMMENT_CREATED" not in provider.messages[0].body
    with Session(engine) as session:
        deliveries = [
            session.get(EmailDelivery, delivery_id) for delivery_id in (first_id, second_id)
        ]
        assert {delivery.status for delivery in deliveries if delivery is not None} == {
            EmailDeliveryStatus.SENT.value,
            EmailDeliveryStatus.UNAVAILABLE.value,
        }
        assert session.get(Notification, first_notification) is not None
        assert session.get(Notification, second_notification) is not None

    current["at"] += timedelta(minutes=5)
    next_id, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    assert next_id is not None
    current["at"] = datetime(2026, 9, 24, 20, tzinfo=UTC)
    _handle(engine, next_id)
    assert len(provider.messages) == 2


def test_comment_digest_opt_out_while_waiting_blocks_mail(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    current = {"at": datetime(2026, 9, 24, 18, 10, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    _opt_in_comment_digest(engine, ben_id)
    delivery_id, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    assert delivery_id is not None
    with Session(engine) as session:
        preference = session.execute(
            select(NotificationPreference).where(
                NotificationPreference.account_id == ben_id,
                NotificationPreference.kind == NotificationKind.COMMENT_CREATED.value,
                NotificationPreference.channel == NotificationChannel.EMAIL.value,
            )
        ).scalar_one()
        preference.enabled = False
        session.commit()
    current["at"] = datetime(2026, 9, 24, 19, tzinfo=UTC)
    _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.last_error_code == "EMAIL_PREFERENCE_DISABLED"


def test_ambiguous_comment_digest_mail_failure_closes_bucket(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, _, (anna_id, ben_id, space_id, _, _) = mail_setup
    current = {"at": datetime(2026, 9, 24, 18, 10, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    _opt_in_comment_digest(engine, ben_id)
    first_id, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    current["at"] += timedelta(minutes=5)
    second_id, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    assert first_id is not None and second_id is not None
    provider = CapturingMail(fail=True)
    monkeypatch.setattr(email_delivery, "configured_mail_sender", lambda: provider)
    current["at"] = datetime(2026, 9, 24, 19, tzinfo=UTC)
    _handle(engine, second_id)
    _handle(engine, first_id)
    _handle(engine, second_id)
    assert len(provider.messages) == 1
    with Session(engine) as session:
        assert session.get(EmailDelivery, second_id).status == EmailDeliveryStatus.FAILED.value
        assert session.get(EmailDelivery, first_id).last_error_code == "DIGEST_COALESCED"


def test_comment_digest_isolated_by_recipient_and_space(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    current = {"at": datetime(2026, 9, 24, 18, 10, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    _opt_in_comment_digest(engine, ben_id)
    _opt_in_comment_digest(engine, anna_id)
    with Session(engine) as session:
        anna = session.get(Account, anna_id)
        ben = session.get(Account, ben_id)
        assert anna is not None and ben is not None
        second_space = make_space(session, anna)
        relationship_service.add_member(session, second_space.id, ben)
        session.add(
            AccountEmail(
                account_id=anna_id,
                email="anna@example.org",
                is_primary=True,
                verified_at=now(),
            )
        )
        second_space_id = second_space.id
        session.commit()

    ids = [
        _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)[0],
        _queue_comment_mail(engine, ben_id=ben_id, space_id=second_space_id, anna_id=anna_id)[0],
        _queue_comment_mail(engine, ben_id=anna_id, space_id=space_id, anna_id=ben_id)[0],
    ]
    assert all(delivery_id is not None for delivery_id in ids)
    current["at"] = datetime(2026, 9, 24, 19, tzinfo=UTC)
    for delivery_id in ids:
        assert delivery_id is not None
        _handle(engine, delivery_id)
    assert len(provider.messages) == 3
    assert {message.to for message in provider.messages} == {
        "first@example.org",
        "anna@example.org",
    }


def test_comment_digest_waits_through_quiet_hours(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    _opt_in_comment_digest(engine, ben_id)
    _set_window(engine, ben_id)
    current = {"at": datetime(2026, 8, 30, 20, 15, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    delivery_id, _ = _queue_comment_mail(engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id)
    assert delivery_id is not None
    current["at"] = datetime(2026, 8, 30, 21, tzinfo=UTC)
    with pytest.raises(DeferredJobError) as deferred:
        _handle(engine, delivery_id)
    assert deferred.value.until == current["at"] + email_delivery.QUIET_HOURS_RECHECK
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.PENDING.value
        assert delivery.deferred_until == datetime(2026, 8, 31, 5, tzinfo=UTC)
    current["at"] = datetime(2026, 8, 31, 5, tzinfo=UTC)
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1


def test_comment_digest_rechecks_target_privacy_before_smtp(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    _opt_in_comment_digest(engine, ben_id)
    current = {"at": datetime(2026, 9, 24, 18, 10, tzinfo=UTC)}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    with Session(engine) as session:
        moment = HeartMoment(
            space_id=space_id,
            owner_id=anna_id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=current["at"].date(),
            payload=HeartMomentPayload(text="Shared first", emotion=HeartEmotion.SEEN),
        )
        session.add(moment)
        session.flush()
        notification = Notification(
            space_id=space_id,
            recipient_account_id=ben_id,
            actor_id=anna_id,
            source_event_id=uuid4(),
            kind=NotificationKind.COMMENT_CREATED.value,
            target_type="HEART_MOMENT",
            target_id=moment.id,
        )
        session.add(notification)
        session.flush()
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        delivery_id = session.execute(
            select(EmailDelivery.id).where(EmailDelivery.notification_id == notification.id)
        ).scalar_one()
        moment_id = moment.id
        session.commit()

    with Session(engine) as session:
        moment = session.get(HeartMoment, moment_id)
        assert moment is not None
        moment.privacy_class = PrivacyClass.OWNER_ONLY.value
        session.commit()

    current["at"] = datetime(2026, 9, 24, 19, tzinfo=UTC)
    _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.last_error_code == "TARGET_UNAVAILABLE"


def _set_window(engine: Engine, ben_id, *, timezone: str = "Europe/Berlin") -> None:  # type: ignore[no-untyped-def]
    with Session(engine) as session:
        account = session.get(Account, ben_id)
        assert account is not None
        account.timezone = timezone
        account.quiet_hours_start = time(22)
        account.quiet_hours_end = time(7)
        session.commit()


def test_quiet_hours_defers_and_coalesces_partner_mail(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    _set_window(engine, ben_id)
    quiet_at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    release = datetime(2026, 8, 31, 5, tzinfo=UTC)
    current = {"at": quiet_at}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    first_id, first_notification_id = _queue_partner_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id, created_at=quiet_at
    )
    second_id, second_notification_id = _queue_partner_mail(
        engine,
        ben_id=ben_id,
        space_id=space_id,
        anna_id=anna_id,
        created_at=quiet_at + timedelta(minutes=1),
    )
    for delivery_id in (first_id, second_id):
        with pytest.raises(DeferredJobError) as deferred:
            _handle(engine, delivery_id)
        assert deferred.value.until == quiet_at + email_delivery.QUIET_HOURS_RECHECK
        with Session(engine) as session:
            delivery = session.get(EmailDelivery, delivery_id)
            assert delivery is not None
            assert delivery.status == EmailDeliveryStatus.PENDING.value
            assert delivery.claimed_at is None
            assert delivery.deferred_until == release
    assert provider.messages == []

    current["at"] = release
    _handle(engine, first_id)
    _handle(engine, second_id)
    _handle(engine, second_id)
    assert len(provider.messages) == 1
    assert provider.messages[0].to == "first@example.org"
    assert "PARTNER_KISS" not in provider.messages[0].body
    with Session(engine) as session:
        first = session.get(EmailDelivery, first_id)
        second = session.get(EmailDelivery, second_id)
        assert first is not None and second is not None
        assert first.status == EmailDeliveryStatus.UNAVAILABLE.value
        assert first.last_error_code == "QUIET_HOURS_COALESCED"
        assert second.status == EmailDeliveryStatus.SENT.value
        assert session.get(Notification, first_notification_id) is not None
        assert session.get(Notification, second_notification_id) is not None


def test_quiet_hours_timezone_change_releases_pending_mail(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    _set_window(engine, ben_id)
    at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    current = {"at": at}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    delivery_id, _ = _queue_partner_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id, created_at=at
    )
    with pytest.raises(DeferredJobError):
        _handle(engine, delivery_id)
    _set_window(engine, ben_id, timezone="America/New_York")

    current["at"] = at + email_delivery.QUIET_HOURS_RECHECK
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.SENT.value
        assert delivery.deferred_until == current["at"]


def test_quiet_hours_respects_mail_opt_out_while_waiting(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    _set_window(engine, ben_id)
    at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    current = {"at": at}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    delivery_id, notification_id = _queue_partner_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id, created_at=at
    )
    with pytest.raises(DeferredJobError):
        _handle(engine, delivery_id)
    with Session(engine) as session:
        notification_preferences.set_email_enabled(
            session, account_id=ben_id, kind=NotificationKind.PARTNER_KISS, enabled=False
        )
        session.commit()

    current["at"] = datetime(2026, 8, 31, 5, tzinfo=UTC)
    _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.UNAVAILABLE.value
        assert delivery.last_error_code == "EMAIL_PREFERENCE_DISABLED"
        assert session.get(Notification, notification_id) is not None


def test_quiet_hours_does_not_delay_due_reminder_mail(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (_, ben_id, _, _, delivery_id) = mail_setup
    _set_window(engine, ben_id)
    monkeypatch.setattr(
        email_delivery.clock, "now", lambda: datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    )
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.SENT.value
        assert delivery.deferred_until is None


def test_window_enabled_after_smtp_claim_returns_only_unsent_mail_to_queue(
    mail_setup, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (anna_id, ben_id, space_id, _, _) = mail_setup
    at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    current = {"at": at}
    monkeypatch.setattr(email_delivery.clock, "now", lambda: current["at"])
    delivery_id, _ = _queue_partner_mail(
        engine, ben_id=ben_id, space_id=space_id, anna_id=anna_id, created_at=at
    )
    original_work = email_delivery.unit_of_work
    calls = 0

    @contextmanager
    def change_after_claim() -> Iterator[Session]:
        nonlocal calls
        with original_work() as session:
            yield session
        calls += 1
        if calls == 1:
            _set_window(engine, ben_id)

    monkeypatch.setattr(email_delivery, "unit_of_work", change_after_claim)
    with pytest.raises(DeferredJobError):
        _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.PENDING.value
        assert delivery.claimed_at is None

    current["at"] = datetime(2026, 8, 31, 5, tzinfo=UTC)
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1


def test_mail_uses_current_verified_address_and_does_not_repeat_after_job_retry(mail_setup) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (_, ben_id, _, notification_id, delivery_id) = mail_setup
    with Session(engine) as session:
        address = session.execute(
            select(AccountEmail).where(AccountEmail.account_id == ben_id)
        ).scalar_one()
        address.email = "new@example.org"
        session.commit()

    _handle(engine, delivery_id)
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1
    message = provider.messages[0]
    assert message.to == "new@example.org"
    assert "eimir" in message.subject.lower()
    assert str(notification_id) not in message.body
    assert "REMINDER_DUE" not in message.body
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.SENT.value


def test_disabling_email_after_queueing_suppresses_it_permanently(mail_setup) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (_, ben_id, _, _, delivery_id) = mail_setup
    with Session(engine) as session:
        notification_preferences.set_email_enabled(
            session, account_id=ben_id, kind=NotificationKind.REMINDER_DUE, enabled=False
        )
        session.commit()
    _handle(engine, delivery_id)
    with Session(engine) as session:
        notification_preferences.set_email_enabled(
            session, account_id=ben_id, kind=NotificationKind.REMINDER_DUE, enabled=True
        )
        session.commit()
    _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.UNAVAILABLE.value
        assert delivery.last_error_code == "EMAIL_PREFERENCE_DISABLED"


def test_unverified_address_and_left_membership_block_mail(mail_setup) -> None:  # type: ignore[no-untyped-def]
    engine, provider, (_, ben_id, space_id, _, delivery_id) = mail_setup
    with Session(engine) as session:
        address = session.execute(
            select(AccountEmail).where(AccountEmail.account_id == ben_id)
        ).scalar_one()
        address.verified_at = None
        session.commit()
    _handle(engine, delivery_id)
    assert provider.messages == []
    with Session(engine) as session:
        assert (
            session.get(EmailDelivery, delivery_id).last_error_code
            == "EMAIL_CAPABILITY_UNAVAILABLE"
        )

    # A separate queued notification must still recheck Space membership.
    with Session(engine) as session:
        address = session.execute(
            select(AccountEmail).where(AccountEmail.account_id == ben_id)
        ).scalar_one()
        address.verified_at = now()
        notification = Notification(
            space_id=space_id,
            recipient_account_id=ben_id,
            source_event_id=uuid4(),
            kind=NotificationKind.REMINDER_DUE.value,
            in_app_visible=True,
        )
        session.add(notification)
        session.flush()
        email_delivery.ensure_deliveries_for_source_event(session, notification.source_event_id)
        next_id = session.execute(
            select(EmailDelivery.id).where(EmailDelivery.notification_id == notification.id)
        ).scalar_one()
        membership = session.execute(
            select(Membership).where(
                Membership.account_id == ben_id, Membership.space_id == space_id
            )
        ).scalar_one()
        membership.status = MembershipStatus.LEFT.value
        session.commit()
    _handle(engine, next_id)
    assert provider.messages == []


def test_ambiguous_transport_error_is_never_retried(mail_setup, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    engine, _, (_, _, _, _, delivery_id) = mail_setup
    provider = CapturingMail(fail=True)
    monkeypatch.setattr(email_delivery, "configured_mail_sender", lambda: provider)
    _handle(engine, delivery_id)
    _handle(engine, delivery_id)
    assert len(provider.messages) == 1
    with Session(engine) as session:
        delivery = session.get(EmailDelivery, delivery_id)
        assert delivery is not None
        assert delivery.status == EmailDeliveryStatus.FAILED.value
        assert delivery.last_error_code == "EMAIL_TRANSPORT_FAILED"
