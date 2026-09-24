"""Content-minimized notification mail over the existing SMTP and Job Queue."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.config import MailTransport, get_settings
from eimir.core import clock
from eimir.db.session import unit_of_work
from eimir.engagement import notification_policy, notification_preferences
from eimir.engagement.models import EmailDelivery, EmailDeliveryStatus, Notification
from eimir.identity import effects as account_effects
from eimir.identity.models import AccountEmail
from eimir.jobs import queue
from eimir.jobs.worker import registry
from eimir.mail import MailMessage, MailSender, MailTransportError, MailUnavailableError
from eimir.mail import sender as configured_mail_sender
from eimir.relationship import configuration as space_configuration

JOB_KIND = "notification-email-delivery"
_SPACE_MODULES = {
    "THINKING_OF_YOU": space_configuration.SpaceModule.SUPPORT_GESTURES,
    "PARTNER_KISS": space_configuration.SpaceModule.SUPPORT_GESTURES,
    "PARTNER_CHECK_IN": space_configuration.SpaceModule.SUPPORT_GESTURES,
}


def verified_primary_email(session: Session, account_id: UUID) -> str | None:
    """Resolve the current verified destination, never a stored delivery copy."""
    return session.execute(
        select(AccountEmail.email).where(
            AccountEmail.account_id == account_id,
            AccountEmail.is_primary.is_(True),
            AccountEmail.verified_at.is_not(None),
        )
    ).scalar_one_or_none()


def transport_available() -> bool:
    """Development logging and an absent SMTP transport are not mail delivery."""
    return get_settings().mail_transport is MailTransport.SMTP


def register_handlers() -> None:
    if registry.get(JOB_KIND) is None:
        registry.register(JOB_KIND, handle_delivery)


def ensure_deliveries_for_source_event(session: Session, source_event_id: UUID) -> None:
    """Queue only explicitly opted-in immediate kinds, once per Notification."""
    if not transport_available():
        return
    notifications = session.execute(
        select(Notification).where(Notification.source_event_id == source_event_id)
    ).scalars()
    for notification in notifications:
        if notification_policy.presentation_for(notification.kind, notification.id) is None:
            continue
        if not notification_preferences.email_enabled(
            session, account_id=notification.recipient_account_id, kind=notification.kind
        ):
            continue
        if verified_primary_email(session, notification.recipient_account_id) is None:
            continue
        statement = (
            postgresql.insert(EmailDelivery)
            .values(notification_id=notification.id, status=EmailDeliveryStatus.PENDING.value)
            .on_conflict_do_nothing(index_elements=["notification_id"])
            .returning(EmailDelivery.id)
        )
        delivery_id = session.execute(statement).scalar_one_or_none()
        if delivery_id is not None:
            queue.enqueue(session, JOB_KIND, {"deliveryId": str(delivery_id)}, max_attempts=1)


def handle_delivery(session: Session, payload: dict[str, Any]) -> None:
    """Claim durably before SMTP so job retry cannot send a duplicate.

    SMTP lacks a provider idempotency key. Its connection may fail after the
    provider has accepted a message. A committed claim therefore permits one
    external attempt only; a crash before that attempt may lose this mail.
    The worker's session is intentionally separate from the claim transaction.
    """
    del session
    raw_id = payload.get("deliveryId")
    if not isinstance(raw_id, str):
        return
    try:
        delivery_id = UUID(raw_id)
    except ValueError:
        return

    with unit_of_work() as claim_session:
        row = claim_session.execute(
            select(EmailDelivery).where(EmailDelivery.id == delivery_id).with_for_update()
        ).scalar_one_or_none()
        if row is None or row.status != EmailDeliveryStatus.PENDING.value:
            return
        row.status = EmailDeliveryStatus.CLAIMED.value
        row.claimed_at = clock.now()

    with unit_of_work() as send_session:
        _send_claimed(send_session, delivery_id)


def _send_claimed(session: Session, delivery_id: UUID, mail: MailSender | None = None) -> None:
    """Revalidate every restriction immediately before the external effect."""
    snapshot = session.execute(
        select(Notification.recipient_account_id, Notification.actor_id)
        .select_from(EmailDelivery)
        .join(Notification, Notification.id == EmailDelivery.notification_id)
        .where(EmailDelivery.id == delivery_id)
    ).one_or_none()
    if snapshot is None:
        return
    recipient_id, actor_id = snapshot
    account_ids = {recipient_id}
    if actor_id is not None:
        account_ids.add(actor_id)
    accounts = account_effects.lock_enabled_accounts(session, account_ids)
    delivery = session.execute(
        select(EmailDelivery).where(EmailDelivery.id == delivery_id).with_for_update()
    ).scalar_one_or_none()
    if delivery is None or delivery.status != EmailDeliveryStatus.CLAIMED.value:
        return
    notification = session.get(Notification, delivery.notification_id)
    if notification is None or accounts is None:
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "ACCOUNT_UNAVAILABLE")
        return
    current_ids = {notification.recipient_account_id}
    if notification.actor_id is not None:
        current_ids.add(notification.actor_id)
    if current_ids != account_ids or any(
        not account_effects.has_active_membership(
            session, account_id=account_id, space_id=notification.space_id
        )
        for account_id in account_ids
    ):
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "ACCOUNT_UNAVAILABLE")
        return
    if notification_policy.presentation_for(notification.kind, notification.id) is None:
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "EMAIL_POLICY_BLOCKED")
        return
    if not notification_preferences.email_enabled(
        session, account_id=recipient_id, kind=notification.kind
    ):
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "EMAIL_PREFERENCE_DISABLED")
        return
    module = _SPACE_MODULES.get(notification.kind)
    if module is not None and not space_configuration.is_module_enabled(
        session, notification.space_id, module, lock_space=True
    ):
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "MODULE_DISABLED")
        return

    # A target can be deleted or made private after the Outbox projection.
    from eimir.engagement import service

    if not service.notification_target_available(
        session,
        notification,
        AuthorizationContext(account_id=recipient_id, space_id=notification.space_id),
    ):
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "TARGET_UNAVAILABLE")
        return
    address = verified_primary_email(session, recipient_id)
    if address is None or not transport_available():
        _finish(delivery, EmailDeliveryStatus.UNAVAILABLE, "EMAIL_CAPABILITY_UNAVAILABLE")
        return

    settings = get_settings()
    subject, body = _neutral_message(accounts[recipient_id].locale, settings.public_base_url)
    try:
        sender = mail if mail is not None else configured_mail_sender()
        sender.send(MailMessage(to=address, subject=subject, body=body))
    except (MailTransportError, MailUnavailableError):
        # SMTP acceptance is ambiguous on transport errors: never retry it.
        _finish(delivery, EmailDeliveryStatus.FAILED, "EMAIL_TRANSPORT_FAILED")
    except Exception:
        # Never persist/log transport exception text; it may contain the address.
        _finish(delivery, EmailDeliveryStatus.FAILED, "EMAIL_TRANSPORT_FAILED")
    else:
        _finish(delivery, EmailDeliveryStatus.SENT)


def _neutral_message(locale: str, base_url: str) -> tuple[str, str]:
    """The generic external presentation reveals no event kind or partner."""
    url = base_url.rstrip("/")
    if locale.lower().startswith("de"):
        return "Neues bei eimir.", f"Bei euch gibt es etwas Neues.\n\nIn eimir. öffnen: {url}"
    return "Something new in eimir.", f"There is something new for you.\n\nOpen eimir.: {url}"


def _finish(delivery: EmailDelivery, status: EmailDeliveryStatus, code: str | None = None) -> None:
    delivery.status = status.value
    delivery.last_error_code = code
    delivery.finished_at = clock.now()
