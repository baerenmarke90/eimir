"""Owner-controlled partner location sharing (docs/m9/PARTNER-LOCATION.md).

Only three projections leave this module: the owner's own settings, a coarse
distance band and an approximate partner map area. Every unavailable case
returns the same neutral shape so callers cannot learn why a partner's value
is missing. Viewer coordinates passed to ``partner_distance`` are used for one
computation and never stored or logged.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ConflictError, PremiumEntitlementRequiredError, ValidationError
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import Capability
from eimir.presence import geo
from eimir.presence.models import (
    PartnerLocationConsent,
    PresenceDeviceCredential,
    PresenceSnapshot,
    SharingLevel,
)
from eimir.relationship.models import Membership, MembershipStatus

CAPABILITY = Capability.PRESENCE_LOCATION.value
SNAPSHOT_TTL = timedelta(hours=24)
MAX_BOUNDED_DURATION = timedelta(hours=24)
MAX_CAPTURE_AGE = timedelta(hours=24)
MAX_CAPTURE_SKEW = timedelta(minutes=2)
PUBLISH_LIMIT = rate_limit.Limit(attempts=60, window=timedelta(hours=1))
DISTANCE_LIMIT = rate_limit.Limit(attempts=60, window=timedelta(hours=1))
MAP_LIMIT = rate_limit.Limit(attempts=120, window=timedelta(hours=1))
_DISTANCE_LEVELS = frozenset({SharingLevel.DISTANCE.value, SharingLevel.DISTANCE_AND_MAP.value})


class SharingState(StrEnum):
    OFF = "OFF"
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"
    PARTNER_CHANGED = "PARTNER_CHANGED"


class PartnerLocationErrorCode:
    NO_PARTNER = "partner_location_no_partner"
    GENERATION_STALE = "partner_location_generation_stale"
    INVALID_DURATION = "partner_location_invalid_duration"
    INVALID_CAPTURE_TIME = "partner_location_invalid_capture_time"
    FEATURE_DISABLED = "partner_location_disabled"
    NOT_SHARING = "partner_location_not_sharing"


@dataclass(frozen=True)
class SettingsView:
    available: bool
    level: SharingLevel
    state: SharingState
    indefinite: bool
    expires_at: datetime | None
    generation: int
    last_published_at: datetime | None


@dataclass(frozen=True)
class DistanceView:
    available: bool
    band: geo.DistanceBand | None = None
    as_of: datetime | None = None


@dataclass(frozen=True)
class MapView:
    available: bool
    latitude: float | None = None
    longitude: float | None = None
    radius_meters: int | None = None
    captured_at: datetime | None = None


UNAVAILABLE_DISTANCE = DistanceView(available=False)
UNAVAILABLE_MAP = MapView(available=False)


def feature_enabled() -> bool:
    return get_settings().partner_location_enabled


def active_partner_account_id(session: Session, authorization: AuthorizationContext) -> UUID | None:
    return session.execute(
        select(Membership.account_id)
        .where(
            Membership.space_id == authorization.space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.account_id != authorization.account_id,
        )
        .order_by(Membership.joined_at, Membership.id)
        .limit(1)
    ).scalar_one_or_none()


def consent_row(
    session: Session, space_id: UUID, account_id: UUID, *, lock: bool = False
) -> PartnerLocationConsent | None:
    statement = select(PartnerLocationConsent).where(
        PartnerLocationConsent.space_id == space_id,
        PartnerLocationConsent.account_id == account_id,
    )
    if lock:
        statement = statement.with_for_update()
    return session.execute(statement).scalar_one_or_none()


def _snapshot(session: Session, space_id: UUID, account_id: UUID) -> PresenceSnapshot | None:
    return session.execute(
        select(PresenceSnapshot).where(
            PresenceSnapshot.space_id == space_id,
            PresenceSnapshot.account_id == account_id,
        )
    ).scalar_one_or_none()


def delete_owner_presence(session: Session, space_id: UUID, account_id: UUID) -> None:
    """Remove the owner's snapshot and every background credential for it."""
    session.execute(
        delete(PresenceSnapshot).where(
            PresenceSnapshot.space_id == space_id,
            PresenceSnapshot.account_id == account_id,
        )
    )
    session.execute(
        delete(PresenceDeviceCredential).where(
            PresenceDeviceCredential.space_id == space_id,
            PresenceDeviceCredential.account_id == account_id,
        )
    )


