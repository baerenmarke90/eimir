"""Withdraw a read notice from the recipient's other devices (#2345).

When a notice becomes read (inbox, an opened push, a game page, "mark all"),
every Android device that received it is asked to remove it from its tray, so
reading on one device clears the others without opening the app there.

The message carries notice ids only, never content, and presents nothing:

- FCM: data type ``withdraw`` with the ids encrypted under the activation's
  preview key (the same key and JWE shape as previews, own ``typ``).
- UnifiedPush: an RFC 8291 encrypted ``{"type":"withdraw","notificationIds":…}``.

Older apps drop the unknown type silently. Browsers are left out: their push
subscriptions must show a notice for every push, so an open page withdraws its
own notices instead. APNs has no silent path in this app yet.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.engagement import push
from eimir.engagement.models import (
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
    PushEndpointSecret,
    PushPreviewSecret,
)
from eimir.identity.models import DeviceSession
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.worker import registry

JOB_KIND = "push-withdraw"
MAX_WITHDRAW_ATTEMPTS = 3
# A tray notice may wait for days; the removal stays meaningful as long.
WITHDRAW_TTL_SECONDS = 24 * 60 * 60
WITHDRAWING_PROVIDERS = ("fcm", "unifiedpush")
_LOOKUP_CHUNK = 500


def register_handler() -> None:
    if registry.get(JOB_KIND) is None:
        registry.register(JOB_KIND, handle_withdraw)


def enqueue_withdrawals(session: Session, notification_ids: Iterable[UUID]) -> int:
    """Queue one removal per device that received any of these notices.

    Joins the caller's transaction like every job, so nothing is sent when the
    read itself rolls back. Returns the number of queued jobs.
    """
    pending = list(dict.fromkeys(notification_ids))
    per_endpoint: dict[UUID, list[UUID]] = defaultdict(list)
    for start in range(0, len(pending), _LOOKUP_CHUNK):
        chunk = pending[start : start + _LOOKUP_CHUNK]
        rows = session.execute(
            select(PushDelivery.push_endpoint_id, PushDelivery.notification_id)
            .join(PushEndpoint, PushEndpoint.id == PushDelivery.push_endpoint_id)
            .where(
                PushDelivery.notification_id.in_(chunk),
                PushDelivery.status == PushDeliveryStatus.SUCCEEDED.value,
                PushEndpoint.provider_key.in_(WITHDRAWING_PROVIDERS),
                PushEndpoint.disabled_at.is_(None),
            )
            .order_by(PushDelivery.push_endpoint_id, PushDelivery.notification_id)
        ).all()
        for row in rows:
            per_endpoint[row.push_endpoint_id].append(row.notification_id)
    queued = 0
    for endpoint_id, ids in per_endpoint.items():
        for start in range(0, len(ids), push.WITHDRAW_BATCH):
            queue.enqueue(
                session,
                JOB_KIND,
                {
                    "endpointId": str(endpoint_id),
                    "notificationIds": [
                        str(item) for item in ids[start : start + push.WITHDRAW_BATCH]
                    ],
                },
                max_attempts=MAX_WITHDRAW_ATTEMPTS,
            )
            queued += 1
    return queued


def _live_family(session: Session, account_id: UUID, family_id: UUID | None) -> bool:
    if family_id is None:
        return False
    at = clock.now()
    return (
        session.scalar(
            select(DeviceSession.id).where(
                DeviceSession.id == family_id,
                DeviceSession.account_id == account_id,
                DeviceSession.revoked_at.is_(None),
                DeviceSession.expires_at > at,
                DeviceSession.absolute_expires_at > at,
            )
        )
        is not None
    )


def handle_withdraw(session: Session, payload: dict[str, Any]) -> None:
    try:
        endpoint_id = UUID(str(payload["endpointId"]))
        notification_ids = [UUID(str(item)) for item in payload["notificationIds"]]
    except (KeyError, TypeError, ValueError):
        return
    if not 0 < len(notification_ids) <= push.WITHDRAW_BATCH:
        return
    endpoint = session.get(PushEndpoint, endpoint_id)
    if (
        endpoint is None
        or endpoint.disabled_at is not None
        or endpoint.provider_key not in WITHDRAWING_PROVIDERS
    ):
        return
    provider = push.providers.get(endpoint.provider_key)
    if provider is None:
        return
    secret = session.scalar(
        select(PushEndpointSecret).where(PushEndpointSecret.push_endpoint_id == endpoint.id)
    )
    value = secret.payload.value if secret is not None else endpoint.endpoint_value
    idempotency_key = f"withdraw:{endpoint.id}:{','.join(str(item) for item in notification_ids)}"
    try:
        if endpoint.provider_key == "fcm":
            preview = session.scalar(
                select(PushPreviewSecret).where(PushPreviewSecret.push_endpoint_id == endpoint.id)
            )
            # The ids are encrypted for the activation; without its key or once
            # its device signed out there is nothing to address.
            if preview is None or not _live_family(
                session, endpoint.account_id, preview.device_session_id
            ):
                return
            provider.send_withdraw(  # type: ignore[attr-defined]
                endpoint=value,
                preview_key=preview.payload.key,
                notification_ids=notification_ids,
                ttl=WITHDRAW_TTL_SECONDS,
            )
        else:
            if not callable(getattr(provider, "send_withdraw", None)):
                return
            provider.send_withdraw(  # type: ignore[attr-defined]
                idempotency_key=idempotency_key,
                endpoint=value,
                notification_ids=notification_ids,
                ttl=WITHDRAW_TTL_SECONDS,
            )
    except push.PushProviderError as error:
        # A gone subscription is retired by the next regular delivery; a
        # removal is best effort and never retried beyond its few attempts.
        if error.retryable:
            raise RetryableJobError(
                error.code, retry_not_before=error.retry_not_before, retry_base=error.retry_base
            ) from error
