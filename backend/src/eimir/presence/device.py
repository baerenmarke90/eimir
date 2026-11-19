"""Scoped device credentials for background snapshot uploads (#1792).

The Android app publishes its owner's approximate position while closed. It
must not refresh the Web session natively (that would race the Web client's
refresh-token rotation), so it receives a separate credential that can only
replace the owner's presence snapshot. The credential:

- is bound to the issuing device session, so sign-out, session revocation and
  session expiry end it through ``sessions.resolve_family``;
- is bound to the consent generation it was issued for, so every change of
  level, duration, recipient or suspension ends it;
- expires after at most 30 days and never outlives its session family;
- is stored only as a hash.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.auth.tokens import generate_token, hash_token
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import ConflictError, ErrorCode, UnauthenticatedError
from eimir.identity.models import DeviceSession
from eimir.presence import service
from eimir.presence.models import PresenceDeviceCredential
from eimir.relationship.models import Membership, MembershipStatus

CREDENTIAL_LIFETIME = timedelta(days=30)
MAX_DEVICES_PER_OWNER = 3


@dataclass(frozen=True)
class IssuedCredential:
    credential: str
    expires_at: datetime
    consent_generation: int


def _unauthenticated() -> UnauthenticatedError:
    return UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)


def issue(
    session: Session,
    authorization: AuthorizationContext,
    device_session: DeviceSession,
    *,
    device_id: UUID,
) -> IssuedCredential:
    """Issue or replace this device's credential for the owner's active share."""
    at = now()
    consent = service.consent_row(
        session, authorization.space_id, authorization.account_id, lock=True
    )
    if not service.feature_enabled() or not service.has_presence_capability(
        session, authorization.space_id, lock=True
    ):
        raise ConflictError(
            "Background sharing is not available.",
            code=service.PartnerLocationErrorCode.NOT_SHARING,
        )
    partner_id = service.active_partner_account_id(session, authorization)
    if (
        service.consent_state(consent, current_partner_id=partner_id, at=at)
        is not service.SharingState.ACTIVE
    ):
        raise ConflictError(
            "Background sharing needs an active share.",
            code=service.PartnerLocationErrorCode.NOT_SHARING,
        )
    assert consent is not None

    existing = list(
        session.execute(
            select(PresenceDeviceCredential)
            .where(
                PresenceDeviceCredential.space_id == authorization.space_id,
                PresenceDeviceCredential.account_id == authorization.account_id,
            )
            .order_by(PresenceDeviceCredential.created_at, PresenceDeviceCredential.id)
            .with_for_update()
        ).scalars()
    )
    for credential in existing:
        if credential.device_id == device_id or credential.expires_at <= at:
            session.delete(credential)
    remaining = [c for c in existing if c.device_id != device_id and c.expires_at > at]
    for surplus in remaining[: max(0, len(remaining) - (MAX_DEVICES_PER_OWNER - 1))]:
        session.delete(surplus)
    session.flush()

    token = generate_token()
    expires_at = min(at + CREDENTIAL_LIFETIME, device_session.absolute_expires_at)
    session.add(
        PresenceDeviceCredential(
            space_id=authorization.space_id,
            account_id=authorization.account_id,
            device_session_id=device_session.id,
            device_id=device_id,
            token_hash=hash_token(token),
            consent_generation=consent.generation,
            expires_at=expires_at,
            # Explicit issue time keeps the oldest-first device limit deterministic.
            created_at=at,
        )
    )
    session.flush()
    return IssuedCredential(
        credential=token, expires_at=expires_at, consent_generation=consent.generation
    )


def revoke(session: Session, authorization: AuthorizationContext, *, device_id: UUID) -> None:
    """Remove this device's credential; always allowed (non-paywallable)."""
    session.execute(
        delete(PresenceDeviceCredential).where(
            PresenceDeviceCredential.space_id == authorization.space_id,
            PresenceDeviceCredential.account_id == authorization.account_id,
            PresenceDeviceCredential.device_id == device_id,
        )
    )


def revoke_owner(session: Session, space_id: UUID, account_id: UUID) -> None:
    session.execute(
        delete(PresenceDeviceCredential).where(
            PresenceDeviceCredential.space_id == space_id,
            PresenceDeviceCredential.account_id == account_id,
        )
    )


def publish_with_credential(
    session: Session,
    *,
    credential: str,
    latitude: float,
    longitude: float,
    accuracy_meters: float,
    captured_at: datetime,
) -> bool:
    """Publish through a device credential.

    Returns ``True`` when the snapshot was stored and ``False`` when the share
    is no longer active; the device then stops and deletes its credential.
    Unknown, expired or session-revoked credentials raise 401.
    """
    at = now()
    row = session.execute(
        select(PresenceDeviceCredential)
        .where(
            PresenceDeviceCredential.token_hash == hash_token(credential),
            PresenceDeviceCredential.expires_at > at,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if row is None:
        raise _unauthenticated()
    _, account = sessions.resolve_family(session, row.device_session_id)
    if account.id != row.account_id:
        raise _unauthenticated()
    member = session.execute(
        select(Membership.id).where(
            Membership.space_id == row.space_id,
            Membership.account_id == row.account_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).scalar_one_or_none()
    if member is None:
        session.delete(row)
        session.flush()
        return False

    authorization = AuthorizationContext(account_id=row.account_id, space_id=row.space_id)
    view = service.publish_snapshot(
        session,
        authorization,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=accuracy_meters,
        captured_at=captured_at,
        consent_generation=row.consent_generation,
        stale_generation_is_inactive=True,
    )
    if view.state is not service.SharingState.ACTIVE or view.generation != row.consent_generation:
        session.delete(row)
        session.flush()
        return False
    row.last_used_at = at
    return True
