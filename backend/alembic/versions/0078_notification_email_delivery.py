"""Persist content-free notification email attempts.

Revision ID: 0078
Revises: 0077
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0078"
down_revision = "0077"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notification_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_email_deliveries"),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name="fk_email_deliveries_notification_id_notifications",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'CLAIMED', 'SENT', 'UNAVAILABLE', 'FAILED')",
            name="email_delivery_status_allowed",
        ),
        sa.UniqueConstraint("notification_id", name="uq_email_deliveries_notification"),
    )
    op.create_index(
        "ix_email_deliveries_status_created", "email_deliveries", ["status", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_email_deliveries_status_created", table_name="email_deliveries")
    op.drop_table("email_deliveries")
