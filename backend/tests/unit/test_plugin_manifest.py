"""The Core manifest describes every plugin table (Decision 0017, decision 4).

Deletion, retention, encryption and export must stay correct when a plugin is
not loaded, so Core cannot learn plugin tables from the plugin's models alone.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import MetaData, Table

from eimir.db.base import Base
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.db.registry import MODEL_MODULES, load_all_models
from eimir.entitlements.models import Capability
from eimir.entitlements.service import ALL_PREMIUM_CAPABILITIES
from eimir.plugins.manifest import (
    ADMIN_CAPABILITIES,
    PLUGIN_CAPABILITIES,
    PLUGIN_TABLE_NAMES,
    PLUGIN_TABLES,
    PRO_CAPABILITIES,
    protected_payload_tables,
)
from eimir.security import lifecycle
from tests.support.plugins import (
    CHAIN_PLUGIN_TABLES,
    admin_distribution_installed,
    admin_plugin_object,
    pro_plugin_object,
    require_pro_distribution,
    requires_pro,
)

BACKEND = Path(__file__).resolve().parents[2]
# The operator plugin's tables; the Pro chain's gift code tables are chain tables too.
ADMIN_TABLES = {
    row.table
    for row in PLUGIN_TABLES
    if row.table in CHAIN_PLUGIN_TABLES and row.capability.value in ADMIN_CAPABILITIES
}


def _plugin_model_modules() -> set[str]:
    modules = set(pro_plugin_object().model_modules())
    if admin_distribution_installed():
        modules |= set(admin_plugin_object().model_modules())
    return modules


def _load() -> None:
    # The Pro plugin is the reference in both configurations; Core-only does not
    # import its models through the registry. Without ``eimir-pro`` it skips. The
    # operator plugin joins when its distribution is installed.
    load_all_models()
    for module in _plugin_model_modules():
        import_module(module)


def _tables_of_modules(modules: set[str]) -> set[str]:
    _load()
    return {
        table.name
        for mapper in Base.registry.mappers
        if mapper.class_.__module__ in modules
        for table in mapper.tables
    }


def _table(name: str) -> Table:
    if name in ADMIN_TABLES and not admin_distribution_installed():
        pytest.skip("The operator plugin distribution (eimir-admin) is not installed.")
    _load()
    return Base.metadata.tables[name]


def test_every_table_of_every_plugin_has_a_manifest_row() -> None:
    plugin_tables = _tables_of_modules(_plugin_model_modules())

    assert plugin_tables
    # Without the operator distribution its manifest rows have no model to compare.
    expected = PLUGIN_TABLE_NAMES - (set() if admin_distribution_installed() else ADMIN_TABLES)
    assert plugin_tables == expected


@pytest.mark.skipif(not admin_distribution_installed(), reason="eimir-admin is not installed")
def test_the_operator_plugin_tables_are_exactly_its_manifest_rows() -> None:
    owned = {row.table for row in PLUGIN_TABLES if row.capability.value in ADMIN_CAPABILITIES}

    assert _tables_of_modules(set(admin_plugin_object().model_modules())) == owned == ADMIN_TABLES


def test_every_manifest_row_is_unique() -> None:
    assert len(PLUGIN_TABLES) == len(PLUGIN_TABLE_NAMES)


def test_core_model_modules_contribute_no_plugin_table() -> None:
    assert not set(MODEL_MODULES) & _plugin_model_modules()
    assert not _tables_of_modules(set(MODEL_MODULES)) & PLUGIN_TABLE_NAMES


@pytest.mark.parametrize("row", PLUGIN_TABLES, ids=lambda row: row.table)
def test_every_manifest_row_names_an_existing_table_with_its_columns(row) -> None:  # type: ignore[no-untyped-def]
    table = _table(row.table)
    if row.space_column is not None:
        targets = {key.target_fullname for key in table.columns[row.space_column].foreign_keys}
        assert targets == {"spaces.id"}
    else:
        assert "space_id" not in table.columns
    for column in row.account_columns:
        assert column in table.columns, column


@pytest.mark.parametrize("row", PLUGIN_TABLES, ids=lambda row: row.table)
def test_every_account_reference_is_a_declared_scope_column(row) -> None:  # type: ignore[no-untyped-def]
    references = {
        column.name
        for column in _table(row.table).columns
        if any(key.target_fullname == "accounts.id" for key in column.foreign_keys)
    }

    assert references <= set(row.account_columns)


@pytest.mark.parametrize("row", PLUGIN_TABLES, ids=lambda row: row.table)
def test_every_encrypted_plugin_table_declares_its_crypto_context(row) -> None:  # type: ignore[no-untyped-def]
    column = _table(row.table).columns.get("payload")
    if column is not None and isinstance(column.type, ProtectedPayloadJSON):
        assert row.protected_payload_context == column.type.payload_type.crypto_context()
    else:
        assert row.protected_payload_context is None


def test_encryption_lifecycle_covers_plugin_tables_without_the_plugin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Migration, rotation and verification must not skip an unloaded plugin's tables."""
    monkeypatch.setattr(lifecycle, "load_all_models", lambda: None)
    monkeypatch.setattr(lifecycle, "Base", SimpleNamespace(metadata=MetaData()))

    discovered = lifecycle.payload_tables()

    assert [(entry.name, entry.context, entry.payload_type) for entry in discovered] == sorted(
        (row.table, row.protected_payload_context, None) for row in protected_payload_tables()
    )


