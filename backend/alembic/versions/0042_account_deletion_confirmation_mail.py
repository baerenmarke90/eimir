"""Account deletion confirmation-mail state.

Revision ID: 0042
Revises: 0041
Create Date: 2026-09-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "account_deletions",
        sa.Column("confirmation_mail_attempted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "account_deletions",
        sa.Column("confirmation_mail_status", sa.String(length=32), nullable=True),
    )
    op.create_check_constraint(
        "confirmation_mail_state_is_valid",
        "account_deletions",
        "(confirmation_mail_attempted_at IS NULL AND confirmation_mail_status IS NULL) OR "
        "(confirmation_mail_attempted_at IS NOT NULL AND confirmation_mail_status IN "
        "('CLAIMED', 'SENT', 'UNAVAILABLE', 'FAILED', 'NO_VERIFIED_PRIMARY'))",
    )


def downgrade() -> None:
    op.drop_constraint(
        "confirmation_mail_state_is_valid",
        "account_deletions",
        type_="check",
    )
    op.drop_column("account_deletions", "confirmation_mail_status")
    op.drop_column("account_deletions", "confirmation_mail_attempted_at")
