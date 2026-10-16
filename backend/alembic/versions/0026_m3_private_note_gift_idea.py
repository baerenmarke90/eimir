"""M3 owner-only PrivateNote and GiftIdea.

Revision ID: 0026
Revises: 0025
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0026"
down_revision = "0025"
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


def _gift_idea_status() -> sa.Enum:
    return sa.Enum(
        "IDEA",
        "BOUGHT",
        "GIVEN",
        name="gift_idea_status",
        native_enum=False,
        create_constraint=True,
    )


def _owner_only_table(name: str, *, gift_idea: bool) -> None:
    columns: list[sa.Column[object]] = [
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
    ]
    if gift_idea:
        columns.append(
            sa.Column(
                "status", _gift_idea_status(), server_default=sa.text("'IDEA'"), nullable=False
            )
        )
    columns.extend(
        [
            sa.Column("pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
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
        ]
    )
    op.create_table(
        name,
        *columns,
        sa.PrimaryKeyConstraint("id", name=f"pk_{name}"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name=f"fk_{name}_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name=f"fk_{name}_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index(f"ix_{name}_space_id", name, ["space_id"])
    op.create_index(f"ix_{name}_owner_id", name, ["owner_id"])
    op.create_index(
        f"ix_{name}_space_owner_created_at_id",
        name,
        ["space_id", "owner_id", "created_at", "id"],
    )


def upgrade() -> None:
    _owner_only_table("private_notes", gift_idea=False)
    _owner_only_table("gift_ideas", gift_idea=True)
    op.create_index(
        "ix_gift_ideas_space_owner_status",
        "gift_ideas",
        ["space_id", "owner_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_gift_ideas_space_owner_status", table_name="gift_ideas")
    op.drop_index("ix_gift_ideas_space_owner_created_at_id", table_name="gift_ideas")
    op.drop_index("ix_gift_ideas_owner_id", table_name="gift_ideas")
    op.drop_index("ix_gift_ideas_space_id", table_name="gift_ideas")
    op.drop_table("gift_ideas")

    op.drop_index("ix_private_notes_space_owner_created_at_id", table_name="private_notes")
    op.drop_index("ix_private_notes_owner_id", table_name="private_notes")
    op.drop_index("ix_private_notes_space_id", table_name="private_notes")
    op.drop_table("private_notes")
