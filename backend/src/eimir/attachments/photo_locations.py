"""Selected-photo location processing and atomic shared-place association.

The attachment row is locked before the account-scoped advisory lock. Preference
writes lock Account with NO KEY UPDATE first (compatible with content FK checks),
then the advisory lock; they never lock attachments. Drafts have only Attachment
as lifecycle FK, so workers do not acquire Account locks after Attachment.
"""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from eimir.heart_moments.models import HeartMoment
    from eimir.memories.models import Memory

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, PhotoLocationDraft, PhotoLocationPayload
from eimir.attachments.photo_location_labels import initial_photo_place_name
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.errors import ConflictError, UnauthenticatedError
from eimir.db.locks import lock_subject
from eimir.identity.models import Account
from eimir.places.models import Place


def preference(session: Session, account_id: UUID) -> tuple[bool, int]:
    row = session.execute(
        select(Account.photo_locations_enabled, Account.photo_locations_version).where(
            Account.id == account_id, Account.disabled_at.is_(None)
        )
    ).one_or_none()
    if row is None:
        raise UnauthenticatedError("Authentication required.", "AUTHENTICATION_REQUIRED")
    return bool(row[0]), int(row[1])


def set_preference(
    session: Session, account_id: UUID, *, enabled: bool, expected_version: int
) -> tuple[bool, int]:
    with session.no_autoflush:
        account = session.execute(
            select(Account)
            .where(Account.id == account_id, Account.disabled_at.is_(None))
            .with_for_update(key_share=True)
            .execution_options(populate_existing=True)
        ).scalar_one_or_none()
    if account is None:
        raise UnauthenticatedError("Authentication required.", "AUTHENTICATION_REQUIRED")
    lock_subject(session, "photo-locations", str(account_id))
    if account.photo_locations_version != expected_version:
        raise ConflictError("Photo location preference changed.", "VERSION_CONFLICT")
    if not enabled:
        raise ConflictError(
            "Photo-derived Places remain enabled.", "PHOTO_LOCATIONS_ALWAYS_ENABLED"
        )
    if account.photo_locations_enabled != enabled:
        account.photo_locations_enabled = enabled
        account.photo_locations_version += 1
        session.flush()
    return enabled, account.photo_locations_version


def discard_owner(session: Session, account_id: UUID) -> None:
    session.execute(delete(PhotoLocationDraft).where(PhotoLocationDraft.owner_id == account_id))


def extraction_preference(session: Session, attachment: Attachment) -> tuple[bool, int]:
    lock_subject(session, "photo-locations", str(attachment.owner_id))
    row = session.execute(
        select(Account.photo_locations_enabled, Account.photo_locations_version).where(
            Account.id == attachment.owner_id, Account.disabled_at.is_(None)
        )
    ).one_or_none()
    return (
        (False, -1) if row is None or attachment.space_id is None else (bool(row[0]), int(row[1]))
    )


def stage(
    session: Session, attachment: Attachment, coordinates: tuple[float, float] | None, version: int
) -> None:
    if coordinates is None:
        return
    session.add(
        PhotoLocationDraft(
            id=attachment.id,
            owner_id=attachment.owner_id,
            preference_version=version,
            payload=PhotoLocationPayload(
                attachment_id=attachment.id,
                owner_id=attachment.owner_id,
                latitude=coordinates[0],
                longitude=coordinates[1],
            ),
        )
    )


def discard(session: Session, attachment_ids: list[UUID]) -> None:
    """Consume staged locations without creating Places (edited replacements)."""
    if attachment_ids:
        session.execute(delete(PhotoLocationDraft).where(PhotoLocationDraft.id.in_(attachment_ids)))


