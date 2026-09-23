"""Add a terminal failure state for poison Outbox events.

Revision ID: 0072
Revises: 0071
Create Date: 2026-09-23

`mark_failed` previously only ever rescheduled a failed event with
exponential backoff (0054); nothing ever stopped retrying it. A permanently
broken event (e.g. a payload shape a projector can never handle) is always
the oldest unprocessed row, so it occupies a claim slot in every
`claim_unprocessed` batch forever, at up to the one-hour-capped cadence,
with no operator-visible terminal state distinguishing "still retrying" from
"poison" -- mirroring the exact problem `jobs.queue`'s `max_attempts`/
`JobStatus.FAILED` already solves for ordinary background jobs.

`failed_at` gives Outbox the same terminal state: `service.mark_failed` sets
it once `service.MAX_ATTEMPTS` is exhausted, and `service.claim_unprocessed`
excludes such rows. The existing partial index only narrowed to unprocessed
rows; it is recreated here to also exclude terminally failed ones, since a
poison event doing neither `processed_at IS NULL` nor `failed_at IS NULL`
would otherwise stay a "cheap to skip but never shrinking" pollutant of the
index the claim query scans.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "outbox_events",
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_index("ix_outbox_events_unprocessed", table_name="outbox_events")
    op.create_index(
        "ix_outbox_events_unprocessed",
        "outbox_events",
        ["created_at"],
        postgresql_where=sa.text("processed_at IS NULL AND failed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_events_unprocessed", table_name="outbox_events")
    op.create_index(
        "ix_outbox_events_unprocessed",
        "outbox_events",
        ["created_at"],
        postgresql_where=sa.text("processed_at IS NULL"),
    )
    op.drop_column("outbox_events", "failed_at")
