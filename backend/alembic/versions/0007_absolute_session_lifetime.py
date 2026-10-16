"""Absolute device session lifetime

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# Must match auth.tokens.SESSION_ABSOLUTE_LIFETIME. Deliberately a literal:
# a migration describes a historical point in time and must not change when
# the application constant is adjusted later.
ABSOLUTE_LIFETIME = "180 days"


def upgrade() -> None:
    op.add_column(
        "device_sessions",
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Existing sessions receive their boundary from the actual authentication
    # time. GREATEST prevents the upgrade from ending a session earlier than
    # the `refreshExpiresAt` already promised to the client: a long-running
    # session is not cut off retroactively, but still receives a fixed upper
    # bound.
    op.execute(
        sa.text(
            f"""
            UPDATE device_sessions
               SET absolute_expires_at =
                   GREATEST(created_at + INTERVAL '{ABSOLUTE_LIFETIME}', expires_at)
             WHERE absolute_expires_at IS NULL
            """
        )
    )

    op.alter_column("device_sessions", "absolute_expires_at", nullable=False)


def downgrade() -> None:
    # Only the sliding window remains after downgrade, so session lifetime is
    # no longer bounded above.
    op.drop_column("device_sessions", "absolute_expires_at")
