"""Add personal Dashboard presentation preferences.

Revision ID: 0050
Revises: 0049
Create Date: 2026-09-09

#848 establishes the shared Account+Space+module persistence seam with an
upcoming item-limit override. The visible column is deliberately nullable and
inert until #817 extends the same capability; this revision exposes no
visibility API or product behavior.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "dashboard_module_preferences",
        sa.Column("id", UUID, nullable=False),
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
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("module_key", sa.String(length=64), nullable=False),
        sa.Column("item_limit", sa.Integer(), nullable=True),
        sa.Column("visible", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_dashboard_module_preferences"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_dashboard_module_preferences_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_dashboard_module_preferences_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "account_id",
            "space_id",
            "module_key",
            name="uq_dashboard_module_preferences_account_space_module",
        ),
    )
    op.create_index(
        "ix_dashboard_module_preferences_space_account",
        "dashboard_module_preferences",
        ["space_id", "account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dashboard_module_preferences_space_account",
        table_name="dashboard_module_preferences",
    )
    op.drop_table("dashboard_module_preferences")
