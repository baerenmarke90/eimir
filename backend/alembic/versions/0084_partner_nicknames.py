"""Store private viewer-owned partner nicknames.

Revision ID: 0084
Revises: 0083
Create Date: 2026-09-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0084"
down_revision = "0083"
branch_labels = None
depends_on = None


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
        "partner_nicknames",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_partner_nicknames"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_partner_nicknames_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_partner_nicknames_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_partner_nicknames_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("space_id", "owner_id", "account_id", name="uq_partner_nicknames_pair"),
        sa.CheckConstraint("owner_id <> account_id", name="nickname_targets_partner"),
        sa.CheckConstraint("privacy_class = 'OWNER_ONLY'", name="nickname_owner_only"),
        sa.CheckConstraint("crypto_version >= 0", name="nickname_crypto_version_valid"),
    )
    op.create_index("ix_partner_nicknames_space_id", "partner_nicknames", ["space_id"])


def downgrade() -> None:
    op.drop_index("ix_partner_nicknames_space_id", table_name="partner_nicknames")
    op.drop_table("partner_nicknames")
