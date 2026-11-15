"""Google Calendar consent transactions and pending connections (#1895).

Revision ID: 0135
Revises: 0134
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0135"
down_revision = "0134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("status_is_known", "calendar_connections", type_="check")
    op.create_check_constraint(
        "status_is_known", "calendar_connections", "status IN ('PENDING', 'ACTIVE', 'BROKEN')"
    )
    op.create_table(
        "calendar_oauth_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("state_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_index(
        "ix_calendar_oauth_transactions_account_id", "calendar_oauth_transactions", ["account_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_calendar_oauth_transactions_account_id", table_name="calendar_oauth_transactions"
    )
    op.drop_table("calendar_oauth_transactions")
    op.execute("DELETE FROM calendar_connections WHERE status = 'PENDING'")
    op.drop_constraint("status_is_known", "calendar_connections", type_="check")
    op.create_check_constraint(
        "status_is_known", "calendar_connections", "status IN ('ACTIVE', 'BROKEN')"
    )