def consent_state(
    consent: PartnerLocationConsent | None,
    *,
    current_partner_id: UUID | None,
    at: datetime,
) -> SharingState:
    if consent is None or consent.level == SharingLevel.OFF.value:
        return SharingState.OFF
    if consent.suspended_at is not None:
        return SharingState.SUSPENDED
    if consent.recipient_account_id != current_partner_id:
        return SharingState.PARTNER_CHANGED
    if not consent.indefinite and (consent.expires_at is None or consent.expires_at <= at):
        return SharingState.EXPIRED
    return SharingState.ACTIVE


def has_presence_capability(session: Session, space_id: UUID, *, lock: bool) -> bool:
    return entitlement_service.has_capability(session, space_id, CAPABILITY, lock_grants=lock)


def suspend_space(session: Session, space_id: UUID, *, at: datetime) -> int:
    """Suspend every active share of a Space that lost the capability.

    Restoring the entitlement never clears ``suspended_at``; only the owner's
    explicit new settings write does.
    """
    consents = list(
        session.execute(
            select(PartnerLocationConsent)
            .where(
                PartnerLocationConsent.space_id == space_id,
                PartnerLocationConsent.level != SharingLevel.OFF.value,
                PartnerLocationConsent.suspended_at.is_(None),
            )
            .with_for_update()
        ).scalars()
    )
    for consent in consents:
        consent.suspended_at = at
        consent.generation += 1
    session.execute(delete(PresenceSnapshot).where(PresenceSnapshot.space_id == space_id))
    session.execute(
        delete(PresenceDeviceCredential).where(PresenceDeviceCredential.space_id == space_id)
    )
    session.flush()
    return len(consents)


def _settings_view(
    session: Session,
    authorization: AuthorizationContext,
    consent: PartnerLocationConsent | None,
    *,
    at: datetime,
    entitled: bool,
) -> SettingsView:
    partner_id = active_partner_account_id(session, authorization)
    own_snapshot = _snapshot(session, authorization.space_id, authorization.account_id)
    return SettingsView(
        available=feature_enabled() and entitled and partner_id is not None,
        level=SharingLevel(consent.level) if consent is not None else SharingLevel.OFF,
        state=consent_state(consent, current_partner_id=partner_id, at=at),
        indefinite=bool(consent and consent.indefinite),
        expires_at=consent.expires_at if consent is not None else None,
        generation=consent.generation if consent is not None else 0,
        last_published_at=(
            own_snapshot.captured_at
            if own_snapshot is not None and own_snapshot.expires_at > at
            else None
        ),
    )


def get_settings_view(session: Session, authorization: AuthorizationContext) -> SettingsView:
    """The owner's own sharing state; readable without entitlement."""
    at = now()
    entitled = has_presence_capability(session, authorization.space_id, lock=False)
    consent = consent_row(session, authorization.space_id, authorization.account_id)
    return _settings_view(session, authorization, consent, at=at, entitled=entitled)


