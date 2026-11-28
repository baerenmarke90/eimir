"""Exercise registry consumers in isolation so imports from pytest cannot mask omissions."""

import json
import os
import subprocess
import sys
from pathlib import Path

from eimir.plugins.manifest import (
    ADMIN_CAPABILITIES,
    PLUGIN_TABLES,
    PRO_CAPABILITIES,
)
from tests.support.plugins import (
    admin_distribution_installed,
    pro_distribution_installed,
)

BACKEND = Path(__file__).resolve().parents[2]
REGISTRY = """
from eimir.db.registry import load_all_models
load_all_models()
from eimir.db.base import Base
print(json.dumps(sorted(Base.metadata.tables)))
"""
ALEMBIC = """
from alembic.config import Config
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory
cfg = Config()
cfg.set_main_option('script_location', 'alembic')
script = ScriptDirectory.from_config(cfg)
def capture(revisions, context):
    print(json.dumps(sorted(context.opts['target_metadata'].tables)))
    return []
with EnvironmentContext(cfg, script, as_sql=True, fn=capture, destination_rev='head'):
    script.run_env()
"""
FIXTURE = """
from unittest.mock import MagicMock, patch
from sqlalchemy import MetaData
from eimir.plugins.manifest import PLUGIN_TABLE_NAMES
from tests import conftest
def capture(metadata, engine):
    print(json.dumps(sorted(metadata.tables)))
# Without eimir-pro the fixture expects the migrated plugin tables.
migrated = MagicMock()
migrated.get_table_names.return_value = PLUGIN_TABLE_NAMES
with (patch.object(conftest, 'DATABASE_AVAILABLE', True),
      patch.object(conftest, 'create_engine'),
      patch.object(conftest, 'inspect', return_value=migrated),
      patch.object(MetaData, 'create_all', capture),
      patch.object(MetaData, 'drop_all')):
    fixture = conftest.engine.__wrapped__()
    next(fixture)
    next(fixture, None)
"""


def _tables(program: str) -> set[str]:
    # The inherited path keeps a plugin distribution importable that is not installed
    # into the environment (a source checkout of the operator plugin).
    inherited = os.environ.get("PYTHONPATH")
    path = [str(BACKEND / "src"), str(BACKEND), *([inherited] if inherited else [])]
    process = subprocess.run(
        [sys.executable, "-c", "import json\n" + program],
        cwd=BACKEND,
        env=os.environ
        | {
            "PYTHONPATH": os.pathsep.join(path),
            "EIMIR_TEST_DATABASE_URL": "",
            "EIMIR_DATABASE_URL": "postgresql+psycopg://fixture@localhost/unused",
        },
        check=True,
        capture_output=True,
        text=True,
    )
    return set(
        json.loads(next(line for line in process.stdout.splitlines() if line.startswith("[")))
    )


def test_registry_migrations_and_test_engine_agree_in_fresh_processes() -> None:
    production = _tables(REGISTRY)
    assert "accounts" in production
    assert "privacy_probes" not in production
    assert _tables(ALEMBIC) == production
    # With the Pro distribution installed the test engine also creates the plugin
    # tables, as the migrations do, so the Core-only configuration has them too.
    # The models of an installed plugin also cover its chain tables, which the
    # fixture drops again right after creating them.
    plugin_tables: set[str] = set()
    if pro_distribution_installed():
        plugin_tables |= _owned_tables(PRO_CAPABILITIES)
    if admin_distribution_installed():
        plugin_tables |= _owned_tables(ADMIN_CAPABILITIES)
    assert _tables(FIXTURE) == production | {"privacy_probes"} | plugin_tables


def _owned_tables(capabilities: frozenset[str]) -> set[str]:
    return {row.table for row in PLUGIN_TABLES if row.capability.value in capabilities}
