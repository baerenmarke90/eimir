"""Track the release boundary of deferred Push deliveries.

Revision ID: 0080
Revises: 0079
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0080"
down_revision = "0079"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "push_deliveries", sa.Column("deferred_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "ix_push_deliveries_endpoint_deferred",
        "push_deliveries",
        ["push_endpoint_id", "deferred_until"],
        postgresql_where=sa.text("deferred_until IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_push_deliveries_endpoint_deferred", table_name="push_deliveries")
    op.drop_column("push_deliveries", "deferred_until")