def update_settings(
    session: Session,
    authorization: AuthorizationContext,
    *,
    level: SharingLevel,
    indefinite: bool,
    expires_at: datetime | None,
) -> SettingsView:
    """Set the owner's sharing level. ``OFF`` is always accepted (non-paywallable)."""
    at = now()
    consent = consent_row(session, authorization.space_id, authorization.account_id, lock=True)

    if level is SharingLevel.OFF:
        entitled = has_presence_capability(session, authorization.space_id, lock=False)
        if consent is None:
            # Nothing was ever shared: stopping needs no stored decision.
            delete_owner_presence(session, authorization.space_id, authorization.account_id)
            return _settings_view(session, authorization, None, at=at, entitled=entitled)
        consent.level = SharingLevel.OFF.value
        consent.indefinite = False
        consent.expires_at = None
        consent.suspended_at = None
        consent.generation += 1
        delete_owner_presence(session, authorization.space_id, authorization.account_id)
        session.flush()
        return _settings_view(session, authorization, consent, at=at, entitled=entitled)

    if not feature_enabled():
        raise ValidationError(
            "Partner location is disabled on this deployment.",
            code=PartnerLocationErrorCode.FEATURE_DISABLED,
        )
    if not has_presence_capability(session, authorization.space_id, lock=True):
        raise PremiumEntitlementRequiredError(CAPABILITY)
    partner_id = active_partner_account_id(session, authorization)
    if partner_id is None:
        raise ConflictError(
            "Sharing needs a partner in this Space.", code=PartnerLocationErrorCode.NO_PARTNER
        )
    if indefinite == (expires_at is not None):
        raise ValidationError(
            "Choose either an end time or indefinite sharing.",
            code=PartnerLocationErrorCode.INVALID_DURATION,
        )
    if expires_at is not None and not (at < expires_at <= at + MAX_BOUNDED_DURATION):
        raise ValidationError(
            "The end time must lie within the next 24 hours.",
            code=PartnerLocationErrorCode.INVALID_DURATION,
        )

    if consent is None:
        consent = PartnerLocationConsent(
            space_id=authorization.space_id,
            account_id=authorization.account_id,
            generation=1,
        )
        session.add(consent)
    else:
        consent.generation += 1
    consent.level = level.value
    consent.recipient_account_id = partner_id
    consent.indefinite = indefinite
    consent.expires_at = expires_at
    consent.suspended_at = None
    delete_owner_presence(session, authorization.space_id, authorization.account_id)
    session.flush()
    return _settings_view(session, authorization, consent, at=at, entitled=True)


def _validate_capture_time(captured_at: datetime, at: datetime) -> None:
    if not (at - MAX_CAPTURE_AGE <= captured_at <= at + MAX_CAPTURE_SKEW):
        raise ValidationError(
            "The capture time is outside the accepted window.",
            code=PartnerLocationErrorCode.INVALID_CAPTURE_TIME,
        )


def publish_snapshot(
    session: Session,
    authorization: AuthorizationContext,
    *,
    latitude: float,
    longitude: float,
    accuracy_meters: float,
    captured_at: datetime,
    consent_generation: int,
    stale_generation_is_inactive: bool = False,
) -> SettingsView:
    """Replace the owner's snapshot when its share is active.

    Returns the owner's settings so a device learns immediately that sharing
    stopped, expired or was suspended; nothing is stored in that case.
    """
    at = now()
    _validate_capture_time(captured_at, at)
    consent = consent_row(session, authorization.space_id, authorization.account_id, lock=True)
    entitled = has_presence_capability(session, authorization.space_id, lock=True)
    if not feature_enabled():
        return _settings_view(session, authorization, consent, at=at, entitled=entitled)
    if not entitled:
        suspend_space(session, authorization.space_id, at=at)
        return _settings_view(session, authorization, consent, at=at, entitled=False)
    partner_id = active_partner_account_id(session, authorization)
    if consent_state(consent, current_partner_id=partner_id, at=at) is not SharingState.ACTIVE:
        return _settings_view(session, authorization, consent, at=at, entitled=True)
    assert consent is not None
    if consent.generation != consent_generation:
        if stale_generation_is_inactive:
            return _settings_view(session, authorization, consent, at=at, entitled=True)
        raise ConflictError(
            "Sharing settings changed; reload them before publishing.",
            code=PartnerLocationErrorCode.GENERATION_STALE,
        )
    rate_limit.check(
        session,
        "partner_location.publish",
        f"{authorization.space_id}:{authorization.account_id}",
        PUBLISH_LIMIT,
    )

    snapshot = _snapshot(session, authorization.space_id, authorization.account_id)
    if snapshot is None:
        snapshot = PresenceSnapshot(
            space_id=authorization.space_id, account_id=authorization.account_id
        )
        session.add(snapshot)
    snapshot.latitude = geo.snap_coordinate(latitude)
    snapshot.longitude = geo.snap_coordinate(longitude)
    snapshot.accuracy_meters = geo.stored_accuracy(accuracy_meters)
    snapshot.captured_at = captured_at
    snapshot.expires_at = captured_at + SNAPSHOT_TTL
    snapshot.consent_generation = consent.generation
    session.flush()
    return _settings_view(session, authorization, consent, at=at, entitled=True)


