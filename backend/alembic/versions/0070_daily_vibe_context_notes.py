"""Create encrypted optional Daily Vibe context notes.

Revision ID: 0070
Revises: 0069
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "daily_check_in_vibe_notes",
        sa.Column("id", UUID, nullable=False),
        sa.Column("daily_check_in_id", UUID, nullable=False),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name="crypto_version_is_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["daily_check_in_id"],
            ["daily_check_ins.id"],
            name="fk_daily_check_in_vibe_notes_daily_check_in_id_daily_check_ins",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_daily_check_in_vibe_notes"),
    )
    op.create_index(
        op.f("ix_daily_check_in_vibe_notes_daily_check_in_id"),
        "daily_check_in_vibe_notes",
        ["daily_check_in_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_daily_check_in_vibe_notes_daily_check_in_id"),
        table_name="daily_check_in_vibe_notes",
    )
    op.drop_table("daily_check_in_vibe_notes")
