"""Add bounded request-identity receipts for Memory create reconciliation.

Revision ID: 0058
Revises: 0057
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "memory_create_receipts",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("idempotency_key", UUID, nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("memory_id", UUID, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_memory_create_receipts"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_memory_create_receipts_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_memory_create_receipts_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["memory_id"],
            ["memories.id"],
            name="fk_memory_create_receipts_memory_id_memories",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "space_id",
            "account_id",
            "idempotency_key",
            name="uq_memory_create_receipts_identity",
        ),
        sa.CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name="request_fingerprint_is_sha256_hex",
        ),
    )
    op.create_index(
        "ix_memory_create_receipts_created_at",
        "memory_create_receipts",
        ["created_at"],
    )
    op.create_index(
        "ix_memory_create_receipts_memory_id",
        "memory_create_receipts",
        ["memory_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_memory_create_receipts_memory_id", table_name="memory_create_receipts")
    op.drop_index("ix_memory_create_receipts_created_at", table_name="memory_create_receipts")
    op.drop_table("memory_create_receipts")
