"""Encrypted, account-owned Google account hint for the photo import (#1467).

Revision ID: 0130
Revises: 0129
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0130"
down_revision = "0129"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "google_account_hints",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "account_id",
            UUID,
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("google_account_hints")
