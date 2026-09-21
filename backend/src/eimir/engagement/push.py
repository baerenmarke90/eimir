"""Provider-neutral, content-minimized M4-B push delivery."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
)
from eimir.identity import effects as account_effects
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.worker import registry
from eimir.relationship import configuration as space_configuration

JOB_KIND = "push-delivery"
GENERIC_PRESENTATION_KEY = "notification.generic"
ACCOUNT_UNAVAILABLE_CODE = "ACCOUNT_UNAVAILABLE"
MAX_PUSH_ATTEMPTS = 5
_TECHNICAL_CODE = re.compile(r"[A-Z0-9_-]{1,64}\Z")
_TERMINAL_DELIVERY_STATUSES = {
    PushDeliveryStatus.SUCCEEDED.value,
    PushDeliveryStatus.FAILED.value,
    PushDeliveryStatus.UNAVAILABLE.value,
}
_NOTIFICATION_SPACE_MODULES = {
    NotificationKind.THINKING_OF_YOU.value: space_configuration.SpaceModule.SUPPORT_GESTURES,
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


def ensure_deliveries_for_source_event(session: Session, source_event_id: UUID) -> None:
    """Create one logical delivery per active endpoint for projected Notifications."""
    notifications = session.execute(
        select(Notification).where(Notification.source_event_id == source_event_id)
    ).scalars()
    for notification in notifications:
        endpoints = session.execute(
            select(PushEndpoint).where(
                PushEndpoint.account_id == notification.recipient_account_id,
                PushEndpoint.disabled_at.is_(None),
            )
        ).scalars()
        for endpoint in endpoints:
            statement = (
                postgresql.insert(PushDelivery)
                .values(
                    notification_id=notification.id,
                    push_endpoint_id=endpoint.id,
                    provider_key=endpoint.provider_key,
                    status=PushDeliveryStatus.PENDING.value,
                    attempts=0,
                )
                .on_conflict_do_nothing(index_elements=["notification_id", "push_endpoint_id"])
                .returning(PushDelivery.id)
            )
            delivery_id = session.execute(statement).scalar_one_or_none()
            if delivery_id is not None:
                queue.enqueue(
                    session,
                    JOB_KIND,
                    {"deliveryId": str(delivery_id)},
                    max_attempts=MAX_PUSH_ATTEMPTS,
                )


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

    accounts_available = account_effects.lock_enabled_accounts(session, account_ids) is not None

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

    current_account_ids = {notification.recipient_account_id}
    if notification.actor_id is not None:
        current_account_ids.add(notification.actor_id)
    if current_account_ids != account_ids or not accounts_available:
        _finish_unavailable(delivery, ACCOUNT_UNAVAILABLE_CODE)
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

    provider = providers.get(delivery.provider_key)
    if provider is None:
        _finish_unavailable(delivery)
        return

    delivery.attempts += 1
    try:
        result = provider.send(
            idempotency_key=f"{notification.id}:{endpoint.id}",
            endpoint=endpoint.endpoint_value,
            notification_reference={
                "id": str(notification.id),
                "kind": notification.kind,
            },
            generic_presentation_key=GENERIC_PRESENTATION_KEY,
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
