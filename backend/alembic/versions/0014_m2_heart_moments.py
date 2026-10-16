"""M2 heart moments.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
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


def upgrade() -> None:
    op.create_table(
        "heart_moments",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("happened_on", sa.Date(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_heart_moments"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_heart_moments_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_heart_moments_owner_id_accounts",
            ondelete="CASCADE",
        ),
        # Unlike memories, this table permits both enforceable privacy classes.
        # The constraint records that there are exactly two: a class without a
        # query enforcement rule must never be stored here.
        sa.CheckConstraint(
            "privacy_class IN ('SPACE_SHARED', 'OWNER_ONLY')",
            name="privacy_is_enforceable",
        ),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_heart_moments_space_id", "heart_moments", ["space_id"])
    op.create_index("ix_heart_moments_owner_id", "heart_moments", ["owner_id"])
    op.create_index(
        "ix_heart_moments_space_id_created_at_id",
        "heart_moments",
        ["space_id", "created_at", "id"],
    )
    op.create_index(
        "ix_heart_moments_space_id_privacy_class",
        "heart_moments",
        ["space_id", "privacy_class"],
    )


def downgrade() -> None:
    op.drop_index("ix_heart_moments_space_id_privacy_class", table_name="heart_moments")
    op.drop_index("ix_heart_moments_space_id_created_at_id", table_name="heart_moments")
    op.drop_index("ix_heart_moments_owner_id", table_name="heart_moments")
    op.drop_index("ix_heart_moments_space_id", table_name="heart_moments")
    op.drop_table("heart_moments")
