"""Allowlist guard (Decision 0020): every Core table is exported or deliberately excluded.

The export knowledge lives only here, in Pro. Core holds no list. A pull request that adds a
table to the Core schema fails this test until the table is classified, so a new feature
cannot leave the operator export silently incomplete. The garden slice (S1b) moves its six
tables from the excluded list to the exported list.
"""

from __future__ import annotations

from eimir_pro.portability.allowlist import (
    ACCOUNT_DOCUMENT_TABLES,
    EXCLUDED_TABLES,
    FILE_TABLES,
    INSERT_ORDER,
)

from eimir.db.base import Base
from eimir.db.registry import load_all_models

EXPORTED_TABLES = {name for names in FILE_TABLES.values() for name in names}


# Tables only the test suite attaches to ``Base.metadata`` (see tests/support); they exist in
# no migration and no production database, so they are never part of a bundle.
TEST_ONLY_TABLES = frozenset({"privacy_probes"})


def _schema_tables() -> set[str]:
    load_all_models()
    return set(Base.metadata.tables) - TEST_ONLY_TABLES


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
