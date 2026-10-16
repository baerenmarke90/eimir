"""M3 Chapter domain and canonical place reference.

Revision ID: 0023
Revises: 0022
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
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
        "chapters",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("start_on", sa.Date(), nullable=True),
        sa.Column("end_on", sa.Date(), nullable=True),
        sa.Column("place_id", UUID, nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_chapters"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_chapters_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_chapters_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_chapters_place_id_places",
            ondelete="SET NULL (place_id)",
        ),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.CheckConstraint(
            "start_on IS NULL OR end_on IS NULL OR end_on >= start_on",
            name="date_range_is_valid",
        ),
        sa.UniqueConstraint("id", "space_id", name="uq_chapters_id_space_id"),
    )
    op.create_index("ix_chapters_space_id", "chapters", ["space_id"])
    op.create_index("ix_chapters_owner_id", "chapters", ["owner_id"])
    op.create_index("ix_chapters_place_id", "chapters", ["place_id"])
    op.create_index(
        "ix_chapters_space_id_created_at_id",
        "chapters",
        ["space_id", "created_at", "id"],
    )
    op.create_index("ix_chapters_space_id_start_on", "chapters", ["space_id", "start_on"])


def downgrade() -> None:
    op.drop_index("ix_chapters_space_id_start_on", table_name="chapters")
    op.drop_index("ix_chapters_space_id_created_at_id", table_name="chapters")
    op.drop_index("ix_chapters_place_id", table_name="chapters")
    op.drop_index("ix_chapters_owner_id", table_name="chapters")
    op.drop_index("ix_chapters_space_id", table_name="chapters")
    op.drop_table("chapters")
