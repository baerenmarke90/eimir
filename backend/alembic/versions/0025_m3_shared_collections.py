"""M3 shared Collection aggregate.

Revision ID: 0025
Revises: 0024
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0025"
down_revision = "0024"
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
        "collections",
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
        sa.PrimaryKeyConstraint("id", name="pk_collections"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_collections_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_collections_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.UniqueConstraint("id", "space_id", name="uq_collections_id_space_id"),
    )
    op.create_index("ix_collections_space_id", "collections", ["space_id"])
    op.create_index("ix_collections_owner_id", "collections", ["owner_id"])
    op.create_index(
        "ix_collections_space_id_created_at_id",
        "collections",
        ["space_id", "created_at", "id"],
    )

    op.create_table(
        "collection_items",
        sa.Column("id", UUID, nullable=False),
        sa.Column("collection_id", UUID, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_collection_items"),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["collections.id"],
            name="fk_collection_items_collection_id_collections",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["accounts.id"],
            name="fk_collection_items_created_by_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("position >= 0", name="position_is_non_negative"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.UniqueConstraint(
            "collection_id",
            "position",
            name="uq_collection_items_collection_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index("ix_collection_items_created_by", "collection_items", ["created_by"])
    op.create_index(
        "ix_collection_items_collection_id_id",
        "collection_items",
        ["collection_id", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_collection_items_collection_id_id", table_name="collection_items")
    op.drop_index("ix_collection_items_created_by", table_name="collection_items")
    op.drop_table("collection_items")

    op.drop_index("ix_collections_space_id_created_at_id", table_name="collections")
    op.drop_index("ix_collections_owner_id", table_name="collections")
    op.drop_index("ix_collections_space_id", table_name="collections")
    op.drop_table("collections")
