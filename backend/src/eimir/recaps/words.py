"""The couple's own words around a recap source: one quoted comment, one mutual reaction.

Both are read live with the source and reauthorized on every read, never stored in
an edition, so editing or deleting a comment or reaction is reflected at once. Nothing
here is generated or rewritten.
"""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.binding import attachments_of_memories, cover_of
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.comments.models import Comment
from eimir.identity.models import Account
from eimir.memories.models import Memory, MemoryPayload
from eimir.recaps.models import RecapSourceKind
from eimir.relationship.models import Membership, MembershipStatus

QUOTE_LIMIT = 140
# Reactions shown as a line; sad or merely "like" reactions are never highlighted.
POSITIVE_REACTIONS = frozenset({"LOVE", "LAUGH", "CELEBRATE"})
# The line should stay rare so it keeps its meaning.
REACTION_LINES_PER_EDITION = 3


def cut(text: str, limit: int = QUOTE_LIMIT) -> str:
    """Whitespace-normalised text cut at a word boundary; never reworded."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    head = text[:limit]
    boundary = head.rfind(" ")
    head = head[:boundary] if boundary > limit // 2 else head
    return re.sub(r"[\s,;:.\-\u2013\u2014]+$", "", head) + "…"


def quote(
    session: Session,
    context: AuthorizationContext,
    kind: RecapSourceKind,
    source_id: UUID,
    author_id: UUID,
) -> dict[str, Any] | None:
    """The newest comment written by a member other than the entry's author."""
    comment = session.scalar(
        readable(Comment, context)
        .where(
            Comment.target_type == kind.value,
            Comment.target_id == source_id,
            Comment.privacy_class == PrivacyClass.SPACE_SHARED.value,
            Comment.crypto_version.in_((0, 2)),
            Comment.owner_id != author_id,
        )
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(1)
    )
    text = cut(comment.payload.body) if comment is not None else ""
    if comment is None or not text:
        return None
    name = session.scalar(select(Account.display_name).where(Account.id == comment.owner_id))
    return {"text": text, "author_id": comment.owner_id, "author_name": name or ""}


def partners(session: Session, space_id: UUID) -> frozenset[UUID] | None:
    """Both active members, or None while the Space does not have exactly two."""
    members = frozenset(
        session.scalars(
            select(Membership.account_id).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    )
    return members if len(members) == 2 else None


def mutual_reaction(
    members: frozenset[UUID] | None, payload: MemoryPayload, cover_id: UUID | None
) -> str | None:
    """The reaction both members gave the cover photo, only when it is the same positive one."""
    if members is None or cover_id is None:
        return None
    given = {
        reaction.account_id: str(reaction.reaction)
        for reaction in payload.photo_reactions
        if reaction.attachment_id == cover_id and reaction.account_id in members
    }
    kinds = set(given.values())
    if len(given) == 2 and len(kinds) == 1 and (kind := kinds.pop()) in POSITIVE_REACTIONS:
        return kind
    return None


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
