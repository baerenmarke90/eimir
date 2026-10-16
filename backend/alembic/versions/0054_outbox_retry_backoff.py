"""Add retry backoff scheduling to the transactional Outbox.

Revision ID: 0054
Revises: 0053
Create Date: 2026-09-14

`claim_unprocessed` claims the oldest unprocessed rows with no regard for how
recently a row already failed. A permanently-failing event is reclaimed on
the very next poll, spinning the worker at full speed with no backoff, and
since it is always the oldest unprocessed row it is always first in the next
batch -- once enough such rows accumulate, newer events past the batch limit
never get a chance to be claimed at all.

`next_attempt_at` lets a failed event opt out of being claimed again until a
backoff window has elapsed, mirroring the existing `jobs.run_after` column
and its exponential-backoff scheduling. NULL (the default) means immediately
eligible, matching every existing unprocessed row today. The existing
`ix_outbox_events_unprocessed` partial index already narrows to unprocessed
rows only, so the additional filter on this new column does not need its own
index at the Outbox table's expected size.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "outbox_events",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("outbox_events", "next_attempt_at")
