"""Asynchronous readable photo Places, including bounded repair of old entries.

No location or content enters the ordinary job payload. Every actual lookup
rechecks canonical authorization, automatic origin and untouched version.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from eimir.attachments.photo_location_labels import PHOTO_PLACE_NAMES
from eimir.auth import rate_limit
from eimir.authorization import PrivacyClass
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import RateLimitedError
from eimir.db.locks import lock_subject
from eimir.domain.events import EventType
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.errors import DeferredJobError, RetryableJobError
from eimir.jobs.models import Job
from eimir.jobs.worker import JobRegistry, registry
from eimir.memories.models import Memory
from eimir.places import service
from eimir.places.models import Place
from eimir.providers.base import GeoPoint
from eimir.providers.photon import GeocodingUnavailableError, PhotonReverseGeocoder
from eimir.relations.models import PlaceHeartMoment, PlaceMemory
from eimir.relationship.models import Membership, MembershipStatus

JOB_KIND = "photo_place_enrichment"
REPAIR_BATCH = 25
PROVIDER_LIMIT = rate_limit.Limit(attempts=1, window=timedelta(seconds=2))


def _automatic_relation() -> Any:
    return or_(
        exists(
            select(PlaceMemory.place_id).where(
                PlaceMemory.place_id == Place.id,
                PlaceMemory.space_id == Place.space_id,
                PlaceMemory.photo_generated.is_(True),
            )
        ),
        exists(
            select(PlaceHeartMoment.place_id).where(
                PlaceHeartMoment.place_id == Place.id,
                PlaceHeartMoment.space_id == Place.space_id,
                PlaceHeartMoment.photo_generated.is_(True),
            )
        ),
    )


def _untouched(place: Place) -> bool:
    return (
        place.version == 1
        and place.privacy_class == PrivacyClass.SPACE_SHARED.value
        and place.latitude is not None
        and place.longitude is not None
        and place.payload.name in PHOTO_PLACE_NAMES.values()
        and place.payload.address is None
        and place.payload.description is None
    )


def schedule_place(session: Session, place: Place) -> Job | None:
    if not get_settings().photo_place_geocoding_url or not _untouched(place):
        return None
    preference = session.execute(
        select(Account.photo_locations_enabled, Account.photo_locations_version).where(
            Account.id == place.owner_id,
            Account.disabled_at.is_(None),
        )
    ).one_or_none()
    if preference is None or not preference[0]:
        return None
    lock_subject(session, "photo-place-enrichment-queue", str(place.id))
    if session.get(Job, place.id) is not None:
        return None
    job = queue.enqueue(
        session,
        JOB_KIND,
        {
            "place_id": str(place.id),
            "space_id": str(place.space_id),
            "owner_id": str(place.owner_id),
            "preference_version": int(preference[1]),
        },
        max_attempts=5,
    )
    # One durable job identity per automatic Place. Reuse its UUIDv7 so repair
    # can use the existing Job primary key instead of scanning JSON payloads.
    job.id = place.id
    return job


def ensure_scheduled(session: Session) -> None:
    """Repair old automatic placeholders in bounded batches, never on reads."""
    if not get_settings().photo_place_geocoding_url:
        return
    prior_job = exists(select(Job.id).where(Job.id == Place.id))
    rows = (
        session.execute(
            select(Place)
            .join(Account, Account.id == Place.owner_id)
            .where(
                Place.version == 1,
                Place.latitude.is_not(None),
                _automatic_relation(),
                ~prior_job,
                Account.disabled_at.is_(None),
                Account.photo_locations_enabled.is_(True),
                exists(
                    select(Membership.id).where(
                        Membership.account_id == Place.owner_id,
                        Membership.space_id == Place.space_id,
                        Membership.status == MembershipStatus.ACTIVE.value,
                    )
                ),
            )
            .order_by(Place.created_at, Place.id)
            .limit(REPAIR_BATCH)
        )
        .scalars()
        .all()
    )
    for place in rows:
        schedule_place(session, place)


def _lock_authorized_place(
    session: Session, payload: dict[str, Any]
) -> tuple[Place, Account] | None:
    try:
        place_id, space_id, owner_id = (
            UUID(str(payload[key])) for key in ("place_id", "space_id", "owner_id")
        )
    except (KeyError, ValueError, TypeError):
        return None
    preference_version = payload.get("preference_version")
    if not isinstance(preference_version, int) or isinstance(preference_version, bool):
        return None
    # Account -> Membership -> Place -> target follows existing authorization.
    # Account SHARE also fences preference changes. Binding locks targets
    # before its own photo-locations lock, which must not be taken here.
    account = session.execute(
        select(Account)
        .where(
            Account.id == owner_id,
            Account.disabled_at.is_(None),
            Account.photo_locations_enabled.is_(True),
            Account.photo_locations_version == preference_version,
        )
        .with_for_update(read=True)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if account is None:
        return None
    member = session.execute(
        select(Membership)
        .where(
            Membership.account_id == owner_id,
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update(read=True)
    ).scalar_one_or_none()
    if member is None:
        return None
    place = session.execute(
        select(Place)
        .where(
            Place.id == place_id,
            Place.space_id == space_id,
            Place.owner_id == owner_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    if place is None or not _untouched(place):
        return None
    memory_link = _lock_links(session, place, PlaceMemory, Memory, PlaceMemory.memory_id)
    heart_link = _lock_links(
        session, place, PlaceHeartMoment, HeartMoment, PlaceHeartMoment.heart_moment_id
    )
    if memory_link is None or heart_link is None:
        return None
    return (place, account) if memory_link or heart_link else None


def _lock_links[Target: (Memory, HeartMoment), Relation: (PlaceMemory, PlaceHeartMoment)](
    session: Session,
    place: Place,
    relation: type[Relation],
    target: type[Target],
    column: InstrumentedAttribute[UUID],
) -> bool | None:
    targets = (
        session.execute(
            select(target)
            .join(relation, column == target.id)
            .where(
                relation.place_id == place.id,
                relation.space_id == place.space_id,
                target.space_id == place.space_id,
            )
            .order_by(target.id)
            .with_for_update(read=True, of=target)
        )
        .scalars()
        .all()
    )
    for item in targets:
        lock_subject(session, "photo-place-target", str(item.id))
        if item.privacy_class != PrivacyClass.SPACE_SHARED.value:
            return None
    links = (
        session.execute(
            select(relation).where(
                relation.place_id == place.id,
                relation.space_id == place.space_id,
            )
        )
        .scalars()
        .all()
    )
    if any(not item.photo_generated for item in links):
        return None
    return bool(links and targets)


def enrich(session: Session, payload: dict[str, Any]) -> None:
    origin = get_settings().photo_place_geocoding_url
    if not origin:
        return
    authorized = _lock_authorized_place(session, payload)
    if authorized is None:
        return
    place, account = authorized
    try:
        rate_limit.check(session, JOB_KIND, "configured-provider", PROVIDER_LIMIT)
    except RateLimitedError:
        raise DeferredJobError(now() + PROVIDER_LIMIT.window) from None
    assert place.latitude is not None and place.longitude is not None
    try:
        candidate = PhotonReverseGeocoder(origin).reverse(
            GeoPoint(latitude=place.latitude, longitude=place.longitude),
            account.locale,
        )
    except GeocodingUnavailableError:
        raise RetryableJobError("PHOTO_GEOCODING_UNAVAILABLE") from None
    if candidate is None:
        return
    place.payload = place.payload.model_copy(
        update={
            "name": candidate.name,
            "address": candidate.address,
            "geocoding_source": candidate.source,
        }
    )
    session.flush()
    service._record(session, place, account.id, EventType.PLACE_UPDATED)
    session.flush()


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(JOB_KIND) is None:
        destination.register(JOB_KIND, enrich)
