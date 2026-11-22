"""The couple's own pick of the sources of an unsaved recap edition."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.core.ids import new_id
from eimir.recaps.composition import MANUAL_SELECTION_LIMIT, Candidate
from eimir.recaps.models import (
    RecapEdition,
    RecapPayload,
    RecapSource,
    RecapSourceKind,
)
from eimir.recaps.presentation import materials
from eimir_pro.recap_composition.composer import candidates


def replace_sources(
    session: Session, context: AuthorizationContext, value: RecapEdition, keys: list[str]
) -> None:
    if value.saved_at:
        raise ConflictError("A saved edition cannot be recomposed.", ErrorCode.VERSION_CONFLICT)
    pool = candidates(session, context, value.starts_on, value.through_on, value.variant)
    existing = {item.key: item for item in pool}
    current = session.scalars(select(RecapSource).where(RecapSource.edition_id == value.id)).all()
    for ref in current:
        if f"{ref.kind}:{ref.source_id}" not in existing:
            material, _ = materials(session, context, value)
            for item in material:
                if item["available"]:
                    existing[item["key"]] = Candidate(
                        RecapSourceKind(item["kind"]),
                        item["id"],
                        item["occurred_on"],
                        item["version"],
                    )
            break
    if (
        len(keys) > MANUAL_SELECTION_LIMIT
        or len(set(keys)) != len(keys)
        or any(key not in existing for key in keys)
    ):
        raise ValidationError(
            "Only eligible shared period sources can be selected.", ErrorCode.VALIDATION_FAILED
        )
    session.execute(delete(RecapSource).where(RecapSource.edition_id == value.id))
    for position, key in enumerate(keys):
        chosen = existing[key]
        session.add(
            RecapSource(
                edition_id=value.id,
                kind=chosen.kind.value,
                source_id=chosen.id,
                source_version=chosen.version,
                position=position,
            )
        )
    film = value.payload.film
    if film is not None:
        # A curated selection keeps its look; picks of removed sources are dropped.
        film = film.model_copy(
            update={
                "highlight_key": film.highlight_key if film.highlight_key in keys else None,
                "media": {key: media for key, media in film.media.items() if key in keys},
            }
        )
    value.payload = RecapPayload(mood=value.payload.mood, film=film)
    value.generated_by = "RULES"
    value.customized = True
    value.status = "READY" if keys else "EMPTY"
    value.request_token = new_id()
