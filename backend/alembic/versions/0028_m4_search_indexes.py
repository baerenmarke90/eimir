"""M4-A PostgreSQL full-text search indexes.

Revision ID: 0028
Revises: 0027
Create Date: 2026-08-30

Search indexes are derived directly from the existing ProtectedPayload JSONB
columns. No copied plaintext search document is introduced. They are created
concurrently so upgrading a non-empty installation does not take a blocking
write lock for the duration of each index build.
"""

from __future__ import annotations

from alembic import op

from eimir.search.index_migration import SEARCH_INDEXES, ensure_search_indexes

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY is intentionally outside Alembic's migration
    # transaction. Each statement is resumable after an interrupted rollout:
    # IF NOT EXISTS handles indexes already completed by a previous attempt.
    # Runtime integration tests verify the resulting definitions, so the
    # resumability guard is not used as a substitute for schema validation.
    #
    # IF NOT EXISTS only checks the index *name*, not its validity. If a
    # previous attempt was interrupted mid-build (killed migrate container,
    # host restart), PostgreSQL leaves that index catalogued but invalid, and
    # a bare retry would silently skip rebuilding it forever. Drop an invalid
    # leftover first so the retry actually resumes instead of no-op'ing.
    with op.get_context().autocommit_block():
        ensure_search_indexes(op.get_bind())


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for index in reversed(SEARCH_INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index.name}")
