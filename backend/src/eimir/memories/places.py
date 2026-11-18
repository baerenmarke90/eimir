"""Ordered presentation of canonical typed PlaceMemory relations."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, require_readable, require_writable_locked
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.memories.models import Memory
from eimir.places.models import Place
from eimir.relations import service as relations
from eimir.relations.models import PlaceMemory


def identifiers(session: Session, memory: Memory) -> list[UUID]:
    linked = list(
        session.scalars(
            select(PlaceMemory.place_id)
            .where(PlaceMemory.memory_id == memory.id)
            .order_by(PlaceMemory.created_at, PlaceMemory.place_id)
        )
    )
    preferred = memory.payload.place_order
    return [identifier for identifier in preferred if identifier in linked] + [
        identifier for identifier in linked if identifier not in preferred
    ]


def validate(selection: list[UUID]) -> None:
    if len(selection) > 20 or len(set(selection)) != len(selection):
        raise ValidationError("Select at most 20 distinct places.", "MEMORY_PLACES_INVALID")


def prepare(
    session: Session, context: AuthorizationContext, memory_id: UUID | str, selection: list[UUID]
) -> set[UUID]:
    """Acquire Place locks before the Memory lock, matching typed relations.

    A membership race is rejected after the Memory lock instead of acquiring a
    newly discovered Place in the reverse order or overwriting an unseen link.
    """
    validate(selection)
    memory = require_readable(session, Memory, context, memory_id)
    observed = set(identifiers(session, memory))
    for identifier in sorted(observed | set(selection)):
        require_writable_locked(session, Place, context, identifier)
    return observed


def replace(
    session: Session,
    context: AuthorizationContext,
    memory: Memory,
    selection: list[UUID],
    *,
    observed: set[UUID] | None = None,
) -> None:
    validate(selection)
    previous = set(identifiers(session, memory))
    if observed is not None and previous != observed:
        raise ConflictError(
            "The linked places changed. Reload before saving.", ErrorCode.RESOURCE_VERSION_CONFLICT
        )
    for identifier in sorted(previous - set(selection)):
        relations.unlink(session, context, identifier, memory.id, relations.PLACE_MEMORIES)
    for identifier in selection:
        relations.link(session, context, identifier, memory.id, relations.PLACE_MEMORIES)
    memory.payload = memory.payload.model_copy(update={"place_order": selection})
