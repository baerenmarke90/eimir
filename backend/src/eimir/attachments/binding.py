"""Binding between attachments and domain resources.

M2-D03 requires exclusive ownership: an attachment belongs to at most one
parent. That rule intentionally lives in exactly one place here rather than in
every domain that uses attachments.

There is no denormalized parent column on the attachment. Such a column would
be a second source of truth beside relations and could drift from them; the
question "is this bound?" is answered from the relations themselves.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, UniqueConstraint, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, Session, mapped_column

from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.attachments.service import binding_window_expired
from eimir.core.errors import ConflictError, ErrorCode
from eimir.db.base import Base
from eimir.db.mixins import IdMixin

MAX_MEMORY_ATTACHMENTS = 20
MAX_MEMORY_TOTAL_SIZE = 500 * 1024 * 1024
"""M2-D04 cardinality and aggregate size limits for one memory."""


class MemoryAttachment(IdMixin, Base):
    """An attachment at a specific position within a memory.

    ``position`` is zero-based and unique within each memory. The database
    enforces both properties so ordering does not depend on service code
    counting correctly.
    """

    __tablename__ = "memory_attachments"

    memory_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("memories.id", ondelete="CASCADE"),
        nullable=False,
    )
    attachment_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        # Exclusive binding to the extent one table can enforce it: the same
        # attachment cannot appear twice or in two memories.
        UniqueConstraint("attachment_id", name="uq_memory_attachments_attachment"),
        UniqueConstraint("memory_id", "position", name="uq_memory_attachments_position"),
        Index("ix_memory_attachments_memory_id", "memory_id"),
    )


class AccountProfileAttachment(IdMixin, Base):
    """The single current avatar attachment for one account.

    This is an attachment-parent relation, not a second profile or media model.
    Keeping it beside the other attachment bindings lets the same exclusivity,
    cleanup, validation, and storage lifecycle apply to avatars.
    """

    __tablename__ = "account_profile_attachments"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    attachment_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="CASCADE"),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("account_id", name="uq_account_profile_attachments_account"),
        UniqueConstraint("attachment_id", name="uq_account_profile_attachments_attachment"),
    )


@dataclass(frozen=True)
class BoundAttachment:
    attachment: Attachment
    position: int


def _conflict(message: str, code: str) -> ConflictError:
    return ConflictError(message, code)


def lock_for_binding(session: Session, attachment_ids: list[UUID]) -> dict[UUID, Attachment]:
    """Lock candidate attachments before reading their state.

    Without the lock, cleanup could remove the attachment between validation
    and binding, leaving a relation that points at deleted storage. The lock
    serializes both paths so either binding or cleanup wins completely.
    """
    if not attachment_ids:
        return {}
    rows = session.execute(
        select(Attachment).where(Attachment.id.in_(attachment_ids)).with_for_update()
    ).scalars()
    return {row.id: row for row in rows}


def ensure_bindable(
    attachment: Attachment | None,
    *,
    space_id: UUID,
    account_id: UUID,
) -> Attachment:
    """Validate whether this attachment may be bound now.

    All rejection conditions except parent cardinality are centralized here so
    domains cannot implement differing subsets of the binding rules.
    """
    if attachment is None or attachment.space_id != space_id:
        # Cross-space and unknown attachments are indistinguishable because
        # existence in another space is itself sensitive information.
        raise Attachment.privacy_absence.error()
    if attachment.owner_id != account_id:
        raise Attachment.privacy_absence.error()
    if attachment.status != AttachmentStatus.READY.value:
        raise _conflict("The attachment is not ready.", ErrorCode.ATTACHMENT_NOT_READY)
    if binding_window_expired(attachment):
        raise _conflict("The attachment is not ready.", ErrorCode.ATTACHMENT_NOT_READY)
    return attachment


def parent_of(session: Session, attachment_id: UUID) -> tuple[str, UUID] | None:
    """Return the resource this attachment belongs to, or none.

    Relations are queried directly rather than mirrored into an attachment
    column. A second source of truth could drift and then incorrectly determine
    visibility.
    """
    from eimir.heart_moments.models import HeartMoment
    from eimir.people.models import RelatedPerson

    memory_id = session.execute(
        select(MemoryAttachment.memory_id).where(MemoryAttachment.attachment_id == attachment_id)
    ).scalar_one_or_none()
    if memory_id is not None:
        return "MEMORY", memory_id

    heart_moment_id = session.execute(
        select(HeartMoment.id).where(HeartMoment.attachment_id == attachment_id)
    ).scalar_one_or_none()
    if heart_moment_id is not None:
        return "HEART_MOMENT", heart_moment_id

    related_person_id = session.execute(
        select(RelatedPerson.id).where(RelatedPerson.avatar_attachment_id == attachment_id)
    ).scalar_one_or_none()
    if related_person_id is not None:
        return "RELATED_PERSON", related_person_id

    account_id = session.execute(
        select(AccountProfileAttachment.account_id).where(
            AccountProfileAttachment.attachment_id == attachment_id
        )
    ).scalar_one_or_none()
    if account_id is not None:
        return "ACCOUNT_PROFILE", account_id
    return None


def ensure_unlinked(
    session: Session, attachment_id: UUID, *, allow: tuple[str, UUID] | None = None
) -> None:
    """Enforce exclusivity across all parent types (M2-D03).

    Per-table unique constraints ensure an attachment does not appear twice in
    the same relation type. No individual table can ensure it is not bound to a
    memory, heart moment, and account profile simultaneously, so this cross-table
    check runs under the lock acquired by ``lock_for_binding``.

    ``allow`` names a binding that may remain in place. When replacing a
    resource's attachment set, an attachment already bound to that same resource
    is therefore not treated as a conflict.
    """
    existing = parent_of(session, attachment_id)
    if existing is None or existing == allow:
        return
    raise _conflict(
        "The attachment already belongs to another resource.",
        ErrorCode.ATTACHMENT_ALREADY_LINKED,
    )


def ensure_within_limits(attachments: list[Attachment]) -> None:
    if len(attachments) > MAX_MEMORY_ATTACHMENTS:
        raise _conflict(
            "The parent exceeds its attachment limit.",
            ErrorCode.ATTACHMENT_LIMIT_EXCEEDED,
        )
    total = sum(attachment.size or 0 for attachment in attachments)
    if total > MAX_MEMORY_TOTAL_SIZE:
        raise _conflict(
            "The parent exceeds its attachment limit.",
            ErrorCode.ATTACHMENT_LIMIT_EXCEEDED,
        )


def attachments_of_memories(
    session: Session, memory_ids: list[UUID]
) -> dict[UUID, list[BoundAttachment]]:
    """Load galleries for multiple memories in one query.

    Story pages may include up to one hundred items. Loading each gallery
    separately would create one hundred list queries, so the same ordering rule
    is applied once in batch rather than reimplemented in the story service.
    """
    if not memory_ids:
        return {}
    rows = session.execute(
        select(MemoryAttachment, Attachment)
        .join(Attachment, Attachment.id == MemoryAttachment.attachment_id)
        .where(MemoryAttachment.memory_id.in_(memory_ids))
        .order_by(MemoryAttachment.position, MemoryAttachment.attachment_id)
    ).all()
    galleries: dict[UUID, list[BoundAttachment]] = {memory_id: [] for memory_id in memory_ids}
    for binding, attachment in rows:
        galleries[binding.memory_id].append(
            BoundAttachment(attachment=attachment, position=binding.position)
        )
    return galleries


def attachments_of_memory(session: Session, memory_id: UUID) -> list[BoundAttachment]:
    """Return one memory gallery in stable order.

    Rows are ordered by ``position`` and then attachment ID. The tie-breaker
    keeps the result deterministic even if duplicate positions somehow exist.
    """
    rows = session.execute(
        select(MemoryAttachment, Attachment)
        .join(Attachment, Attachment.id == MemoryAttachment.attachment_id)
        .where(MemoryAttachment.memory_id == memory_id)
        .order_by(MemoryAttachment.position, MemoryAttachment.attachment_id)
    ).all()
    return [BoundAttachment(attachment=row[1], position=row[0].position) for row in rows]
