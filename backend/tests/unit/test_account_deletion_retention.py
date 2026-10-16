"""Static safety rails for Account deletion retention coverage."""

from __future__ import annotations

from eimir.authorization.retention import owner_only_cleanup_table_names


def test_owner_only_cleanup_covers_private_domains_but_defers_attachments() -> None:
    tables = set(owner_only_cleanup_table_names())

    assert "private_notes" in tables
    assert "private_collections" in tables
    assert "profile_preferences" in tables
    assert "heart_moments" in tables

    # Shared-only privacy-aware tables are intentionally still traversed: the
    # OWNER_ONLY predicate is what prevents their deletion if their policy ever
    # becomes mixed in the future.
    assert "memories" in tables

    # Attachment privacy cannot be decided from the upload owner alone because
    # a binding may point at retained SPACE_SHARED content.
    assert "attachments" not in tables
