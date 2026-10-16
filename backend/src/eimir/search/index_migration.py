"""Immutable PostgreSQL Search index contract shared by Alembic repairs.

The definitions below are the exact M4-A index set introduced by revision
0028. Existing installations depend on that historical contract, so changes
to Search indexing must use a new migration instead of rewriting this tuple.
"""

from __future__ import annotations

from dataclasses import dataclass

import sqlalchemy as sa
from sqlalchemy.engine import Connection


@dataclass(frozen=True)
class SearchIndexDefinition:
    """One repository-owned PostgreSQL Search index definition."""

    name: str
    table: str
    expression: str


SEARCH_INDEXES: tuple[SearchIndexDefinition, ...] = (
    SearchIndexDefinition(
        "ix_memories_search_fts",
        "memories",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'body', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_heart_moments_search_fts",
        "heart_moments",
        "setweight(to_tsvector('simple', coalesce(payload->>'text', '')), 'A')",
    ),
    SearchIndexDefinition(
        "ix_milestones_search_fts",
        "milestones",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'body', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_wishes_search_fts",
        "wishes",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A')",
    ),
    SearchIndexDefinition(
        "ix_plans_search_fts",
        "plans",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'description', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_places_search_fts",
        "places",
        "setweight(to_tsvector('simple', coalesce(payload->>'name', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'description', '')), 'B') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'address', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_chapters_search_fts",
        "chapters",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'description', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_collections_search_fts",
        "collections",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A')",
    ),
    SearchIndexDefinition(
        "ix_collection_items_search_fts",
        "collection_items",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A')",
    ),
    SearchIndexDefinition(
        "ix_private_notes_search_fts",
        "private_notes",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'body', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_gift_ideas_search_fts",
        "gift_ideas",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'description', '')), 'B') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'recipient', '')), 'B') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'occasion', '')), 'B') || "
        "setweight(to_tsvector('simple', coalesce(payload->>'price_text', '')), 'B')",
    ),
    SearchIndexDefinition(
        "ix_private_collections_search_fts",
        "private_collections",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A')",
    ),
    SearchIndexDefinition(
        "ix_private_collection_items_search_fts",
        "private_collection_items",
        "setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A')",
    ),
)


_INDEX_VALIDITY = sa.text(
    "SELECT pg_index.indisvalid "
    "FROM pg_index "
    "JOIN pg_class ON pg_class.oid = pg_index.indexrelid "
    "JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace "
    "WHERE pg_namespace.nspname = current_schema() AND pg_class.relname = :name"
)


def ensure_search_indexes(connection: Connection) -> None:
    """Create missing indexes and replace invalid interrupted builds.

    The caller must provide an Alembic connection inside ``autocommit_block``.
    PostgreSQL rejects both concurrent CREATE and concurrent DROP in a normal
    transaction block.
    """
    for index in SEARCH_INDEXES:
        valid = connection.execute(_INDEX_VALIDITY, {"name": index.name}).scalar_one_or_none()
        if valid is True:
            continue
        if valid is False:
            connection.execute(sa.text(f"DROP INDEX CONCURRENTLY IF EXISTS {index.name}"))
        connection.execute(
            sa.text(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {index.name} "
                f"ON {index.table} USING gin (({index.expression}))"
            )
        )