def _readable_partner_snapshot(
    session: Session,
    authorization: AuthorizationContext,
    *,
    levels: frozenset[str],
    at: datetime,
) -> PresenceSnapshot | None:
    partner_id = active_partner_account_id(session, authorization)
    if partner_id is None:
        return None
    consent = consent_row(session, authorization.space_id, partner_id)
    if consent is None or consent.level not in levels:
        return None
    # The partner's consent must name the viewer; consent_state compares the
    # recipient with the partner's own current partner, which is the viewer.
    if consent.recipient_account_id != authorization.account_id:
        return None
    if consent_state(consent, current_partner_id=authorization.account_id, at=at) is not (
        SharingState.ACTIVE
    ):
        return None
    snapshot = _snapshot(session, authorization.space_id, partner_id)
    if snapshot is None or snapshot.expires_at <= at:
        return None
    if snapshot.consent_generation != consent.generation:
        return None
    return snapshot


def _guard_read(session: Session, authorization: AuthorizationContext, at: datetime) -> bool:
    if not feature_enabled():
        return False
    if not has_presence_capability(session, authorization.space_id, lock=False):
        suspend_space(session, authorization.space_id, at=at)
        return False
    return True


def partner_distance(
    session: Session,
    authorization: AuthorizationContext,
    *,
    latitude: float,
    longitude: float,
    captured_at: datetime,
) -> DistanceView:
    at = now()
    _validate_capture_time(captured_at, at)
    if not _guard_read(session, authorization, at):
        return UNAVAILABLE_DISTANCE
    rate_limit.check(
        session,
        "partner_location.distance",
        f"{authorization.space_id}:{authorization.account_id}",
        DISTANCE_LIMIT,
    )
    snapshot = _readable_partner_snapshot(session, authorization, levels=_DISTANCE_LEVELS, at=at)
    if snapshot is None:
        return UNAVAILABLE_DISTANCE
    kilometres = geo.haversine_km(
        float(snapshot.latitude), float(snapshot.longitude), latitude, longitude
    )
    return DistanceView(
        available=True,
        band=geo.distance_band(kilometres),
        as_of=min(snapshot.captured_at, captured_at),
    )


def partner_map(session: Session, authorization: AuthorizationContext) -> MapView:
    at = now()
    if not _guard_read(session, authorization, at):
        return UNAVAILABLE_MAP
    rate_limit.check(
        session,
        "partner_location.map",
        f"{authorization.space_id}:{authorization.account_id}",
        MAP_LIMIT,
    )
    snapshot = _readable_partner_snapshot(
        session,
        authorization,
        levels=frozenset({SharingLevel.DISTANCE_AND_MAP.value}),
        at=at,
    )
    if snapshot is None:
        return UNAVAILABLE_MAP
    return MapView(
        available=True,
        latitude=float(snapshot.latitude),
        longitude=float(snapshot.longitude),
        radius_meters=geo.map_radius(snapshot.accuracy_meters),
        captured_at=snapshot.captured_at,
    )
