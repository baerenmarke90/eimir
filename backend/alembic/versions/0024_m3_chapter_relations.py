"""M3 typed Chapter content relations.

Revision ID: 0024
Revises: 0023
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def _create_simple_relation(table: str, target: str, target_table: str) -> None:
    target_column = f"{target}_id"
    op.create_table(
        table,
        sa.Column("chapter_id", UUID, nullable=False),
        sa.Column(target_column, UUID, nullable=False),
        *_audit_columns(),
        sa.PrimaryKeyConstraint("chapter_id", target_column, name=f"pk_{table}"),
        sa.ForeignKeyConstraint(
            ["chapter_id", "space_id"],
            ["chapters.id", "chapters.space_id"],
            name=f"fk_{table}_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            [target_column, "space_id"],
            [f"{target_table}.id", f"{target_table}.space_id"],
            name=f"fk_{table}_{target_column}_{target_table}",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["accounts.id"],
            name=f"fk_{table}_created_by_accounts",
            ondelete="CASCADE",
        ),
    )
    op.create_index(f"ix_{table}_{target_column}", table, [target_column])
    op.create_index(f"ix_{table}_space_id", table, ["space_id"])
    op.create_index(
        f"ix_{table}_chapter_id_created_at",
        table,
        ["chapter_id", "created_at", target_column],
    )


def upgrade() -> None:
    _create_simple_relation("chapter_memories", "memory", "memories")
    _create_simple_relation("chapter_milestones", "milestone", "milestones")

    op.create_table(
        "chapter_heart_moments",
        sa.Column("chapter_id", UUID, nullable=False),
        sa.Column("heart_moment_id", UUID, nullable=False),
        *_audit_columns(),
        sa.Column(
            "target_privacy_class",
            sa.Enum(
                "SPACE_SHARED",
                "OWNER_ONLY",
                name="privacy_class",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint(
            "chapter_id",
            "heart_moment_id",
            name="pk_chapter_heart_moments",
        ),
        sa.CheckConstraint(
            "target_privacy_class = 'SPACE_SHARED'",
            name="relation_target_is_shared",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id", "space_id"],
            ["chapters.id", "chapters.space_id"],
            name="fk_chapter_heart_moments_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["heart_moment_id", "space_id", "target_privacy_class"],
            ["heart_moments.id", "heart_moments.space_id", "heart_moments.privacy_class"],
            name="fk_chapter_heart_moments_heart_moment_id_heart_moments",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["accounts.id"],
            name="fk_chapter_heart_moments_created_by_accounts",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_chapter_heart_moments_heart_moment_id",
        "chapter_heart_moments",
        ["heart_moment_id"],
    )
    op.create_index(
        "ix_chapter_heart_moments_space_id",
        "chapter_heart_moments",
        ["space_id"],
    )
    op.create_index(
        "ix_chapter_heart_moments_chapter_id_created_at",
        "chapter_heart_moments",
        ["chapter_id", "created_at", "heart_moment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_chapter_heart_moments_chapter_id_created_at",
        table_name="chapter_heart_moments",
    )
    op.drop_index(
        "ix_chapter_heart_moments_space_id",
        table_name="chapter_heart_moments",
    )
    op.drop_index(
        "ix_chapter_heart_moments_heart_moment_id",
        table_name="chapter_heart_moments",
    )
    op.drop_table("chapter_heart_moments")

    for table, target in (
        ("chapter_milestones", "milestone"),
        ("chapter_memories", "memory"),
    ):
        op.drop_index(f"ix_{table}_chapter_id_created_at", table_name=table)
        op.drop_index(f"ix_{table}_space_id", table_name=table)
        op.drop_index(f"ix_{table}_{target}_id", table_name=table)
        op.drop_table(table)
