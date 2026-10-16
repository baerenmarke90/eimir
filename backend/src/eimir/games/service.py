"""Bounded read models for relationship-native games.

Games are consumers of existing product domains. This module deliberately
reuses authoritative authorization and attachment bindings instead of creating
a second Memory or media model.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, readable
from eimir.memories.models import Memory
from eimir.relationship.models import Membership, MembershipStatus
from eimir.wishes.models import Wish, WishStatus

MAX_MEMORY_CANDIDATES = 24
"""Maximum useful candidate pool returned to one local sofa-mode round client.

The query is not based on a Story page. It scans the authorized photo-backed
Memory set until this many usable candidates have been collected, so sparse
state cannot be inferred merely from one paginated timeline page.
"""


MAX_WISH_CANDIDATES = 32
"""Maximum useful Wish candidate pool returned to one sofa-mode client."""


@dataclass(frozen=True)
class MemoryCandidate:
    memory_id: UUID
    title: str
    effective_date: date
    image_attachment_id: UUID


def read_memory_candidates(
    session: Session,
    context: AuthorizationContext,
    *,
    limit: int = MAX_MEMORY_CANDIDATES,
) -> list[MemoryCandidate]:
    """Return bounded, shared photo-backed Memories eligible for #863.

    Eligibility intentionally stays narrow for the first playable grammar:
    - the Memory must already be readable through the authoritative visibility
      predicate for the active Space;
    - one bound attachment must be a READY image in that same Space;
    - the stored Memory title must be non-blank.

    Only the first eligible image in gallery order is returned for each Memory.
    Attachment bytes remain protected by the existing attachment read path; the
    candidate response exposes only the existing attachment identifier.
    """
    if limit <= 0:
        return []

    statement = (
        readable(Memory, context)
        .add_columns(
            Attachment.id.label("attachment_id"),
            MemoryAttachment.position.label("attachment_position"),
        )
        .join(MemoryAttachment, MemoryAttachment.memory_id == Memory.id)
        .join(Attachment, Attachment.id == MemoryAttachment.attachment_id)
        .where(
            Attachment.space_id == context.space_id,
            Attachment.status == AttachmentStatus.READY.value,
            Attachment.media_type == MediaType.IMAGE.value,
        )
        .order_by(
            Memory.created_at.desc(),
            Memory.id.desc(),
            MemoryAttachment.position.asc(),
            Attachment.id.asc(),
        )
    )

    candidates: list[MemoryCandidate] = []
    seen_memories: set[UUID] = set()
    rows = session.execute(statement).yield_per(100)
    for memory, attachment_id, _attachment_position in rows:
        if memory.id in seen_memories:
            continue
        seen_memories.add(memory.id)

        title = memory.payload.title.strip()
        if not title:
            continue

        created_at = memory.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        effective_date = memory.happened_on or created_at.astimezone(UTC).date()
        candidates.append(
            MemoryCandidate(
                memory_id=memory.id,
                title=title,
                effective_date=effective_date,
                image_attachment_id=attachment_id,
            )
        )
        if len(candidates) >= limit:
            break

    return candidates


@dataclass(frozen=True)
class WishCandidate:
    wish_id: UUID
    created_by: UUID
    title: str


def read_wish_candidates(
    session: Session,
    context: AuthorizationContext,
    *,
    limit: int = MAX_WISH_CANDIDATES,
) -> list[WishCandidate]:
    """Return a bounded, partner-balanced OPEN Wish pool for #864.

    Normal Wish authorization remains authoritative through ``readable()``.
    ``owner_id`` is the existing stable ``createdBy`` attribution used to bind
    each round to its giver. GiftIdea is a separate OWNER_ONLY domain and is
    structurally outside this query.

    The bounded response budget is split deterministically across the active
    Space partners. This prevents a large set of newer Wishes from one partner
    from pushing the other partner's older eligible Wishes out of the bounded
    candidate response and creating a false sparse game state.
    """
    if limit <= 0:
        return []

    participant_ids = tuple(
        session.scalars(
            select(Membership.account_id)
            .where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.account_id.asc())
        ).all()
    )
    if not participant_ids:
        return []

    base_limit, remainder = divmod(limit, len(participant_ids))
    candidates: list[WishCandidate] = []

    for index, participant_id in enumerate(participant_ids):
        participant_limit = base_limit + (1 if index < remainder else 0)
        if participant_limit <= 0:
            continue

        statement = (
            readable(Wish, context)
            .where(
                Wish.status == WishStatus.OPEN.value,
                Wish.owner_id == participant_id,
            )
            .order_by(Wish.created_at.desc(), Wish.id.desc())
        )
        added_for_participant = 0
        for wish in session.execute(statement).scalars().yield_per(100):
            title = wish.payload.title.strip()
            if not title:
                continue
            candidates.append(
                WishCandidate(
                    wish_id=wish.id,
                    created_by=wish.owner_id,
                    title=title,
                )
            )
            added_for_participant += 1
            if added_for_participant >= participant_limit:
                break

    return candidates
