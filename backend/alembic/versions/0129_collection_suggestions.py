"""Shopping suggestions kept from finished trips (#1808, decision 0016).

Adds ``collection_suggestions``: titles bought on a finished shopping trip,
per shopping list, deleted with the list.

Revision ID: 0129
Revises: 0128
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0129"
down_revision = "0128"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "collection_suggestions",
        sa.Column("id", UUID, nullable=False),
        sa.Column("collection_id", UUID, nullable=False),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("last_bought_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("times_bought", sa.Integer(), server_default=sa.text("1"), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name="pk_collection_suggestions"),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["collections.id"],
            name="fk_collection_suggestions_collection_id_collections",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("times_bought >= 1", name="times_bought_is_positive"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index(
        "ix_collection_suggestions_collection_id_last_bought_at",
        "collection_suggestions",
        ["collection_id", "last_bought_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_collection_suggestions_collection_id_last_bought_at",
        table_name="collection_suggestions",
    )
    op.drop_table("collection_suggestions")
