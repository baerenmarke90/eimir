"""Personal language mode, preserving the existing effective locale.

Revision ID: 0112
Revises: 0111
"""

import sqlalchemy as sa
from alembic import op

revision = "0112"
down_revision = "0111"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("language_preference", sa.String(16), nullable=False, server_default="auto"),
    )
    op.add_column(
        "accounts",
        sa.Column("language_version", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("accounts", "language_version")
    op.drop_column("accounts", "language_preference")
