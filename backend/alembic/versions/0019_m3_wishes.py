"""M3 wishes.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def _wish_status() -> sa.Enum:
    # Full M3-D02/D03/D04 status set even though M3-S1 only creates `OPEN`:
    # `PLANNED` and `COMPLETED` arise later from the Wish-to-Plan contract.
    # Defining the value range now avoids an M3-S2 status migration across
    # rows that may already exist.
    return sa.Enum(
        "OPEN",
        "PLANNED",
        "COMPLETED",
        name="wish_status",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "wishes",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        # `owner_id` carries `createdBy` here: attribution and audit, not ACL.
        # Under M3-D01, active Space membership determines who may write.
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("status", _wish_status(), server_default=sa.text("'OPEN'"), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_wishes"),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name="fk_wishes_space_id_spaces", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_wishes_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_wishes_space_id", "wishes", ["space_id"])
    op.create_index("ix_wishes_owner_id", "wishes", ["owner_id"])
    op.create_index("ix_wishes_space_id_created_at_id", "wishes", ["space_id", "created_at", "id"])
    op.create_index("ix_wishes_space_id_status", "wishes", ["space_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_wishes_space_id_status", table_name="wishes")
    op.drop_index("ix_wishes_space_id_created_at_id", table_name="wishes")
    op.drop_index("ix_wishes_owner_id", table_name="wishes")
    op.drop_index("ix_wishes_space_id", table_name="wishes")
    op.drop_table("wishes")
