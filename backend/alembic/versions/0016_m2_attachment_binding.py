"""M2 attachment binding.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "memory_attachments",
        sa.Column("id", UUID, nullable=False),
        sa.Column("memory_id", UUID, nullable=False),
        sa.Column("attachment_id", UUID, nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_memory_attachments"),
        sa.ForeignKeyConstraint(
            ["memory_id"],
            ["memories.id"],
            name="fk_memory_attachments_memory_id_memories",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["attachment_id"],
            ["attachments.id"],
            name="fk_memory_attachments_attachment_id_attachments",
            ondelete="CASCADE",
        ),
        # Exclusive binding, as far as a single table can enforce it.
        sa.UniqueConstraint("attachment_id", name="uq_memory_attachments_attachment"),
        sa.UniqueConstraint("memory_id", "position", name="uq_memory_attachments_position"),
    )
    op.create_index("ix_memory_attachments_memory_id", "memory_attachments", ["memory_id"])

    op.add_column("heart_moments", sa.Column("attachment_id", UUID, nullable=True))
    op.create_unique_constraint("uq_heart_moments_attachment", "heart_moments", ["attachment_id"])
    # RESTRICT rather than CASCADE: an attachment is never hard-deleted while
    # it is bound. The deletion path is DELETING plus cleanup. CASCADE would
    # silently reverse that ordering.
    op.create_foreign_key(
        "fk_heart_moments_attachment_id_attachments",
        "heart_moments",
        "attachments",
        ["attachment_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_heart_moments_attachment_id_attachments"), "heart_moments", type_="foreignkey"
    )
    op.drop_constraint(op.f("uq_heart_moments_attachment"), "heart_moments", type_="unique")
    op.drop_column("heart_moments", "attachment_id")
    op.drop_index("ix_memory_attachments_memory_id", table_name="memory_attachments")
    op.drop_table("memory_attachments")
