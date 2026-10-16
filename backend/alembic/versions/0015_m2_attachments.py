"""M2 attachments.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

STATUS_VALUES = (
    "PENDING",
    "UPLOADING",
    "VALIDATING",
    "READY",
    "FAILED",
    "DELETING",
    "DELETE_FAILED",
)


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "attachments",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("media_type", sa.String(length=16), nullable=False),
        sa.Column("declared_mime_type", sa.String(length=128), nullable=False),
        sa.Column("declared_size", sa.BigInteger(), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("size", sa.BigInteger(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("has_thumbnail", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("failure_code", sa.String(length=64), nullable=True),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_attachments"),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name="fk_attachments_space_id_spaces", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_attachments_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN (" + ", ".join(f"'{value}'" for value in STATUS_VALUES) + ")",
            name="status_is_known",
        ),
        sa.CheckConstraint("media_type IN ('IMAGE', 'VIDEO')", name="media_type_is_known"),
        # An unbound attachment belongs to its owner. Binding it to a parent
        # is introduced in the media integration slice.
        sa.CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.CheckConstraint("declared_size >= 0", name="declared_size_is_non_negative"),
        sa.CheckConstraint("size IS NULL OR size >= 0", name="size_is_non_negative"),
        # READY without ready_at would have no binding window and would never
        # be collected by cleanup.
        sa.CheckConstraint("status <> 'READY' OR ready_at IS NOT NULL", name="ready_has_ready_at"),
    )
    op.create_index("ix_attachments_space_id", "attachments", ["space_id"])
    op.create_index("ix_attachments_owner_id", "attachments", ["owner_id"])
    op.create_index("ix_attachments_status_created_at", "attachments", ["status", "created_at"])
    op.create_index("ix_attachments_status_ready_at", "attachments", ["status", "ready_at"])


def downgrade() -> None:
    op.drop_index("ix_attachments_status_ready_at", table_name="attachments")
    op.drop_index("ix_attachments_status_created_at", table_name="attachments")
    op.drop_index("ix_attachments_owner_id", table_name="attachments")
    op.drop_index("ix_attachments_space_id", table_name="attachments")
    op.drop_table("attachments")
