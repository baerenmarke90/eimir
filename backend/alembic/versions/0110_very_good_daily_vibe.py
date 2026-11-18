"""Add the explicit very-good daily Vibe without changing sharing semantics.

Revision ID: 0110
Revises: 0109
"""

from alembic import op

revision = "0110"
down_revision = "0109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("vibe_is_known", "daily_check_ins", type_="check")
    op.create_check_constraint(
        "vibe_is_known",
        "daily_check_ins",
        "vibe IS NULL OR vibe IN "
        "('VERY_GOOD', 'GOOD', 'OKAY', 'STRESSED', 'SAD', 'NEEDS_CONNECTION', 'NEEDS_SPACE')",
    )


def downgrade() -> None:
    # Preserve a positive check-in when returning to a version without VERY_GOOD.
    op.execute("UPDATE daily_check_ins SET vibe = 'GOOD' WHERE vibe = 'VERY_GOOD'")
    op.drop_constraint("vibe_is_known", "daily_check_ins", type_="check")
    op.create_check_constraint(
        "vibe_is_known",
        "daily_check_ins",
        "vibe IS NULL OR vibe IN "
        "('GOOD', 'OKAY', 'STRESSED', 'SAD', 'NEEDS_CONNECTION', 'NEEDS_SPACE')",
    )
