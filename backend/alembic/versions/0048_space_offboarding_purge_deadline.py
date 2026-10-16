"""Freeze purge deadlines for zero-active Spaces.

Revision ID: 0048
Revises: 0047
Create Date: 2026-09-07

#669 ratifies the V1 30-day Space-offboarding retention as a fixed product and
privacy policy. A derived ``max(memberships.ended_at) + current policy`` value
would let a later policy version retroactively change an already-promised
cleanup date, so the deadline is persisted when a Space becomes zero-active.

Existing zero-active Spaces are backfilled from the historical V1 promise. The
30-day literal below is deliberately migration-local historical data: it
records policy version 1.0 at migration time and is not a runtime configuration
source.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "spaces",
        sa.Column("offboarding_purge_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_spaces_offboarding_purge_at",
        "spaces",
        ["offboarding_purge_at"],
        unique=False,
    )

    # Backfill only real relationship histories: empty operator-anomaly Spaces
    # remain unclassified, and any malformed ended Membership without ended_at
    # fails closed rather than receiving an invented destruction deadline.
    op.execute(
        sa.text(
            """
            UPDATE spaces AS s
            SET offboarding_purge_at = orphaned.orphaned_at + INTERVAL '30 days'
            FROM (
                SELECT
                    m.space_id,
                    MAX(m.ended_at) AS orphaned_at
                FROM memberships AS m
                GROUP BY m.space_id
                HAVING COUNT(*) FILTER (WHERE m.status = 'ACTIVE') = 0
                   AND COUNT(*) > 0
                   AND COUNT(*) FILTER (WHERE m.ended_at IS NULL) = 0
            ) AS orphaned
            WHERE s.id = orphaned.space_id
              AND s.offboarding_purge_at IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_spaces_offboarding_purge_at", table_name="spaces")
    op.drop_column("spaces", "offboarding_purge_at")
