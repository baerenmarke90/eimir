"""The mutual-reaction bonus for recap selection.

The quoted comment and the reaction line are read live with each source in
``eimir.recaps.presentation``; this module only uses the same reaction rule to
weigh candidates while a period is composed. Nothing here is generated or rewritten.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments.binding import attachments_of_memories, cover_of
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.memories.models import Memory
from eimir.recaps.presentation import mutual_reaction, partners


def loved_memories(
    session: Session, context: AuthorizationContext, memory_ids: list[UUID]
) -> set[UUID]:
    """Memories whose cover photo both members reacted to alike, for the selection bonus."""
    members = partners(session, context.space_id)
    if members is None or not memory_ids:
        return set()
    memories = session.scalars(
        readable(Memory, context).where(
            Memory.id.in_(memory_ids),
            Memory.privacy_class == PrivacyClass.SPACE_SHARED.value,
            Memory.crypto_version.in_((0, 2)),
        )
    ).all()
    galleries = attachments_of_memories(session, [memory.id for memory in memories])
    result = set()
    for memory in memories:
        cover = cover_of(galleries.get(memory.id, []), memory.payload.selected_cover_attachment_id)
        if mutual_reaction(members, memory.payload, cover.id if cover else None):
            result.add(memory.id)
    return result
