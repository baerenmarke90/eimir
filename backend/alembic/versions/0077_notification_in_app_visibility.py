"""Snapshot in-app visibility independently of the internal push source.

Revision ID: 0077
Revises: 0076
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0077"
down_revision = "0076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing notifications and their read state stay visible on upgrade.
    op.add_column(
        "notifications",
        sa.Column("in_app_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("notifications", "in_app_visible")
