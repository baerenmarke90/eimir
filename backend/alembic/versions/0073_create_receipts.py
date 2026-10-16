"""Add shared request-identity receipts for idempotent create endpoints.

Generalizes ``memory_create_receipts`` (0058) for Comment, Wish, Plan,
Milestone, and HeartMoment creation.

Revision ID: 0073
Revises: 0072
Create Date: 2026-09-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0073"
down_revision = "0072"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

_RESOURCE_TYPES = ("COMMENT", "WISH", "PLAN", "MILESTONE", "HEART_MOMENT")


def upgrade() -> None:
    op.create_table(
        "create_receipts",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", UUID, nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("resource_id", UUID, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_create_receipts"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_create_receipts_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_create_receipts_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "space_id",
            "account_id",
            "resource_type",
            "idempotency_key",
            name="uq_create_receipts_identity",
        ),
        sa.CheckConstraint(
            "resource_type IN (" + ", ".join(f"'{value}'" for value in _RESOURCE_TYPES) + ")",
            name="create_receipt_resource_type_allowed",
        ),
        sa.CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name="create_receipt_fingerprint_is_sha256_hex",
        ),
    )
    op.create_index(
        "ix_create_receipts_created_at",
        "create_receipts",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_create_receipts_created_at", table_name="create_receipts")
    op.drop_table("create_receipts")
