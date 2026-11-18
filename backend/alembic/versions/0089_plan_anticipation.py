"""Explicit special-event presentation on existing shared Plans.

Revision ID: 0089
Revises: 0088
Create Date: 2026-10-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0089"
down_revision = "0088"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "anticipation_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    op.create_index(
        "ix_plans_space_id_anticipation", "plans", ["space_id", "anticipation_enabled", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_plans_space_id_anticipation", table_name="plans")
    op.drop_column("plans", "anticipation_enabled")
