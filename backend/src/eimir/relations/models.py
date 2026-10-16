"""Persistence for typed M3 content relations.

A relation has no owner and no privacy class of its own. It is not content,
but a statement about two content objects, and its visibility is derived from
both sides. Therefore none of these tables carries `PrivateResourceMixin`: a
third source of truth beside parent and target would be exactly where the
three could diverge.

Every row carries one `space_id`, shared by parent and target composite foreign
keys. Cross-space relations are therefore impossible to express (M3-D08).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, privacy_class_type
from eimir.db.base import Base


class _RelationAuditColumns:
    """Audit columns shared by every relation join table."""

    space_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    """When the relation was created.

    There is no `updated_at`: a relation either exists or does not. There is
    nothing to update and therefore no version. A second `PUT` for the same
    relation is the same final state (M3-D26).
    """


class _PlaceRelationColumns(_RelationAuditColumns):
    place_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)


class _ChapterRelationColumns(_RelationAuditColumns):
    chapter_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)


class PlaceMemory(_PlaceRelationColumns, Base):
    """A memory that took place at a location."""

    __tablename__ = "place_memories"

    memory_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_place_memories_place_id_places",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["memory_id", "space_id"],
            ["memories.id", "memories.space_id"],
            name="fk_place_memories_memory_id_memories",
            ondelete="CASCADE",
        ),
        Index("ix_place_memories_memory_id", "memory_id"),
        Index("ix_place_memories_space_id", "space_id"),
        Index("ix_place_memories_place_id_created_at", "place_id", "created_at", "memory_id"),
    )


class PlaceMilestone(_PlaceRelationColumns, Base):
    """A milestone that took place at a location."""

    __tablename__ = "place_milestones"

    milestone_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_place_milestones_place_id_places",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["milestone_id", "space_id"],
            ["milestones.id", "milestones.space_id"],
            name="fk_place_milestones_milestone_id_milestones",
            ondelete="CASCADE",
        ),
        Index("ix_place_milestones_milestone_id", "milestone_id"),
        Index("ix_place_milestones_space_id", "space_id"),
        Index(
            "ix_place_milestones_place_id_created_at",
            "place_id",
            "created_at",
            "milestone_id",
        ),
    )


class PlaceHeartMoment(_PlaceRelationColumns, Base):
    """A shared HeartMoment that took place at a location."""

    __tablename__ = "place_heart_moments"

    heart_moment_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    target_privacy_class: Mapped[str] = mapped_column(
        privacy_class_type(),
        nullable=False,
        default=PrivacyClass.SPACE_SHARED.value,
    )

    __table_args__ = (
        CheckConstraint(
            "target_privacy_class = 'SPACE_SHARED'",
            name="relation_target_is_shared",
        ),
        ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_place_heart_moments_place_id_places",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["heart_moment_id", "space_id", "target_privacy_class"],
            ["heart_moments.id", "heart_moments.space_id", "heart_moments.privacy_class"],
            name="fk_place_heart_moments_heart_moment_id_heart_moments",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        Index("ix_place_heart_moments_heart_moment_id", "heart_moment_id"),
        Index("ix_place_heart_moments_space_id", "space_id"),
        Index(
            "ix_place_heart_moments_place_id_created_at",
            "place_id",
            "created_at",
            "heart_moment_id",
        ),
    )


class ChapterMemory(_ChapterRelationColumns, Base):
    """A Memory referenced by a Chapter."""

    __tablename__ = "chapter_memories"

    memory_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["chapter_id", "space_id"],
            ["chapters.id", "chapters.space_id"],
            name="fk_chapter_memories_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["memory_id", "space_id"],
            ["memories.id", "memories.space_id"],
            name="fk_chapter_memories_memory_id_memories",
            ondelete="CASCADE",
        ),
        Index("ix_chapter_memories_memory_id", "memory_id"),
        Index("ix_chapter_memories_space_id", "space_id"),
        Index(
            "ix_chapter_memories_chapter_id_created_at",
            "chapter_id",
            "created_at",
            "memory_id",
        ),
    )


class ChapterMilestone(_ChapterRelationColumns, Base):
    """A Milestone referenced by a Chapter."""

    __tablename__ = "chapter_milestones"

    milestone_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["chapter_id", "space_id"],
            ["chapters.id", "chapters.space_id"],
            name="fk_chapter_milestones_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["milestone_id", "space_id"],
            ["milestones.id", "milestones.space_id"],
            name="fk_chapter_milestones_milestone_id_milestones",
            ondelete="CASCADE",
        ),
        Index("ix_chapter_milestones_milestone_id", "milestone_id"),
        Index("ix_chapter_milestones_space_id", "space_id"),
        Index(
            "ix_chapter_milestones_chapter_id_created_at",
            "chapter_id",
            "created_at",
            "milestone_id",
        ),
    )


class ChapterHeartMoment(_ChapterRelationColumns, Base):
    """A shared HeartMoment referenced by a Chapter.

    The privacy class participates in the target foreign key and is pinned to
    `SPACE_SHARED`. This mirrors the Place relation safety rail: a missed
    cleanup on SHARED -> PRIVATE fails closed at the database boundary.
    """

    __tablename__ = "chapter_heart_moments"

    heart_moment_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    target_privacy_class: Mapped[str] = mapped_column(
        privacy_class_type(),
        nullable=False,
        default=PrivacyClass.SPACE_SHARED.value,
    )

    __table_args__ = (
        CheckConstraint(
            "target_privacy_class = 'SPACE_SHARED'",
            name="relation_target_is_shared",
        ),
        ForeignKeyConstraint(
            ["chapter_id", "space_id"],
            ["chapters.id", "chapters.space_id"],
            name="fk_chapter_heart_moments_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["heart_moment_id", "space_id", "target_privacy_class"],
            ["heart_moments.id", "heart_moments.space_id", "heart_moments.privacy_class"],
            name="fk_chapter_heart_moments_heart_moment_id_heart_moments",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        Index("ix_chapter_heart_moments_heart_moment_id", "heart_moment_id"),
        Index("ix_chapter_heart_moments_space_id", "space_id"),
        Index(
            "ix_chapter_heart_moments_chapter_id_created_at",
            "chapter_id",
            "created_at",
            "heart_moment_id",
        ),
    )