@requires_pro
def test_with_the_plugin_loaded_encryption_keeps_the_payload_models() -> None:
    discovered = {entry.name: entry for entry in lifecycle.payload_tables()}

    for row in protected_payload_tables():
        entry = discovered[row.table]
        assert entry.payload_type is not None
        assert entry.context == row.protected_payload_context


INCLUDE_OBJECT = """
from alembic.config import Config
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory
from sqlalchemy import MetaData, Table
# The committed configuration, so its logging setup applies as in the migrate service.
cfg = Config('alembic.ini')
script = ScriptDirectory.from_config(cfg)
def capture(revisions, context):
    include = context.opts['include_object']
    def table(name):
        return Table(name, MetaData())
    print(json.dumps({
        'absent_plugin_table': include(table('gardens'), 'gardens', 'table', True, None),
        'present_plugin_table': include(
            table('gardens'), 'gardens', 'table', True, table('gardens')
        ),
        'absent_core_table': include(table('accounts'), 'accounts', 'table', True, None),
    }))
    return []
with EnvironmentContext(cfg, script, as_sql=True, fn=capture, destination_rev='head'):
    script.run_env()
"""


def _run(program: str, **environment: str) -> subprocess.CompletedProcess[str]:
    inherited = os.environ.get("PYTHONPATH")
    path = [str(BACKEND / "src"), str(BACKEND), *([inherited] if inherited else [])]
    return subprocess.run(
        [sys.executable, "-c", "import json\n" + program],
        cwd=BACKEND,
        env=os.environ
        | {
            "PYTHONPATH": os.pathsep.join(path),
            "EIMIR_TEST_DATABASE_URL": "",
            "EIMIR_DATABASE_URL": "postgresql+psycopg://fixture@localhost/unused",
        }
        | environment,
        capture_output=True,
        text=True,
    )


def test_autogenerate_keeps_plugin_tables_whose_plugin_is_not_loaded() -> None:
    process = _run(INCLUDE_OBJECT)

    assert process.returncode == 0, process.stderr
    line = next(line for line in process.stdout.splitlines() if line.startswith("{"))
    assert json.loads(line) == {
        "absent_plugin_table": False,
        "present_plugin_table": True,
        "absent_core_table": True,
    }


def test_migrate_refuses_to_start_without_its_named_plugin() -> None:
    process = _run(INCLUDE_OBJECT, EIMIR_PLUGINS="missing")

    assert process.returncode != 0
    assert "unknown plugin 'missing'" in process.stderr


def test_migrate_names_its_plugins_at_startup() -> None:
    require_pro_distribution()
    process = _run(INCLUDE_OBJECT, EIMIR_PLUGINS="pro")

    assert process.returncode == 0, process.stderr
    assert "Plugins loaded: pro (seam version" in process.stderr


@pytest.mark.parametrize("row", PLUGIN_TABLES, ids=lambda row: row.table)
def test_every_lifecycle_rule_names_existing_columns(row) -> None:  # type: ignore[no-untyped-def]
    from eimir.plugins.manifest import PLUGIN_ENGAGEMENT_TARGETS, LifecycleEvent

    table = _table(row.table)
    for rule in row.purge_on:
        if rule.event is LifecycleEvent.ACCOUNT_DELETED:
            assert rule.account_column in row.account_columns
        else:
            assert row.space_column is not None
            assert rule.account_column is None or rule.account_column in row.account_columns
        for name in rule.dependents:
            dependent = _table(name)
            assert {"space_id", "account_id"} <= set(dependent.columns.keys()), name
            assert name in PLUGIN_TABLE_NAMES
    for name in row.expires_columns:
        assert name in table.columns, name
    if row.notification_targets or row.attachment:
        assert "id" in table.columns
    assert set(row.notification_targets) <= PLUGIN_ENGAGEMENT_TARGETS
    if row.attachment is not None:
        assert row.attachment.column in table.columns
        assert row.attachment.owner_column in row.account_columns


def test_support_operator_is_plugin_owned_and_not_premium() -> None:
    operator = Capability.SUPPORT_OPERATOR.value

    assert operator == "support.operator"
    assert {operator} == ADMIN_CAPABILITIES
    assert PLUGIN_CAPABILITIES == PRO_CAPABILITIES | ADMIN_CAPABILITIES
    assert not PRO_CAPABILITIES & ADMIN_CAPABILITIES
    assert operator not in ALL_PREMIUM_CAPABILITIES


def test_pro_capabilities_include_gift_codes_operator() -> None:
    operator = Capability.GIFT_CODES_OPERATOR.value

    assert operator == "gift_codes.operator"
    assert operator in PRO_CAPABILITIES
    assert operator in PLUGIN_CAPABILITIES
    assert operator not in ALL_PREMIUM_CAPABILITIES
