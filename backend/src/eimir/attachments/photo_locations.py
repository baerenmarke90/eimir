"""Selected-photo location consent and atomic shared-place association.

The attachment row is locked before the account-scoped advisory lock. Preference
writes lock Account with NO KEY UPDATE first (compatible with content FK checks),
then the advisory lock; they never lock attachments. Drafts have only Attachment
as lifecycle FK, so workers do not acquire Account locks after Attachment.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from eimir.heart_moments.models import HeartMoment
    from eimir.memories.models import Memory

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, PhotoLocationDraft, PhotoLocationPayload
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.errors import ConflictError, UnauthenticatedError
from eimir.db.locks import lock_subject
from eimir.identity.models import Account


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
    if account.photo_locations_enabled != enabled:
        account.photo_locations_enabled = enabled
        account.photo_locations_version += 1
        if not enabled:
            discard_owner(session, account_id)
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
            attachment_id=attachment.id,
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
    for attachment in attachments:
        draft = session.get(PhotoLocationDraft, attachment.id)
        if draft is not None:
            session.delete(draft)
            if (
                enabled
                and draft.preference_version == version
                and draft.owner_id == context.account_id
                and draft.payload.owner_id == context.account_id
                and draft.payload.attachment_id == attachment.id
                and attachment.space_id == context.space_id
                and target.privacy_class == PrivacyClass.SPACE_SHARED.value
            ):
                drafts.append(draft.payload)
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
    name = "Foto-Ort" if locale.lower().startswith("de") else "Photo location"
    seen: set[tuple[float, float]] = set()
    for payload in drafts:
        pair = (payload.latitude, payload.longitude)
        if pair in seen:
            continue
        seen.add(pair)
        place = places.create_place(
            session,
            context,
            name=name,
            description=None,
            address=None,
            latitude=payload.latitude,
            longitude=payload.longitude,
        )
        relations.link(session, context, place.id, target_id, kind, automatic=True)