def bind(
    session: Session,
    context: AuthorizationContext,
    target: Memory | HeartMoment,
    attachments: list[Attachment],
    *,
    heart: bool = False,
) -> None:
    """Consume once; no private or disabled association can be replayed later."""
    from eimir.places import service as places
    from eimir.relations import service as relations
    from eimir.relations.models import PlaceHeartMoment, PlaceMemory

    lock_subject(session, "photo-locations", str(context.account_id))
    enabled, version = preference(session, context.account_id)
    drafts = []
    private_drafts = []
    for attachment in attachments:
        draft = session.get(PhotoLocationDraft, attachment.id)
        if draft is not None:
            session.delete(draft)
            if not (
                enabled
                and draft.preference_version == version
                and draft.owner_id == context.account_id
                and draft.payload.owner_id == context.account_id
                and draft.payload.attachment_id == attachment.id
                and attachment.space_id == context.space_id
            ):
                continue
            if target.privacy_class == PrivacyClass.SPACE_SHARED.value:
                drafts.append(draft.payload)
            elif heart and target.privacy_class == PrivacyClass.OWNER_ONLY.value:
                private_drafts.append(draft.payload)
    if private_drafts:
        _fill_private_location(session, context, target, private_drafts[0])
    if not drafts:
        return
    kind = relations.PLACE_HEART_MOMENTS if heart else relations.PLACE_MEMORIES
    relation = PlaceHeartMoment if heart else PlaceMemory
    target_id = target.id
    # Reuse the typed target lock and privacy recheck before domain serialization.
    relations._require_relatable_target(session, context, kind, target_id)
    lock_subject(session, "photo-place-target", str(target_id))
    table = relation.__table__
    if (
        session.execute(
            select(table.c.place_id)
            .where(table.c[kind.target_column] == target_id, table.c.photo_generated.is_(False))
            .limit(1)
        ).first()
        is not None
    ):
        return
    locale = session.execute(
        select(Account.locale).where(Account.id == context.account_id)
    ).scalar_one()
    name = initial_photo_place_name(locale)
    # Coordinates live in the protected payload, so nearness cannot be asked in SQL.
    # Serialize per Space before reading candidates: two uploads at one spot must
    # not both decide that no Place exists yet.
    lock_subject(session, "photo-place-space", str(context.space_id))
    known = _space_places(session, context.space_id)
    for payload in drafts:
        existing = _nearest_within_radius(known, payload.latitude, payload.longitude)
        if existing is not None:
            # A photo at a known spot reuses that Place. Linking is idempotent, so a
            # second photo on the same entry changes nothing.
            relations.link(session, context, existing.id, target_id, kind, automatic=True)
            continue
        place = places.create_place(
            session,
            context,
            name=name,
            description=None,
            address=None,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        known.append(place)
        relations.link(session, context, place.id, target_id, kind, automatic=True)
        from eimir.places.photo_enrichment import schedule_place

        schedule_place(session, place)


def _fill_private_location(
    session: Session,
    context: AuthorizationContext,
    target: Memory | HeartMoment,
    payload: PhotoLocationPayload,
) -> None:
    """A private Heart Moment keeps its photo location to itself.

    It never becomes a shared Place: the coordinates fill the moment's own
    protected location, which only its author reads, and only when the author
    chose none. A background job then replaces the placeholder name.
    """
    from eimir.heart_moments.location import HeartMomentLocation
    from eimir.heart_moments.models import HeartMoment

    if not isinstance(target, HeartMoment) or target.payload.location is not None:
        return
    locale = session.execute(
        select(Account.locale).where(Account.id == context.account_id)
    ).scalar_one()
    target.payload = target.payload.model_copy(
        update={
            "location": HeartMomentLocation(
                name=initial_photo_place_name(locale),
                latitude=payload.latitude,
                longitude=payload.longitude,
            )
        }
    )
    session.flush()
    from eimir.places.photo_enrichment import schedule_private_location

    schedule_private_location(session, target)


# Photos taken at one spot differ by GPS jitter of a few metres to some tens of
# metres. Photon (the reverse geocoder) itself accepts points within 200 m, so this
# stays well below that and below the distance between neighbouring addresses.
SAME_PLACE_RADIUS_METERS = 75.0
_SPACE_PLACE_SCAN_LIMIT = 500
_EARTH_RADIUS_METERS = 6_371_000.0


def _space_places(session: Session, space_id: UUID) -> list[Place]:
    """Newest located, non-archived Places of the Space (all are space-shared)."""
    return list(
        session.execute(
            select(Place)
            .where(Place.space_id == space_id, Place.archived.is_(False), Place.located())
            .order_by(Place.created_at.desc(), Place.id.desc())
            .limit(_SPACE_PLACE_SCAN_LIMIT)
        )
        .scalars()
        .all()
    )


def _distance_meters(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    """Great-circle distance; accurate far below the metre for these short spans."""
    phi_a, phi_b = radians(latitude_a), radians(latitude_b)
    delta_phi = phi_b - phi_a
    delta_lambda = radians(longitude_b - longitude_a)
    haversine = sin(delta_phi / 2) ** 2 + cos(phi_a) * cos(phi_b) * sin(delta_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_METERS * asin(min(1.0, sqrt(haversine)))


def _nearest_within_radius(
    candidates: list[Place], latitude: float, longitude: float
) -> Place | None:
    best: tuple[float, Place] | None = None
    for candidate in candidates:
        if candidate.latitude is None or candidate.longitude is None:
            continue
        distance = _distance_meters(
            latitude, longitude, float(candidate.latitude), float(candidate.longitude)
        )
        if distance <= SAME_PLACE_RADIUS_METERS and (best is None or distance < best[0]):
            best = (distance, candidate)
    return None if best is None else best[1]
