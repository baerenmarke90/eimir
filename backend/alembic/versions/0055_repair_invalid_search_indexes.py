"""Repair Search indexes left invalid by an interrupted concurrent build.

Revision ID: 0055
Revises: 0054
Create Date: 2026-09-15

Revision 0028 creates the M4-A Search indexes concurrently. PostgreSQL keeps
an invalid index object when a concurrent build is interrupted, and the
historical ``IF NOT EXISTS`` retry then sees the name and skips the rebuild.
This forward repair applies the corrected restart-safe behavior to databases
that recorded 0028 as complete before that correction existed.
"""

from __future__ import annotations

from alembic import op

from eimir.search.index_migration import ensure_search_indexes

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use the same transaction boundary as 0028. PostgreSQL rejects CREATE or
    # DROP INDEX CONCURRENTLY inside a normal transaction block.
    with op.get_context().autocommit_block():
        ensure_search_indexes(op.get_bind())


def downgrade() -> None:
    # The indexes belong to revision 0028. Reverting this repair must not
    # remove or invalidate schema objects required by that historical contract.
    pass
