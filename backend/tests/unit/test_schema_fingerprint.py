"""The schema fingerprint guards the Core chain only (Decision 0017, decision 6).

A plugin chain's tables exist only where that plugin ran its chain, so the one
committed fingerprint could not match both the Core-only and the plugin-loaded
database. Those chains have their own migration tests instead.
"""

from __future__ import annotations

from eimir.plugins.manifest import PLUGIN_TABLES
from scripts import schema_fingerprint


def test_the_fingerprint_leaves_out_exactly_the_plugin_chain_tables() -> None:
    chain_tables = {row.table for row in PLUGIN_TABLES if row.chain}

    assert chain_tables >= {"support_report_tickets", "gift_code_batches", "gift_codes"}
    assert set(schema_fingerprint.EXCLUDED_TABLES) == chain_tables


def test_every_catalog_query_applies_the_exclusion() -> None:
    for query in (
        schema_fingerprint._COLUMNS,
        schema_fingerprint._CONSTRAINTS,
        schema_fingerprint._INDEXES,
    ):
        assert ":excluded_tables" in query.text
