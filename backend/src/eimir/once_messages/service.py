"""Bilateral consent and a single atomic claim; no durable relationship projection."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import timedelta
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session, defer

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import (
    ConflictError,
    NotFoundError,
    PremiumEntitlementRequiredError,
    RateLimitedError,
    ValidationError,
)
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.entitlements.models import Capability
from eimir.entitlements.service import get_effective_space_entitlement
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.once_messages.models import OnceDevice, OnceEnvelope, OnceMessage, OnceReception
from eimir.outbox import service as outbox
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus

LIFETIME = timedelta(hours=24)
CLAIM_LIFETIME = timedelta(minutes=5)
MAX_ENVELOPE_BYTES = 8 * 1024 * 1024 - 4096
MAX_SPACE_BYTES = 64 * 1024 * 1024
MAX_DEVICES = 8
CLEANUP_JOB = "once_message_expiry"


def absent() -> NotFoundError:
    return NotFoundError("Message unavailable.", "ONCE_MESSAGE_UNAVAILABLE")


def members(
    session: Session, context: AuthorizationContext, *, lock: bool = False
) -> list[Membership]:
    if lock:
        # Accounts precede the Space/domain locks, matching account retirement.
        ids = select(Membership.account_id).where(Membership.space_id == context.space_id)
        list(
            session.scalars(
                select(Account.id)
                .where(Account.id.in_(ids))
                .order_by(Account.id)
                .with_for_update(read=True, key_share=True)
            )
        )
        relationship.lock_space(session, context.space_id)
    rows = list(
        session.scalars(
            select(Membership)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
            .order_by(Membership.id)
            .execution_options(populate_existing=True)
        )
    )
    if not any(row.account_id == context.account_id for row in rows):
        raise absent()
    return rows


def enabled(session: Session, member: Membership) -> bool:
    return (
        session.scalar(
            select(OnceReception.enabled).where(
                OnceReception.space_id == member.space_id,
                OnceReception.account_id == member.account_id,
                OnceReception.membership_id == member.id,
            )
        )
        is True
    )


def current_keys(session: Session, member: Membership) -> list[OnceDevice]:
    return list(
        session.scalars(
            select(OnceDevice)
            .where(
                OnceDevice.space_id == member.space_id,
                OnceDevice.account_id == member.account_id,
                OnceDevice.membership_id == member.id,
            )
            .order_by(OnceDevice.id)
        )
    )


def can_send(session: Session, space_id: UUID, *, lock: bool = False) -> bool:
    return (
        Capability.PARTNER_ONCE_MESSAGES.value
        in get_effective_space_entitlement(session, space_id, lock_grants=lock).capabilities
    )


def validate_public_key(jwk: dict[str, Any]) -> None:
    if (
        set(jwk) - {"kty", "n", "e", "alg", "ext", "key_ops", "use"}
        or jwk.get("kty") != "RSA"
        or jwk.get("alg", "RSA-OAEP-256") != "RSA-OAEP-256"
    ):
        raise ValidationError("A public RSA-OAEP-256 key is required.", "ONCE_KEY_INVALID")
    try:

        def number(name: str) -> int:
            value = jwk[name]
            if not isinstance(value, str) or len(value) > 1024:
                raise ValueError
            return int.from_bytes(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)), "big")

        public = RSAPublicNumbers(number("e"), number("n")).public_key()
        if public.key_size not in {2048, 3072, 4096} or public.public_numbers().e != 65537:
            raise ValueError
    except (ValueError, TypeError, KeyError) as error:
        raise ValidationError("Invalid public key.", "ONCE_KEY_INVALID") from error


def set_reception(
    session: Session,
    context: AuthorizationContext,
    *,
    enable: bool,
    device_id: UUID | None,
    public_jwk: dict[str, Any] | None,
    expected_version: int | None = None,
) -> None:
    current = members(session, context, lock=True)
    own = next(member for member in current if member.account_id == context.account_id)
    consent = session.get(OnceReception, (context.space_id, context.account_id))
    actual_version = consent.version if consent else 0
    if expected_version is not None and actual_version != expected_version:
        raise ConflictError(
            "Reception changed. Reload before changing consent.", "ONCE_RECEPTION_CHANGED"
        )

    if enable:
        if device_id is None or public_jwk is None:
            raise ValidationError("A device public key is required.", "ONCE_KEY_INVALID")
        validate_public_key(public_jwk)
        device = session.get(OnceDevice, device_id)
        keys = current_keys(session, own)
        if device is not None and (
            device.space_id != context.space_id
            or device.account_id != context.account_id
            or device.public_jwk != public_jwk
        ):
            raise ConflictError("Device identity changed.", "ONCE_KEY_CHANGED")
        if device is None:
            if len(keys) >= MAX_DEVICES:
                raise ConflictError("Remove reception on old devices first.", "ONCE_DEVICE_LIMIT")
            session.add(
                OnceDevice(
                    id=device_id,
                    space_id=context.space_id,
                    account_id=context.account_id,
                    membership_id=own.id,
                    public_jwk=public_jwk,
                    created_at=clock.now(),
                )
            )
    else:
        purge_messages(session, context.space_id, keep_receipts=True)
        session.execute(
            delete(OnceDevice).where(
                OnceDevice.space_id == context.space_id, OnceDevice.account_id == context.account_id
            )
        )
    if consent is None:
        session.add(
            OnceReception(
                space_id=context.space_id,
                account_id=context.account_id,
                membership_id=own.id,
                enabled=enable,
            )
        )
    else:
        consent.membership_id = own.id
        consent.enabled = enable
        consent.version += 1
    session.flush()


def validate_envelope(jwe: dict[str, Any], key_ids: set[str]) -> int:
    """Validate framing without ever decrypting or interpreting message content."""
    try:
        if set(jwe) != {"protected", "recipients", "iv", "ciphertext", "tag"}:
            raise ValueError
        header = jwe["protected"]
        if not isinstance(header, str) or len(header) > 256:
            raise ValueError
        decoded = json.loads(base64.urlsafe_b64decode(header + "=" * (-len(header) % 4)))
        if decoded != {"alg": "RSA-OAEP-256", "enc": "A256GCM"}:
            raise ValueError
        recipients = jwe["recipients"]
        if not isinstance(recipients, list) or not 1 <= len(recipients) <= MAX_DEVICES:
            raise ValueError
        found = []
        for recipient in recipients:
            if set(recipient) != {"header", "encrypted_key"} or set(recipient["header"]) != {"kid"}:
                raise ValueError
            found.append(recipient["header"]["kid"])
            value = recipient["encrypted_key"]
            if not isinstance(value, str) or not 300 <= len(value) <= 700:
                raise ValueError
        if len(set(found)) != len(found) or set(found) != key_ids:
            raise ConflictError(
                "Recipient devices changed. Reload before sending.", "ONCE_KEY_CHANGED"
            )
        for name, minimum, maximum in (
            ("iv", 16, 16),
            ("tag", 22, 22),
            ("ciphertext", 1, MAX_ENVELOPE_BYTES),
        ):
            value = jwe[name]
            if (
                not isinstance(value, str)
                or not minimum <= len(value) <= maximum
                or any(
                    c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
                    for c in value
                )
            ):
                raise ValueError
        size = len(json.dumps(jwe, separators=(",", ":")).encode())
        if size > MAX_ENVELOPE_BYTES:
            raise ValueError
        return size
    except (ValueError, TypeError, KeyError) as error:
        raise ValidationError("Invalid encrypted message.", "ONCE_ENVELOPE_INVALID") from error


def create(
    session: Session,
    context: AuthorizationContext,
    *,
    request_id: UUID,
    recipient_id: UUID,
    jwe: dict[str, Any],
) -> OnceMessage:
    current = members(session, context, lock=True)
    fingerprint = hashlib.sha256(
        json.dumps(jwe, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    old = session.scalar(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(
            OnceMessage.space_id == context.space_id,
            OnceMessage.sender_id == context.account_id,
            OnceMessage.request_id == request_id,
        )
    )
    if old is not None:
        if old.recipient_id != recipient_id or old.fingerprint != fingerprint:
            raise ConflictError("Request identity was already used.", "ONCE_REQUEST_CONFLICT")
        return old
    if not can_send(session, context.space_id, lock=True):
        raise PremiumEntitlementRequiredError(Capability.PARTNER_ONCE_MESSAGES.value)
    partner = next(
        (
            member
            for member in current
            if member.account_id == recipient_id and member.account_id != context.account_id
        ),
        None,
    )
    if (
        len(current) != 2
        or partner is None
        or not all(enabled(session, member) for member in current)
    ):
        raise ConflictError("Both partners must enable reception.", "ONCE_RECEPTION_REQUIRED")
    keys = current_keys(session, partner)
    size = validate_envelope(jwe, {str(key.id) for key in keys})
    at = clock.now()
    recent = (
        session.scalar(
            select(func.count())
            .select_from(OnceMessage)
            .where(
                OnceMessage.space_id == context.space_id,
                OnceMessage.sender_id == context.account_id,
                OnceMessage.created_at > at - timedelta(hours=1),
            )
        )
        or 0
    )
    used = (
        session.scalar(
            select(func.coalesce(func.sum(OnceMessage.byte_size), 0)).where(
                OnceMessage.space_id == context.space_id, OnceMessage.expires_at > at
            )
        )
        or 0
    )
    if recent >= 12 or used + size > MAX_SPACE_BYTES:
        raise RateLimitedError(
            "Temporary message capacity reached. Try later.",
            "ONCE_CAPACITY_REACHED",
            retry_after_seconds=3600,
        )
    own = next(member for member in current if member.account_id == context.account_id)
    message = OnceMessage(
        space_id=context.space_id,
        sender_id=context.account_id,
        recipient_id=recipient_id,
        sender_membership_id=own.id,
        recipient_membership_id=partner.id,
        request_id=request_id,
        fingerprint=fingerprint,
        payload=OnceEnvelope(jwe=jwe),
        byte_size=size,
        created_at=at,
        expires_at=at + LIFETIME,
    )
    session.add(message)
    session.flush()
    outbox.record(
        session,
        DomainEvent(
            type=EventType.ONCE_MESSAGE_SENT,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="once_message",
            subject_id=message.id,
            payload=PublicEventPayload(recipient_id=recipient_id, due_at=message.expires_at),
        ),
    )
    queue.enqueue(session, CLEANUP_JOB, {"message_id": str(message.id)}, delay=LIFETIME)
    return message


def available_predicate(context: AuthorizationContext) -> Any:
    """Current recipient, both exact memberships and consent, never commercial state."""
    conditions: list[Any] = [
        OnceMessage.space_id == context.space_id,
        OnceMessage.recipient_id == context.account_id,
        OnceMessage.expires_at > clock.now(),
        OnceMessage.claim_hash.is_(None),
        OnceMessage.byte_size > 0,
    ]
    for account_column, member_column in (
        (OnceMessage.sender_id, OnceMessage.sender_membership_id),
        (OnceMessage.recipient_id, OnceMessage.recipient_membership_id),
    ):
        conditions.append(
            select(Membership.id)
            .join(Account, Account.id == Membership.account_id)
            .join(
                OnceReception,
                and_(
                    OnceReception.space_id == Membership.space_id,
                    OnceReception.account_id == Membership.account_id,
                    OnceReception.membership_id == Membership.id,
                ),
            )
            .where(
                Membership.id == member_column,
                Membership.space_id == context.space_id,
                Membership.account_id == account_column,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
                OnceReception.enabled.is_(True),
            )
            .exists()
        )
    return and_(*conditions)


def get_sealed(session: Session, context: AuthorizationContext, message_id: UUID) -> OnceMessage:
    message = session.scalar(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(OnceMessage.id == message_id, available_predicate(context))
    )
    if message is None:
        raise absent()
    return message


def claim(
    session: Session,
    context: AuthorizationContext,
    message_id: UUID,
    *,
    device_id: UUID,
    token: UUID,
) -> OnceMessage:
    current = members(session, context, lock=True)
    own = next(member for member in current if member.account_id == context.account_id)
    if not all(enabled(session, member) for member in current) or len(current) != 2:
        raise absent()
    device = session.get(OnceDevice, device_id)
    if device is None or device not in current_keys(session, own):
        raise absent()
    message = session.scalar(
        select(OnceMessage)
        .where(
            OnceMessage.id == message_id,
            OnceMessage.space_id == context.space_id,
            OnceMessage.recipient_id == context.account_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    at = clock.now()
    if (
        message is None
        or message.expires_at <= at
        or message.byte_size == 0
        or {message.sender_membership_id, message.recipient_membership_id}
        != {member.id for member in current}
    ):
        raise absent()
    digest = hashlib.sha256(token.bytes).hexdigest()
    if message.claim_hash is not None:
        if (
            message.claim_device_id != device_id
            or not secrets.compare_digest(message.claim_hash, digest)
            or message.claim_until is None
            or message.claim_until <= at
        ):
            raise absent()
        return message
    if str(device_id) not in {
        recipient["header"]["kid"] for recipient in message.payload.jwe["recipients"]
    }:
        raise ConflictError("This device cannot open this message.", "ONCE_DEVICE_UNAVAILABLE")
    message.claim_hash = digest
    message.claim_device_id = device_id
    message.claim_until = min(message.expires_at, at + CLAIM_LIFETIME)
    clear_notifications(session, [message.id])
    queue.enqueue(session, CLEANUP_JOB, {"message_id": str(message.id)}, delay=CLAIM_LIFETIME)
    session.flush()
    return message


def acknowledge(
    session: Session, context: AuthorizationContext, message_id: UUID, *, token: UUID
) -> None:
    members(session, context, lock=True)
    message = session.scalar(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(
            OnceMessage.id == message_id,
            OnceMessage.space_id == context.space_id,
            OnceMessage.recipient_id == context.account_id,
        )
        .with_for_update()
    )
    if (
        message is None
        or message.claim_hash is None
        or not secrets.compare_digest(message.claim_hash, hashlib.sha256(token.bytes).hexdigest())
    ):
        raise absent()
    message.payload = OnceEnvelope(jwe={})
    message.byte_size = 0
    session.flush()


def discard(session: Session, context: AuthorizationContext, message_id: UUID) -> None:
    members(session, context, lock=True)
    message = session.scalar(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(
            OnceMessage.id == message_id,
            OnceMessage.space_id == context.space_id,
            or_(
                OnceMessage.recipient_id == context.account_id,
                OnceMessage.sender_id == context.account_id,
            ),
        )
        .with_for_update()
    )
    if message is None:
        raise absent()
    message.payload = OnceEnvelope(jwe={})
    message.byte_size = 0
    clear_notifications(session, [message.id])


def clear_notifications(session: Session, ids: list[UUID]) -> None:
    from eimir.engagement.models import Notification

    session.execute(
        delete(Notification).where(
            Notification.target_type == "ONCE_MESSAGE", Notification.target_id.in_(ids)
        )
    )


def purge_messages(session: Session, space_id: UUID, *, keep_receipts: bool = False) -> None:
    ids = list(session.scalars(select(OnceMessage.id).where(OnceMessage.space_id == space_id)))
    clear_notifications(session, ids)
    if keep_receipts:
        for message in session.scalars(
            select(OnceMessage)
            .options(defer(OnceMessage.payload))
            .where(OnceMessage.space_id == space_id)
        ):
            message.payload = OnceEnvelope(jwe={})
            message.byte_size = 0
    else:
        session.execute(delete(OnceMessage).where(OnceMessage.space_id == space_id))


def purge_space(session: Session, space_id: UUID) -> None:
    purge_messages(session, space_id)
    session.execute(delete(OnceDevice).where(OnceDevice.space_id == space_id))
    session.execute(delete(OnceReception).where(OnceReception.space_id == space_id))


def cleanup(session: Session, payload: dict[str, Any]) -> None:
    message_id = UUID(payload["message_id"])
    space_id = session.scalar(select(OnceMessage.space_id).where(OnceMessage.id == message_id))
    if space_id is None:
        return
    relationship.lock_space(session, space_id)
    message = session.scalar(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(OnceMessage.id == message_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if message is None:
        return
    if message.expires_at <= clock.now():
        clear_notifications(session, [message.id])
        session.delete(message)
    elif message.claim_until is not None and message.claim_until <= clock.now():
        message.payload = OnceEnvelope(jwe={})
        message.byte_size = 0
        clear_notifications(session, [message.id])


def prune_expired(session: Session) -> None:
    # Recovery if an individual expiry job exhausted retries; bounded batches.
    ids = list(
        session.scalars(
            select(OnceMessage.id)
            .where(
                or_(
                    OnceMessage.expires_at <= clock.now(),
                    and_(OnceMessage.claim_until <= clock.now(), OnceMessage.byte_size > 0),
                )
            )
            .order_by(OnceMessage.space_id, OnceMessage.id)
            .limit(200)
        )
    )
    for message_id in ids:
        cleanup(session, {"message_id": str(message_id)})


def register_handlers() -> None:
    from eimir.jobs.worker import registry

    if registry.get(CLEANUP_JOB) is None:
        registry.register(CLEANUP_JOB, cleanup)
