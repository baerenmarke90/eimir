"""Provider-neutral, content-minimized M4-B push delivery."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.engagement import notification_policy, notification_preferences, quiet_hours_preferences
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
)
from eimir.identity import effects as account_effects
from eimir.jobs import queue
from eimir.jobs.errors import DeferredJobError, RetryableJobError
from eimir.jobs.worker import registry
from eimir.relationship import configuration as space_configuration

JOB_KIND = "push-delivery"
GENERIC_PRESENTATION_KEY = notification_policy.GENERIC_PRESENTATION_KEY
ACCOUNT_UNAVAILABLE_CODE = "ACCOUNT_UNAVAILABLE"
POLICY_BLOCKED_CODE = "PUSH_POLICY_BLOCKED"
MAX_PUSH_ATTEMPTS = 5
QUIET_HOURS_RECHECK = timedelta(minutes=15)
_TECHNICAL_CODE = re.compile(r"[A-Z0-9_-]{1,64}\Z")
_TERMINAL_DELIVERY_STATUSES = {
    PushDeliveryStatus.SUCCEEDED.value,
    PushDeliveryStatus.FAILED.value,
    PushDeliveryStatus.UNAVAILABLE.value,
}
_NOTIFICATION_SPACE_MODULES = {
    NotificationKind.THINKING_OF_YOU.value: space_configuration.SpaceModule.SUPPORT_GESTURES,
    NotificationKind.PARTNER_KISS.value: space_configuration.SpaceModule.SUPPORT_GESTURES,
    NotificationKind.PARTNER_CHECK_IN.value: space_configuration.SpaceModule.SUPPORT_GESTURES,
}


@dataclass(frozen=True)
class PushSendResult:
    provider_message_id: str | None = None


class PushProvider(Protocol):
    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> PushSendResult: ...


class PushProviderError(Exception):
    """Provider failure represented only by a bounded technical code."""

    def __init__(self, code: str) -> None:
        self.code = sanitize_error_code(code)
        super().__init__(self.code)


class PushProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, PushProvider] = {}

    def register(self, provider_key: str, provider: PushProvider) -> None:
        key = provider_key.strip()
        if not key:
            raise ValueError("provider_key must not be blank")
        self._providers[key] = provider

    def get(self, provider_key: str) -> PushProvider | None:
        return self._providers.get(provider_key)

    def clear(self) -> None:
        self._providers.clear()


providers = PushProviderRegistry()


def register_handlers() -> None:
    """Register the existing Job Queue handler exactly once per worker process."""
    if registry.get(JOB_KIND) is None:
        registry.register(JOB_KIND, handle_delivery)


def register_endpoint(
    session: Session,
    *,
    account_id: UUID,
    provider_key: str,
    endpoint_value: str,
) -> PushEndpoint:
    """Create/reactivate one technical endpoint without exposing it publicly."""
    provider = provider_key.strip()
    endpoint = endpoint_value.strip()
    if not provider or not endpoint:
        raise ValueError("push endpoint and provider must not be blank")

    fingerprint = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()
    statement = (
        postgresql.insert(PushEndpoint)
        .values(
            account_id=account_id,
            provider_key=provider,
            endpoint_value=endpoint,
            fingerprint=fingerprint,
            disabled_at=None,
        )
        .on_conflict_do_update(
            index_elements=["account_id", "provider_key", "fingerprint"],
            set_={"endpoint_value": endpoint, "disabled_at": None},
        )
        .returning(PushEndpoint.id)
    )
    endpoint_id = session.execute(statement).scalar_one()
    endpoint_row = session.get(PushEndpoint, endpoint_id)
    if endpoint_row is None:
        raise RuntimeError("Push endpoint disappeared after upsert.")
    return endpoint_row


def _target_available(session: Session, notification: Notification) -> bool:
    if notification.target_type is None:
        return True
    from eimir.engagement import service

    return service.notification_target_available(
        session,
        notification,
        AuthorizationContext(
            account_id=notification.recipient_account_id,
            space_id=notification.space_id,
        ),
    )


def ensure_deliveries_for_source_event(session: Session, source_event_id: UUID) -> None:
    """Create one logical delivery per active endpoint for projected Notifications."""
    notifications = session.execute(
        select(Notification).where(Notification.source_event_id == source_event_id)
    ).scalars()
    for notification in notifications:
        digest = (
            notification_policy.digest_presentation_for(notification.kind, notification.id)
            is not None
        )
        if (
            not digest
            and notification_policy.presentation_for(notification.kind, notification.id) is None
        ):
            continue
        if not _target_available(session, notification):
            continue
        allowed = (
            notification_preferences.digest_push_enabled(
                session, account_id=notification.recipient_account_id, kind=notification.kind
            )
            if digest
            else notification_preferences.push_enabled(
                session, account_id=notification.recipient_account_id, kind=notification.kind
            )
        )
        if digest and not allowed:
            # A missing choice has never opted in. Do not create latent jobs
            # that could start sending when a future Settings control is used.
            continue
        endpoints = session.execute(
            select(PushEndpoint).where(
                PushEndpoint.account_id == notification.recipient_account_id,
                PushEndpoint.disabled_at.is_(None),
            )
        ).scalars()
        for endpoint in endpoints:
            created_at = clock.now() if digest else None
            statement = (
                postgresql.insert(PushDelivery)
                .values(
                    notification_id=notification.id,
                    push_endpoint_id=endpoint.id,
                    provider_key=endpoint.provider_key,
                    status=(
                        PushDeliveryStatus.PENDING.value
                        if allowed
                        else PushDeliveryStatus.UNAVAILABLE.value
                    ),
                    attempts=0,
                    last_error_code=None if allowed else "PUSH_PREFERENCE_DISABLED",
                    finished_at=None if allowed else clock.now(),
                    **({"created_at": created_at} if created_at is not None else {}),
                )
                .on_conflict_do_nothing(index_elements=["notification_id", "push_endpoint_id"])
                .returning(PushDelivery.id)
            )
            delivery_id = session.execute(statement).scalar_one_or_none()
            if delivery_id is not None and allowed:
                delay = None
                if created_at is not None:
                    _, end = notification_policy.digest_window(created_at)
                    delay = max(end - clock.now(), timedelta(seconds=1))
                queue.enqueue(
                    session,
                    JOB_KIND,
                    {"deliveryId": str(delivery_id)},
                    delay=delay,
                    max_attempts=MAX_PUSH_ATTEMPTS,
                )


def _digest_superseded(
    session: Session, delivery: PushDelivery, notification: Notification
) -> bool:
    """Choose one recipient/Space/endpoint receipt for an hourly batch.

    The recipient Account lock serializes this decision with other workers.
    Unavailable receipts are excluded so a later valid worker can be chosen.
    """
    start, end = notification_policy.digest_window(delivery.created_at)
    batch = (
        PushDelivery.push_endpoint_id == delivery.push_endpoint_id,
        PushDelivery.created_at >= start,
        PushDelivery.created_at < end,
        Notification.recipient_account_id == notification.recipient_account_id,
        Notification.space_id == notification.space_id,
        Notification.kind == notification.kind,
    )
    sent = session.execute(
        select(PushDelivery.id)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(*batch, PushDelivery.status == PushDeliveryStatus.SUCCEEDED.value)
        .limit(1)
    ).scalar_one_or_none()
    if sent is not None:
        return True
    latest = session.execute(
        select(PushDelivery.id)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(
            *batch,
            PushDelivery.status.in_(
                (PushDeliveryStatus.PENDING.value, PushDeliveryStatus.RETRYING.value)
            ),
        )
        .order_by(PushDelivery.created_at.desc(), PushDelivery.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    return latest != delivery.id


def _delivery_account_snapshot(
    session: Session,
    delivery_id: UUID,
) -> tuple[str, set[UUID]] | None:
    """Read the Account identities needed before taking lifecycle row locks.

    This first read deliberately does not lock PushDelivery. Account deletion
    cleanup owns the lock order ``Account -> PushDelivery``; the worker must use
    the same order or a cleanup failure/race can deadlock the two transactions.
    Every mutable delivery/notification invariant is rechecked after both lock
    classes have been acquired.
    """
    snapshot = session.execute(
        select(
            PushDelivery.status,
            Notification.recipient_account_id,
            Notification.actor_id,
        )
        .select_from(PushDelivery)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(PushDelivery.id == delivery_id)
    ).one_or_none()
    if snapshot is None:
        return None
    status, recipient_id, actor_id = snapshot
    account_ids = {recipient_id}
    if actor_id is not None:
        account_ids.add(actor_id)
    return status, account_ids


def handle_delivery(session: Session, payload: dict[str, Any]) -> None:
    """Deliver one Notification without carrying relationship plaintext."""
    raw_id = payload.get("deliveryId")
    if not isinstance(raw_id, str):
        return
    try:
        delivery_id = UUID(raw_id)
    except ValueError:
        return

    snapshot = _delivery_account_snapshot(session, delivery_id)
    if snapshot is None:
        return
    snapshot_status, account_ids = snapshot
    if snapshot_status in _TERMINAL_DELIVERY_STATUSES:
        return

    accounts = account_effects.lock_enabled_accounts(session, account_ids)

    # Lock only after Account rows. Account deletion async cleanup uses the same
    # order before suppressing stale deliveries, so the two paths can wait but
    # cannot form an Account <-> PushDelivery deadlock cycle.
    delivery = session.execute(
        select(PushDelivery).where(PushDelivery.id == delivery_id).with_for_update()
    ).scalar_one_or_none()
    if delivery is None or delivery.status in _TERMINAL_DELIVERY_STATUSES:
        return

    notification = session.get(Notification, delivery.notification_id)
    endpoint = session.get(PushEndpoint, delivery.push_endpoint_id)
    if (
        notification is None
        or endpoint is None
        or endpoint.disabled_at is not None
        or endpoint.account_id != notification.recipient_account_id
    ):
        _finish_unavailable(delivery)
        return

    # A queued delivery must still be allowed by the current policy when the
    # worker reaches the provider boundary. Historical records cannot bypass
    # a stricter catalog after an upgrade.
    digest = (
        notification_policy.digest_presentation_for(notification.kind, notification.id) is not None
    )
    presentation = (
        notification_policy.digest_presentation_for(notification.kind, notification.id)
        if digest
        else notification_policy.presentation_for(notification.kind, notification.id)
    )
    if presentation is None:
        _finish_unavailable(delivery, POLICY_BLOCKED_CODE)
        return

    current_account_ids = {notification.recipient_account_id}
    if notification.actor_id is not None:
        current_account_ids.add(notification.actor_id)
    if current_account_ids != account_ids or accounts is None:
        _finish_unavailable(delivery, ACCOUNT_UNAVAILABLE_CODE)
        return
    enabled = (
        notification_preferences.digest_push_enabled(
            session, account_id=notification.recipient_account_id, kind=notification.kind
        )
        if digest
        else notification_preferences.push_enabled(
            session, account_id=notification.recipient_account_id, kind=notification.kind
        )
    )
    if not enabled:
        _finish_unavailable(delivery, "PUSH_PREFERENCE_DISABLED")
        return
    if any(
        not account_effects.has_active_membership(
            session,
            account_id=account_id,
            space_id=notification.space_id,
        )
        for account_id in account_ids
    ):
        _finish_unavailable(delivery, ACCOUNT_UNAVAILABLE_CODE)
        return

    module = _NOTIFICATION_SPACE_MODULES.get(notification.kind)
    if module is not None and not space_configuration.is_module_enabled(
        session,
        notification.space_id,
        module,
        lock_space=True,
    ):
        # Projection and provider delivery are separate asynchronous boundaries.
        # Re-check the authoritative module immediately before the external side
        # effect. Marking the delivery terminal prevents a stale queued gesture
        # from resurfacing if the Space is enabled again later.
        _finish_unavailable(
            delivery,
            space_configuration.SpaceConfigurationErrorCode.MODULE_DISABLED,
        )
        return

    # A shared target can become private or disappear after projection. Match
    # the Notification Center and mail authorization at the provider boundary.
    if not _target_available(session, notification):
        _finish_unavailable(delivery, "PUSH_TARGET_UNAVAILABLE")
        return

    checked_at = clock.now()
    digest_start: datetime | None = None
    if digest:
        digest_start, end = notification_policy.digest_window(delivery.created_at)
        if checked_at < end:
            raise DeferredJobError(end)
    release_at = quiet_hours_preferences.release_at(
        accounts[notification.recipient_account_id], kind=notification.kind, at=checked_at
    )
    if release_at is not None:
        delivery.deferred_until = release_at
        raise DeferredJobError(min(release_at, checked_at + QUIET_HOURS_RECHECK))

    # Only one generic wake per Space and endpoint after an accumulated quiet
    # interval. Keep every underlying Center entry and suppress older external
    # handoffs. The Account lock serializes concurrent worker decisions.
    if delivery.deferred_until is not None:
        if delivery.deferred_until > checked_at:
            # A timezone or window change can end the hold before its old UTC
            # release instant. The current Account choice is authoritative.
            delivery.deferred_until = checked_at
        latest = session.execute(
            select(PushDelivery.id)
            .join(Notification, Notification.id == PushDelivery.notification_id)
            .where(
                PushDelivery.push_endpoint_id == endpoint.id,
                PushDelivery.deferred_until.is_not(None),
                Notification.recipient_account_id == notification.recipient_account_id,
                Notification.space_id == notification.space_id,
            )
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        if latest != delivery.id:
            _finish_unavailable(delivery, "QUIET_HOURS_COALESCED")
            return

    if digest and _digest_superseded(session, delivery, notification):
        _finish_unavailable(delivery, "DIGEST_COALESCED")
        return

    provider = providers.get(delivery.provider_key)
    if provider is None:
        _finish_unavailable(delivery)
        return

    delivery.attempts += 1
    try:
        result = provider.send(
            idempotency_key=(
                f"digest:{notification.recipient_account_id}:{notification.space_id}:"
                f"{endpoint.id}:{digest_start.isoformat()}"
                if digest_start is not None
                else f"{notification.id}:{endpoint.id}"
            ),
            endpoint=endpoint.endpoint_value,
            notification_reference=presentation.reference,
            generic_presentation_key=presentation.key,
        )
    except PushProviderError as exc:
        _record_failure(delivery, exc.code)
        if delivery.attempts < MAX_PUSH_ATTEMPTS:
            raise RetryableJobError(exc.code) from exc
        return
    except Exception as exc:
        code = "PROVIDER_ERROR"
        _record_failure(delivery, code)
        if delivery.attempts < MAX_PUSH_ATTEMPTS:
            raise RetryableJobError(code) from exc
        return

    delivery.status = PushDeliveryStatus.SUCCEEDED.value
    delivery.last_error_code = None
    delivery.provider_message_id = bounded_identifier(result.provider_message_id)
    delivery.finished_at = clock.now()


def sanitize_error_code(value: str) -> str:
    """Persist only explicit machine codes, never transformed provider prose."""
    candidate = value.strip().upper()
    if _TECHNICAL_CODE.fullmatch(candidate) is None:
        return "PROVIDER_ERROR"
    return candidate


def bounded_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = "".join(character for character in value if character.isprintable()).strip()
    return cleaned[:256] or None


def _record_failure(delivery: PushDelivery, code: str) -> None:
    delivery.last_error_code = sanitize_error_code(code)
    if delivery.attempts >= MAX_PUSH_ATTEMPTS:
        delivery.status = PushDeliveryStatus.FAILED.value
        delivery.finished_at = clock.now()
    else:
        delivery.status = PushDeliveryStatus.RETRYING.value


def _finish_unavailable(
    delivery: PushDelivery,
    code: str = "PUSH_NOT_CONFIGURED",
) -> None:
    delivery.status = PushDeliveryStatus.UNAVAILABLE.value
    delivery.last_error_code = sanitize_error_code(code)
    delivery.finished_at = clock.now()
