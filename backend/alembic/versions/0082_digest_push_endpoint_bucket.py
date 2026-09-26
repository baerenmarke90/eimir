"""Index bounded PushDelivery digest buckets per endpoint.

Revision ID: 0082
Revises: 0081
Create Date: 2026-09-24
"""

from __future__ import annotations

from alembic import op

revision = "0082"
down_revision = "0081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_push_deliveries_endpoint_created",
        "push_deliveries",
        ["push_endpoint_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_push_deliveries_endpoint_created", table_name="push_deliveries")
