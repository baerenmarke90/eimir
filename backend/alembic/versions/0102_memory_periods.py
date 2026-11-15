"""Add an optional inclusive end date to existing Memory calendar dates."""

import sqlalchemy as sa
from alembic import op

revision = "0102"
down_revision = "0101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memories", sa.Column("happened_until", sa.Date(), nullable=True))
    op.create_check_constraint(
        "memory_period_valid",
        "memories",
        "happened_until IS NULL OR (happened_on IS NOT NULL AND happened_until >= happened_on)",
    )


def downgrade() -> None:
    op.drop_constraint("memory_period_valid", "memories", type_="check")
    op.drop_column("memories", "happened_until")
