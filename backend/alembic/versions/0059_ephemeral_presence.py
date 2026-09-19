"""Add one ephemeral presence row per Account and Space.

Revision ID: 0059
Revises: 0058
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "space_presence",
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_space_presence_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_space_presence_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("space_id", "account_id", name="pk_space_presence"),
    )


def downgrade() -> None:
    op.drop_table("space_presence")
