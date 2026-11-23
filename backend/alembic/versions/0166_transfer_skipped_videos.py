"""Remember videos left out of a Transfer Bundle import (#2141).

A member without `media.video_upload` may import a bundle without its videos.
Each skipped video is remembered by its imported Memory or HeartMoment, owner,
position, source attachment ID and manifest checksum, so the same file can later
add exactly these videos. The rows hold no content and follow their parent,
owner and Space.

Revision ID: 0166
Revises: 0165
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0166"
down_revision = "0165"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TABLE = "transfer_skipped_videos"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("memory_id", UUID, nullable=True),
        sa.Column("heart_moment_id", UUID, nullable=True),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("import_id", UUID, nullable=True),
        sa.Column("source_attachment_id", UUID, nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("mime_type", sa.String(length=127), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(memory_id IS NULL) <> (heart_moment_id IS NULL)",
            name=op.f("ck_transfer_skipped_videos_one_parent"),
        ),
        sa.CheckConstraint("size > 0", name=op.f("ck_transfer_skipped_videos_size_is_positive")),
        sa.CheckConstraint(
            "position >= 0", name=op.f("ck_transfer_skipped_videos_position_is_non_negative")
        ),
        sa.CheckConstraint(
            "char_length(checksum) = 64",
            name=op.f("ck_transfer_skipped_videos_checksum_is_sha256"),
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name=op.f("fk_transfer_skipped_videos_space_id_spaces"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["memory_id"],
            ["memories.id"],
            name=op.f("fk_transfer_skipped_videos_memory_id_memories"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["heart_moment_id"],
            ["heart_moments.id"],
            name=op.f("fk_transfer_skipped_videos_heart_moment_id_heart_moments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name=op.f("fk_transfer_skipped_videos_owner_id_accounts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["import_id"],
            ["transfer_imports.id"],
            name=op.f("fk_transfer_skipped_videos_import_id_transfer_imports"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transfer_skipped_videos")),
    )
    op.create_index("ix_transfer_skipped_videos_space", TABLE, ["space_id", "source_attachment_id"])
    op.create_index("ix_transfer_skipped_videos_owner", TABLE, ["owner_id"])
    op.create_index(
        "uq_transfer_skipped_videos_memory_source",
        TABLE,
        ["memory_id", "source_attachment_id"],
        unique=True,
        postgresql_where=sa.text("memory_id IS NOT NULL"),
    )
    op.create_index(
        "uq_transfer_skipped_videos_heart_moment_source",
        TABLE,
        ["heart_moment_id", "source_attachment_id"],
        unique=True,
        postgresql_where=sa.text("heart_moment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table(TABLE)
