"""Allowlist guard (Decision 0020): every Core table is exported or deliberately excluded.

The export knowledge lives only here, in Pro. Core holds no list. A pull request that adds a
table to the Core schema fails this test until the table is classified, so a new feature
cannot leave the operator export silently incomplete. The six garden tables are exported
(slice S1b); games and the other set-up-again areas stay deliberately excluded.
"""

from __future__ import annotations

from eimir_pro.portability.allowlist import (
    ACCOUNT_ARRAY_COLUMNS,
    ACCOUNT_DOCUMENT_TABLES,
    EXCLUDED_TABLES,
    FILE_TABLES,
    GARDEN_TABLES,
    INSERT_ORDER,
    OPTIONAL_TABLES,
    TABLE_ACCOUNT_COLUMNS,
    account_columns,
)
from eimir_pro.portability.archive import _ALLOWED_ROOT_FILES

from eimir.db.base import Base
from eimir.db.registry import load_all_models
from eimir.plugins.manifest import PLUGIN_TABLE_NAMES

EXPORTED_TABLES = {name for names in FILE_TABLES.values() for name in names}


# Tables only the test suite attaches to ``Base.metadata`` (see tests/support); they exist in
# no migration and no production database, so they are never part of a bundle.
TEST_ONLY_TABLES = frozenset({"privacy_probes"})


def _schema_tables() -> set[str]:
    load_all_models()
    # The manifest names every plugin table, including the operator plugin's ticket table,
    # whose models exist only where that distribution is installed.
    return (set(Base.metadata.tables) | PLUGIN_TABLE_NAMES) - TEST_ONLY_TABLES


def test_every_core_table_is_exported_or_deliberately_excluded() -> None:
    classified = EXPORTED_TABLES | set(ACCOUNT_DOCUMENT_TABLES) | set(EXCLUDED_TABLES)
    unclassified = sorted(_schema_tables() - classified)
    assert not unclassified, (
        "These Core tables are neither exported nor deliberately excluded by the portability "
        "tool. Add each one to FILE_TABLES / ACCOUNT_DOCUMENT_TABLES (and verify export and "
        f"import), or to EXCLUDED_TABLES with the reason: {unclassified}"
    )


def test_the_classification_names_no_table_that_does_not_exist() -> None:
    classified = EXPORTED_TABLES | set(ACCOUNT_DOCUMENT_TABLES) | set(EXCLUDED_TABLES)
    assert sorted(classified - _schema_tables()) == []


def test_no_table_is_classified_twice() -> None:
    groups = [EXPORTED_TABLES, set(ACCOUNT_DOCUMENT_TABLES), set(EXCLUDED_TABLES)]
    for index, group in enumerate(groups):
        for other in groups[index + 1 :]:
            assert group & other == set()


def test_every_exclusion_and_account_table_carries_a_reason() -> None:
    for reasons in (ACCOUNT_DOCUMENT_TABLES, EXCLUDED_TABLES):
        assert all(reason.strip() for reason in reasons.values())


def test_every_file_table_is_inserted_exactly_once_in_a_defined_order() -> None:
    assert len(INSERT_ORDER) == len(set(INSERT_ORDER))
    # attachments are written separately by the media step.
    assert set(INSERT_ORDER) == EXPORTED_TABLES - {"attachments"}


def test_the_six_garden_tables_are_exported_and_games_are_not() -> None:
    assert set(GARDEN_TABLES) == {
        "gardens",
        "garden_plants",
        "garden_waterings",
        "garden_readers",
        "garden_visitor_names",
        "garden_bouquets",
    }
    assert set(GARDEN_TABLES) <= EXPORTED_TABLES
    assert set(GARDEN_TABLES).isdisjoint(EXCLUDED_TABLES)
    assert FILE_TABLES["garden.json"] == GARDEN_TABLES
    assert "garden.json" in _ALLOWED_ROOT_FILES
    for game_table in ("couple_games", "heart_hunt_rounds", "picture_ping_pong"):
        assert game_table in EXCLUDED_TABLES
        assert game_table not in EXPORTED_TABLES


def test_the_garden_tables_are_optional_and_a_plant_is_inserted_before_its_waterings() -> None:
    assert set(GARDEN_TABLES) == OPTIONAL_TABLES
    assert INSERT_ORDER.index("garden_plants") < INSERT_ORDER.index("garden_waterings")


def test_every_garden_column_that_holds_an_account_is_known_to_the_mapping() -> None:
    """A new account column in a garden table must be named here, or it would travel unmapped."""
    load_all_models()
    account_like = {"account_id", "sender_id", "receiver_id", "giver_id"}
    for name in GARDEN_TABLES:
        columns = set(Base.metadata.tables[name].columns.keys())
        assert (columns & account_like) <= account_columns(name), name
    assert TABLE_ACCOUNT_COLUMNS["garden_plants"] == {"sender_id", "receiver_id"}
    assert TABLE_ACCOUNT_COLUMNS["garden_bouquets"] == {"giver_id", "receiver_id"}
    assert {"garden_bouquets": {"flower_senders"}} == ACCOUNT_ARRAY_COLUMNS
    array_columns = {
        column.name
        for name in GARDEN_TABLES
        for column in Base.metadata.tables[name].columns
        if column.type.python_type is list and "sender" in column.name
    }
    assert array_columns == {"flower_senders"}


def test_support_reports_travel_in_the_personal_copy_but_the_ticket_link_does_not() -> None:
    """#2245: own reports and replies are served; the operator-side ticket link is not."""
    assert {"support_reports", "support_report_replies"} <= set(ACCOUNT_DOCUMENT_TABLES)
    assert {"support_reports", "support_report_replies"}.isdisjoint(EXCLUDED_TABLES)
    # Export-only: no Space file may carry them, so the import has no table to restore.
    assert {"support_reports", "support_report_replies"}.isdisjoint(EXPORTED_TABLES)
    assert "support_report_tickets" in EXCLUDED_TABLES
    assert "support_report_tickets" not in ACCOUNT_DOCUMENT_TABLES
    assert "support_report_tickets" not in EXPORTED_TABLES


def test_the_gift_code_tables_are_operator_data_and_never_exported() -> None:
    """ServerAdmin part 5: gift code batches and codes are operator-side, not couple content."""
    for name in ("gift_code_batches", "gift_codes"):
        assert name in EXCLUDED_TABLES
        assert name not in ACCOUNT_DOCUMENT_TABLES
        assert name not in EXPORTED_TABLES
        assert name not in INSERT_ORDER
