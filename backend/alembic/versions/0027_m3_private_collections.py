"""M3 owner-only PrivateCollection and PrivateCollectionItem.

Revision ID: 0027
Revises: 0026
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027"
down_revision = "0026"
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
        "private_collections",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id", name="pk_private_collections"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_private_collections_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_private_collections_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index(
        "ix_private_collections_space_id",
        "private_collections",
        ["space_id"],
    )
    op.create_index(
        "ix_private_collections_owner_id",
        "private_collections",
        ["owner_id"],
    )
    op.create_index(
        "ix_private_collections_space_owner_created_at_id",
        "private_collections",
        ["space_id", "owner_id", "created_at", "id"],
    )

    op.create_table(
        "private_collection_items",
        sa.Column("id", UUID, nullable=False),
        sa.Column("collection_id", UUID, nullable=False),
        sa.Column("completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
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
        sa.PrimaryKeyConstraint("id", name="pk_private_collection_items"),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["private_collections.id"],
            name="fk_private_collection_items_collection_id_private_collections",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("position >= 0", name="position_is_non_negative"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.UniqueConstraint(
            "collection_id",
            "position",
            name="uq_private_collection_items_collection_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index(
        "ix_private_collection_items_collection_id_id",
        "private_collection_items",
        ["collection_id", "id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_private_collection_items_collection_id_id",
        table_name="private_collection_items",
    )
    op.drop_table("private_collection_items")

    op.drop_index(
        "ix_private_collections_space_owner_created_at_id",
        table_name="private_collections",
    )
    op.drop_index("ix_private_collections_owner_id", table_name="private_collections")
    op.drop_index("ix_private_collections_space_id", table_name="private_collections")
    op.drop_table("private_collections")
