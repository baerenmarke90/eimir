"""Create the shared current-day Daily Check-in foundation.

Revision ID: 0065
Revises: 0064
Create Date: 2026-09-21

Vibe and Energy intentionally share one row. The Vibe value catalog is not yet
a frozen product decision, so the column is reserved but constrained to NULL
until #429 supplies the typed enum in its own migration.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0065"
down_revision = "0064"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "daily_check_ins",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("checked_on", sa.Date(), nullable=False),
        sa.Column("vibe", sa.String(length=32), nullable=True),
        sa.Column("energy_level", sa.Integer(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_daily_check_ins"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_daily_check_ins_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_daily_check_ins_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "space_id",
            "account_id",
            "checked_on",
            name="uq_daily_check_ins_space_account_day",
        ),
        sa.CheckConstraint(
            "vibe IS NOT NULL OR energy_level IS NOT NULL",
            name="has_dimension",
        ),
        sa.CheckConstraint("vibe IS NULL", name="vibe_contract_pending"),
        sa.CheckConstraint(
            "energy_level IS NULL OR "
            "(energy_level >= 10 AND energy_level <= 100 AND energy_level % 10 = 0)",
            name="energy_level_is_step",
        ),
    )
    op.create_index(
        "ix_daily_check_ins_space_day",
        "daily_check_ins",
        ["space_id", "checked_on"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_daily_check_ins_space_day", table_name="daily_check_ins")
    op.drop_table("daily_check_ins")
