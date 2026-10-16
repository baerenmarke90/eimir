"""Track the release boundary of deferred notification mail.

Revision ID: 0081
Revises: 0080
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0081"
down_revision = "0080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_deliveries", sa.Column("deferred_until", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "ix_email_deliveries_deferred_until",
        "email_deliveries",
        ["deferred_until"],
        postgresql_where=sa.text("deferred_until IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_email_deliveries_deferred_until", table_name="email_deliveries")
    op.drop_column("email_deliveries", "deferred_until")
