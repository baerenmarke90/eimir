"""Encrypted Account-owned photo sources and expiring selection tasks.

Revision ID: 0087
Revises: 0086
Create Date: 2026-10-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0087"
down_revision = "0086"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "photo_source_connections",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "account_id", uuid, sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("account_id", "provider"),
    )
    op.create_table(
        "photo_source_selections",
        sa.Column("id", uuid, primary_key=True),
        sa.Column(
            "account_id", uuid, sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("space_id", uuid, sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "device_session_id",
            uuid,
            sa.ForeignKey("device_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connection_id", uuid, sa.ForeignKey("photo_source_connections.id", ondelete="CASCADE")
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("state_hash", sa.String(64), unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_index(
        "ix_photo_source_selections_account_id", "photo_source_selections", ["account_id"]
    )
    op.create_index(
        "ix_photo_source_selections_expires_at", "photo_source_selections", ["expires_at"]
    )


def downgrade() -> None:
    op.drop_table("photo_source_selections")
    op.drop_table("photo_source_connections")
