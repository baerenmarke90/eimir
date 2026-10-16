"""M3 plans and the wish->plan link.

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020"
down_revision = "0019"
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


def _plan_status() -> sa.Enum:
    return sa.Enum(
        "IDEA",
        "PLANNED",
        "COMPLETED",
        name="plan_status",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    # Supports the composite foreign key below. Without this uniqueness,
    # `plans` could reference only `wishes.id`, including a wish from another
    # space.
    op.create_unique_constraint("uq_wishes_id_space_id", "wishes", ["id", "space_id"])

    op.create_table(
        "plans",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        # As with `wishes`: attribution and audit, not an ACL.
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("status", _plan_status(), server_default=sa.text("'IDEA'"), nullable=False),
        sa.Column("source_wish_id", UUID, nullable=True),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=True),
        # DATE rather than TIMESTAMPTZ: an experienced day has no time zone.
        sa.Column("experienced_on", sa.Date(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name="pk_plans"),
        sa.ForeignKeyConstraint(
            ["space_id"], ["spaces.id"], name="fk_plans_space_id_spaces", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_plans_owner_id_accounts",
            ondelete="CASCADE",
        ),
        # Composite and without ON DELETE. `source_wish_id` may be NULL;
        # PostgreSQL does not check a foreign key containing NULL, so direct
        # plans remain independent. For a sourced plan, this is the final
        # boundary against a wish from another space and against deleting a
        # wish while its plan still references it.
        sa.ForeignKeyConstraint(
            ["source_wish_id", "space_id"],
            ["wishes.id", "wishes.space_id"],
            name="fk_plans_source_wish_id_wishes",
        ),
        # At most one originating plan per wish (M3-D02). PostgreSQL permits
        # multiple NULL values.
        sa.UniqueConstraint("source_wish_id", name="uq_plans_source_wish_id"),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Date invariants from M3-D04.
        sa.CheckConstraint(
            "planned_end IS NULL OR planned_start IS NOT NULL",
            name="planned_end_needs_start",
        ),
        sa.CheckConstraint(
            "planned_end IS NULL OR planned_end >= planned_start",
            name="planned_end_not_before_start",
        ),
        sa.CheckConstraint(
            "status <> 'IDEA' OR (planned_start IS NULL AND planned_end IS NULL)",
            name="idea_has_no_schedule",
        ),
        sa.CheckConstraint(
            "status <> 'PLANNED' OR planned_start IS NOT NULL",
            name="planned_needs_start",
        ),
        sa.CheckConstraint(
            "status <> 'COMPLETED' OR experienced_on IS NOT NULL",
            name="completed_needs_experienced_on",
        ),
    )
    op.create_index("ix_plans_space_id", "plans", ["space_id"])
    op.create_index("ix_plans_owner_id", "plans", ["owner_id"])
    op.create_index("ix_plans_space_id_created_at_id", "plans", ["space_id", "created_at", "id"])
    op.create_index("ix_plans_space_id_status", "plans", ["space_id", "status"])
    op.create_index("ix_plans_space_id_planned_start", "plans", ["space_id", "planned_start"])


def downgrade() -> None:
    op.drop_index("ix_plans_space_id_planned_start", table_name="plans")
    op.drop_index("ix_plans_space_id_status", table_name="plans")
    op.drop_index("ix_plans_space_id_created_at_id", table_name="plans")
    op.drop_index("ix_plans_owner_id", table_name="plans")
    op.drop_index("ix_plans_space_id", table_name="plans")
    op.drop_table("plans")
    op.drop_constraint("uq_wishes_id_space_id", "wishes", type_="unique")
