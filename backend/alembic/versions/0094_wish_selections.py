"""Add current shared Wish rounds and protected owner-only selections.

Revision ID: 0094
Revises: 0092
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0094"
down_revision = "0092"
branch_labels = None
depends_on = None


def _identity() -> list[sa.Column]:  # type: ignore[type-arg]
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "privacy_class",
            sa.Enum(
                "SPACE_SHARED",
                "OWNER_ONLY",
                name="privacy_class",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    ]


def _identity_constraints() -> list[sa.Constraint]:
    return [
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["accounts.id"], ondelete="CASCADE"),
    ]


def upgrade() -> None:
    op.create_table(
        "wish_selection_rounds",
        *_identity(),
        sa.Column("membership_context", sa.String(64), nullable=False),
        sa.Column("candidate_count", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        *_identity_constraints(),
        sa.UniqueConstraint("space_id", name="uq_wish_selection_rounds_space"),
        sa.UniqueConstraint("id", "space_id", name="uq_wish_selection_rounds_id_space"),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_shared"),
        sa.CheckConstraint("candidate_count BETWEEN 2 AND 5", name="candidate_count_is_bounded"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_wish_selection_rounds_space_id", "wish_selection_rounds", ["space_id"])
    op.create_table(
        "wish_selection_candidates",
        sa.Column("round_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wish_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("wish_version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("round_id", "wish_id"),
        sa.ForeignKeyConstraint(
            ["round_id", "space_id"],
            ["wish_selection_rounds.id", "wish_selection_rounds.space_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("round_id", "position", name="uq_wish_selection_candidates_position"),
        sa.CheckConstraint("position BETWEEN 0 AND 4", name="position_is_bounded"),
        sa.CheckConstraint("wish_version > 0", name="wish_version_is_positive"),
    )
    op.create_table(
        "wish_selections",
        *_identity(),
        sa.Column("round_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("published", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        *_identity_constraints(),
        sa.ForeignKeyConstraint(
            ["round_id", "space_id"],
            ["wish_selection_rounds.id", "wish_selection_rounds.space_id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("round_id", "owner_id", name="uq_wish_selections_round_owner"),
        sa.CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_wish_selections_space_id", "wish_selections", ["space_id"])


def downgrade() -> None:
    # This is explicitly temporary decision state. Source Wishes and resulting
    # Plans survive; an operator must export/close active rounds before downgrade.
    if (
        op.get_bind()
        .execute(sa.text("SELECT EXISTS (SELECT 1 FROM wish_selection_rounds)"))
        .scalar()
    ):
        raise RuntimeError("Close or export active Wish selections before downgrade.")
    op.drop_table("wish_selections")
    op.drop_table("wish_selection_candidates")
    op.drop_table("wish_selection_rounds")
