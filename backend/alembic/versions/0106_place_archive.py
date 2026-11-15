"""Persist reversible Place archiving without changing content relations.

Revision ID: 0106
Revises: 0105
"""

import sqlalchemy as sa
from alembic import op

revision = "0106"
down_revision = "0105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "places", sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.drop_column("places", "archived")
