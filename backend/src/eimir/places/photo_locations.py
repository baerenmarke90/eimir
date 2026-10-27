"""Keep selected-photo places through existing typed shared-content relations.

Called only after a confirmed parent write/binding in the same transaction.
No provider requests, global place merging or attachment metadata read API.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, PhotoCoordinates
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.identity.models import Account
from eimir.places import service as places
from eimir.places.localized_names import photo_place_name
from eimir.relations import service as relations


def _nearby(left: PhotoCoordinates, right: PhotoCoordinates) -> bool:
    """Group one newly bound batch within 100 m; never merge saved Places."""
    latitude_delta = math.radians(right.latitude - left.latitude)
    longitude_delta = math.radians(right.longitude - left.longitude)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(math.radians(left.latitude))
        * math.cos(math.radians(right.latitude))
        * math.sin(longitude_delta / 2) ** 2
    )
    distance = 2 * 6_371_000 * math.asin(math.sqrt(min(1, haversine)))
    return distance <= 100


def keep_photo_places(
    session: Session,
    context: AuthorizationContext,
    *,
    target_id: UUID,
    privacy_class: str,
    kind: relations.RelationKind,
    attachments: Sequence[Attachment],
) -> None:
    """Consume staging GPS once; only shared parents may create places.

    Existing links take precedence, including manual choices. The caller
    supplies only newly bound attachments, so reorder/retry after removal
    cannot silently reintroduce an old place. Each batch groups nearby photo
    positions without averaging or changing any previously stored place.
    """
    coordinates = [
        attachment.payload.photo_coordinates
        for attachment in attachments
        if attachment.payload.photo_coordinates is not None
    ]
    for attachment in attachments:
        if attachment.payload.photo_coordinates is not None:
            attachment.payload = attachment.payload.model_copy(update={"photo_coordinates": None})
    if not coordinates or privacy_class != PrivacyClass.SPACE_SHARED.value:
        return
    preference = session.execute(
        select(Account.auto_photo_locations, Account.locale).where(Account.id == context.account_id)
    ).one_or_none()
    if preference is None or not preference.auto_photo_locations:
        return
    table = kind.relation.__table__
    if (
        session.scalar(
            select(table.c.place_id)
            .where(
                table.c.space_id == context.space_id,
                table.c[kind.target_column] == target_id,
            )
            .limit(1)
        )
        is not None
    ):
        return

    representatives: list[PhotoCoordinates] = []
    for coordinate in coordinates:
        if any(_nearby(coordinate, previous) for previous in representatives):
            continue
        representatives.append(coordinate)
        place = places.create_place(
            session,
            context,
            name=photo_place_name(preference.locale),
            description=None,
            address=None,
            latitude=coordinate.latitude,
            longitude=coordinate.longitude,
            photo_location=True,
        )
        relations.link(session, context, place.id, target_id, kind)
