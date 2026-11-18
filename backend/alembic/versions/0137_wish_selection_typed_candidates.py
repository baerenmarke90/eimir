"""Type shared-selection candidates as Space Wishes or curated date ideas.

Existing rows become ``WISH`` candidates with unchanged references and versions,
so every stored round, selection and API client keeps working. A ``DATE_IDEA``
candidate references a persistent catalog ID plus the content revision it was
chosen with; it is never copied into a Wish before deliberate adoption. The
primary key moves from ``(round_id, wish_id)`` to the already unique
``(round_id, position)`` because a date-idea candidate has no Wish.

Owner-only favorites for date ideas live in the existing protected selection
payload (an additive field), so no column or table holds a decision in clear.

Revision ID: 0137
Revises: 0136
"""

import sqlalchemy as sa
from alembic import op

revision = "0137"
down_revision = "0136"
branch_labels = None
depends_on = None

TABLE = "wish_selection_candidates"
TYPED = (
    "(source_type = 'WISH' AND wish_id IS NOT NULL AND wish_version > 0"
    " AND date_idea_id IS NULL AND date_idea_revision IS NULL)"
    " OR (source_type = 'DATE_IDEA' AND wish_id IS NULL AND wish_version IS NULL"
    " AND date_idea_id IS NOT NULL AND date_idea_revision IS NOT NULL)"
)


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("source_type", sa.String(16), server_default=sa.text("'WISH'"), nullable=False),
    )
    op.add_column(TABLE, sa.Column("date_idea_id", sa.String(32), nullable=True))
    op.add_column(TABLE, sa.Column("date_idea_revision", sa.String(64), nullable=True))
    op.drop_constraint("pk_wish_selection_candidates", TABLE, type_="primary")
    op.drop_constraint("uq_wish_selection_candidates_position", TABLE, type_="unique")
    op.drop_constraint("wish_version_is_positive", TABLE, type_="check")
    op.alter_column(TABLE, "wish_id", existing_type=sa.dialects.postgresql.UUID(), nullable=True)
    op.alter_column(TABLE, "wish_version", existing_type=sa.Integer(), nullable=True)
    op.create_primary_key("pk_wish_selection_candidates", TABLE, ["round_id", "position"])
    op.create_unique_constraint("uq_wish_selection_candidates_wish", TABLE, ["round_id", "wish_id"])
    op.create_unique_constraint(
        "uq_wish_selection_candidates_date_idea", TABLE, ["round_id", "date_idea_id"]
    )
    op.create_check_constraint("source_is_typed", TABLE, TYPED)


def downgrade() -> None:
    # Older application versions only understand Wish candidates. Rounds with
    # date ideas are temporary decision state; close or export them first.
    # Wishes and Plans are never touched.
    if (
        op.get_bind()
        .execute(sa.text(f"SELECT EXISTS (SELECT 1 FROM {TABLE} WHERE source_type <> 'WISH')"))
        .scalar()
    ):
        raise RuntimeError("Close or export Wish selections with date ideas before downgrade.")
    op.drop_constraint("source_is_typed", TABLE, type_="check")
    op.drop_constraint("uq_wish_selection_candidates_date_idea", TABLE, type_="unique")
    op.drop_constraint("uq_wish_selection_candidates_wish", TABLE, type_="unique")
    op.drop_constraint("pk_wish_selection_candidates", TABLE, type_="primary")
    op.alter_column(TABLE, "wish_version", existing_type=sa.Integer(), nullable=False)
    op.alter_column(TABLE, "wish_id", existing_type=sa.dialects.postgresql.UUID(), nullable=False)
    op.create_primary_key("pk_wish_selection_candidates", TABLE, ["round_id", "wish_id"])
    op.create_unique_constraint(
        "uq_wish_selection_candidates_position", TABLE, ["round_id", "position"]
    )
    op.create_check_constraint("wish_version_is_positive", TABLE, "wish_version > 0")
    op.drop_column(TABLE, "date_idea_revision")
    op.drop_column(TABLE, "date_idea_id")
    op.drop_column(TABLE, "source_type")
