"""M5 Transfer Bundle export/import runtime.

Revision ID: 0033
Revises: 0032
Create Date: 2026-08-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "transfer_exports",
        sa.Column("id", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("job_id", UUID),
        sa.Column("artifact_size", sa.BigInteger()),
        sa.Column("error_code", sa.String(length=64)),
        sa.Column("ready_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("scope IN ('SHARED', 'PERSONAL')", name="scope_is_known"),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED')",
            name="status_is_known",
        ),
        sa.CheckConstraint(
            "artifact_size IS NULL OR artifact_size >= 0",
            name="size_is_non_negative",
        ),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transfer_exports_creator",
        "transfer_exports",
        ["space_id", "created_by", "created_at"],
    )
    op.create_index(
        "ix_transfer_exports_expiry",
        "transfer_exports",
        ["status", "expires_at"],
    )

    op.create_table(
        "transfer_imports",
        sa.Column("id", UUID, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("scope", sa.String(length=16)),
        sa.Column("source_space_id", UUID),
        sa.Column("source_owner_id", UUID),
        sa.Column("member_mapping", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("validation_job_id", UUID),
        sa.Column("apply_job_id", UUID),
        sa.Column("artifact_size", sa.BigInteger(), nullable=False),
        sa.Column("error_code", sa.String(length=64)),
        sa.Column("validated_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "scope IS NULL OR scope IN ('SHARED', 'PERSONAL')",
            name="scope_is_known",
        ),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'VALIDATING', 'READY_TO_APPLY', 'APPLYING', "
            "'COMPLETED', 'FAILED', 'EXPIRED')",
            name="status_is_known",
        ),
        sa.CheckConstraint("artifact_size >= 0", name="size_is_non_negative"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_transfer_imports_creator",
        "transfer_imports",
        ["space_id", "created_by", "created_at"],
    )
    op.create_index(
        "ix_transfer_imports_expiry",
        "transfer_imports",
        ["status", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_transfer_imports_expiry", table_name="transfer_imports")
    op.drop_index("ix_transfer_imports_creator", table_name="transfer_imports")
    op.drop_table("transfer_imports")
    op.drop_index("ix_transfer_exports_expiry", table_name="transfer_exports")
    op.drop_index("ix_transfer_exports_creator", table_name="transfer_exports")
    op.drop_table("transfer_exports")
