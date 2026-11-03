"""One shared projection over separately owned experience responses.

The root is an opaque resource reference, never a hash of protected content.
Legacy responses are reconciled through the normal decrypting ORM boundary,
inside their authorized Space. No payload, attachment or authorship is moved.
Only equal prompted questions on the same effective day can form a pair;
free-form entries and repeated contributions by one author remain distinct.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import ColumnElement, false, or_, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from eimir.authorization import AuthorizationContext, readable
from eimir.comments.models import Comment, CommentTarget
from eimir.core import clock
from eimir.core.errors import NotFoundError
from eimir.db.locks import lock_subject
from eimir.memories.models import Memory


def roots_only() -> ColumnElement[bool]:
    return or_(Memory.experience_root_id.is_(None), Memory.experience_root_id == Memory.id)


def reconcile(session: Session, context: AuthorizationContext) -> None:
    """Lazily upgrade legacy metadata once, with no encryption migration key."""
    pending_query = readable(Memory, context).where(
        Memory.experience_kind.is_not(None), Memory.experience_root_id.is_(None)
    )
    if session.scalar(pending_query.with_only_columns(Memory.id).limit(1)) is None:
        return
    lock_subject(session, "experience-threads", str(context.space_id))
    pending = list(session.scalars(pending_query.order_by(Memory.created_at, Memory.id)))
    if not pending:
        return
    days = {entry.happened_on for entry in pending}
    candidates = list(
        session.scalars(
            readable(Memory, context)
            .where(
                Memory.experience_kind.is_not(None),
                or_(
                    Memory.happened_on.in_([day for day in days if day is not None]),
                    Memory.happened_on.is_(None) if None in days else false(),
                ),
            )
            .order_by(Memory.created_at, Memory.id)
        )
    )
    groups: dict[tuple[str, date, str], list[list[Memory]]] = {}
    for entry in candidates:
        question = entry.payload.title.strip()
        day = entry.happened_on or clock.ensure_utc(entry.created_at).date()
        key = (entry.experience_kind or "", day, question)
        paired = groups.setdefault(key, [])
        if entry.experience_root_id is not None:
            group = next(
                (
                    group
                    for group in paired
                    if group[0].experience_root_id == entry.experience_root_id
                ),
                None,
            )
            if group is None:
                paired.append([entry])
            else:
                group.append(entry)
            continue
        group = (
            next(
                (
                    group
                    for group in paired
                    if len(group) < 2 and all(member.owner_id != entry.owner_id for member in group)
                ),
                None,
            )
            if question.endswith(("?", "\uff1f"))
            else None
        )
        entry.experience_root_id = group[0].experience_root_id if group else entry.id
        flag_modified(entry, "updated_at")
        if group is None:
            paired.append([entry])
        else:
            group.append(entry)
        if entry.experience_root_id != entry.id:
            session.execute(
                update(Comment)
                .where(
                    Comment.space_id == context.space_id,
                    Comment.target_type == CommentTarget.MEMORY.value,
                    Comment.target_id == entry.id,
                )
                .values(target_id=entry.experience_root_id, updated_at=Comment.updated_at)
            )
    session.flush()


def responses(
    session: Session, context: AuthorizationContext, memories: list[Memory]
) -> dict[UUID, list[Memory]]:
    roots = {entry.experience_root_id or entry.id for entry in memories if entry.experience_kind}
    if not roots:
        return {}
    entries = session.scalars(
        readable(Memory, context)
        .where(Memory.experience_kind.is_not(None), Memory.experience_root_id.in_(roots))
        .order_by(Memory.created_at, Memory.id)
    )
    result: dict[UUID, list[Memory]] = {}
    for entry in entries:
        result.setdefault(entry.experience_root_id or entry.id, []).append(entry)
    return result


def require_author(memory: Memory, context: AuthorizationContext) -> None:
    if memory.experience_kind is not None and memory.owner_id != context.account_id:
        raise NotFoundError("Memory not found.", "RESOURCE_NOT_FOUND")


def before_delete(session: Session, context: AuthorizationContext, memory: Memory) -> None:
    """Deleting one's response must retain the partner's response/discussion."""
    if memory.experience_kind is None:
        return
    remaining = [
        entry
        for entry in responses(session, context, [memory]).get(
            memory.experience_root_id or memory.id, []
        )
        if entry.id != memory.id
    ]
    if memory.experience_root_id == memory.id and remaining:
        replacement = remaining[0].id
        for entry in remaining:
            entry.experience_root_id = replacement
            flag_modified(entry, "updated_at")
        session.execute(
            update(Comment)
            .where(
                Comment.space_id == context.space_id,
                Comment.target_type == CommentTarget.MEMORY.value,
                Comment.target_id == memory.id,
            )
            .values(target_id=replacement, updated_at=Comment.updated_at)
        )
        session.flush()
