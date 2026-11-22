"""Exercise registry consumers in isolation so imports from pytest cannot mask omissions."""

import json
import os
import subprocess
import sys
from pathlib import Path

from eimir.plugins.manifest import PLUGIN_TABLE_NAMES
from tests.support.plugins import pro_distribution_installed

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
from unittest.mock import patch
from sqlalchemy import MetaData
from tests import conftest
def capture(metadata, engine):
    print(json.dumps(sorted(metadata.tables)))
with (patch.object(conftest, 'DATABASE_AVAILABLE', True),
      patch.object(conftest, 'create_engine'),
      patch.object(MetaData, 'create_all', capture),
      patch.object(MetaData, 'drop_all')):
    fixture = conftest.engine.__wrapped__()
    next(fixture)
    next(fixture, None)
"""


def _tables(program: str) -> set[str]:
    process = subprocess.run(
        [sys.executable, "-c", "import json\n" + program],
        cwd=BACKEND,
        env=os.environ
        | {
            "PYTHONPATH": os.pathsep.join([str(BACKEND / "src"), str(BACKEND)]),
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
    plugin_tables = PLUGIN_TABLE_NAMES if pro_distribution_installed() else set()
    assert _tables(FIXTURE) == production | {"privacy_probes"} | plugin_tables
