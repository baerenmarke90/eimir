"""Account deletion lifecycle state.

Revision ID: 0041
Revises: 0040
Create Date: 2026-09-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "account_deletions",
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_code", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'COMPLETED', 'FAILED')",
            name="status_is_known",
        ),
        sa.CheckConstraint(
            "(status = 'PENDING' AND completed_at IS NULL AND failed_at IS NULL "
            "AND last_failure_code IS NULL) OR "
            "(status = 'COMPLETED' AND completed_at IS NOT NULL AND failed_at IS NULL "
            "AND last_failure_code IS NULL) OR "
            "(status = 'FAILED' AND completed_at IS NULL AND failed_at IS NOT NULL "
            "AND last_failure_code IS NOT NULL)",
            name="status_matches_timestamps",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_account_deletions_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("account_id", name="pk_account_deletions"),
    )
    op.create_index(
        "ix_account_deletions_status_updated_at",
        "account_deletions",
        ["status", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_account_deletions_status_updated_at", table_name="account_deletions")
    op.drop_table("account_deletions")
