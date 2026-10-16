"""Drop the plaintext-derived Search indexes (issue #797).

Revision ID: 0069
Revises: 0068
Create Date: 2026-09-22

The 0028 GIN indexes tokenize ``payload->>'title'`` and friends. Once protected
payloads are ciphertext they index nothing, and while legacy plaintext rows
remain they hold a searchable copy of protected text that no column-level
encryption reaches (index pages and replicas contain the lexemes). Search now
matches over decrypted payloads in the application, so the indexes have no
reader and are removed on every installation, encrypted or not.

Dropped concurrently and idempotently so an interrupted rollout can be re-run.
Downgrade restores the historical index set; it is only meaningful before
encryption is enabled, because the restored indexes read ``payload->>...``.
"""

from __future__ import annotations

from alembic import op

from eimir.search.index_migration import SEARCH_INDEXES, ensure_search_indexes

revision = "0069"
down_revision = "0068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for index in reversed(SEARCH_INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index.name}")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        ensure_search_indexes(op.get_bind())
