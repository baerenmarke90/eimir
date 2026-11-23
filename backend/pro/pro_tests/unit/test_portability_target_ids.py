"""Stable target IDs for imported records (#2141, kept by the portability tool).

The ID context must stay byte-identical to the one Core used, so a Space restored by the
tool recognises records an earlier Core import already added."""

from __future__ import annotations

from uuid import RFC_4122, UUID

from eimir_pro.portability.importer import _target_id

from eimir.core.ids import new_id


def test_the_same_source_lands_on_the_same_id_in_the_same_space() -> None:
    space, source = new_id(), new_id()
    assert _target_id(space, source) == _target_id(space, source)
    assert _target_id(space, source) != source


def test_another_space_or_source_gets_another_id() -> None:
    space, source = new_id(), new_id()
    assert _target_id(new_id(), source) != _target_id(space, source)
    assert _target_id(space, new_id()) != _target_id(space, source)


def test_the_id_is_a_uuid7_with_the_source_time_prefix() -> None:
    source = new_id()
    target = _target_id(new_id(), source)
    assert target.version == 7
    assert target.variant == RFC_4122
    assert target.bytes[:6] == source.bytes[:6]


def test_a_non_uuid7_source_still_gets_a_uuid7() -> None:
    target = _target_id(new_id(), UUID("12345678-1234-4234-8234-123456789abc"))
    assert target.version == 7


def test_every_imported_table_with_a_deferred_unique_constraint_is_known() -> None:
    """PostgreSQL rejects such a constraint as an ON CONFLICT arbiter (#2141)."""
    from eimir_pro.portability.allowlist import FILE_TABLES
    from eimir_pro.portability.importer import _DEFERRED_UNIQUE_TABLES, _ORDERED_CHILD_PARENTS
    from sqlalchemy import UniqueConstraint

    from eimir.db.base import Base
    from eimir.db.registry import load_all_models

    load_all_models()
    imported = {name for names in FILE_TABLES.values() for name in names}
    deferred = {
        table.name
        for table in Base.metadata.tables.values()
        if table.name in imported
        and any(
            isinstance(constraint, UniqueConstraint) and constraint.deferrable
            for constraint in table.constraints
        )
    }
    assert deferred == _DEFERRED_UNIQUE_TABLES
    # A present parent keeps its ordered rows, so their positions never conflict.
    assert deferred <= set(_ORDERED_CHILD_PARENTS)


def test_the_id_context_and_a_golden_value_match_what_core_assigned() -> None:
    """A Space restored by the tool must recognise what an earlier Core import added."""
    from eimir_pro.portability import importer

    assert importer._TARGET_ID_CONTEXT == b"eimir.transfer.target-id.v1\x00"
    assert str(
        _target_id(
            UUID("01994da7-d368-7af0-8b72-568457cb3398"),
            UUID("01994da7-d369-7af0-8b72-568457cb3399"),
        )
    ) == ("01994da7-d369-70f8-9505-d8b255cf6ddf")
