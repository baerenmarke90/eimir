"""Account photo-location consent and protected transient ingest metadata.

Revision ID: 0088
Revises: 0087
Create Date: 2026-10-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0088"
down_revision = "0087"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "photo_locations_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "accounts",
        sa.Column(
            "photo_locations_version", sa.BigInteger(), nullable=False, server_default=sa.text("0")
        ),
    )
    for table in ("place_memories", "place_heart_moments"):
        op.add_column(
            table,
            sa.Column(
                "photo_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")
            ),
        )
    op.create_table(
        "photo_location_drafts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("preference_version", sa.BigInteger(), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_photo_location_drafts_owner_id", "photo_location_drafts", ["owner_id"])


def downgrade() -> None:
    op.drop_table("photo_location_drafts")
    for table in ("place_memories", "place_heart_moments"):
        op.drop_column(table, "photo_generated")
    op.drop_column("accounts", "photo_locations_version")
    op.drop_column("accounts", "photo_locations_enabled")
