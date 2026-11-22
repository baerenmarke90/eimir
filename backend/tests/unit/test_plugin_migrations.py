"""Plugin migration chains follow the Core chain (Decision 0017, decision 6; #2182).

The database half lives in ``tests/integration/test_plugin_migrations.py``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from eimir.plugins.contract import MigrationSpec
from eimir.plugins.migrations import (
    CORE_VERSION_TABLE,
    is_upgrade_to_head,
    upgrade_chain,
    upgrade_plugin_chains,
)

_RECORDING_ENV = """
import json
from alembic import context

context.configure(url="postgresql://probe/probe", literal_binds=True)
function = context.get_context()._migrations_fn
with open({out!r}, "a", encoding="utf-8") as stream:
    stream.write(json.dumps([function.__module__, function.__name__]) + chr(10))
with context.begin_transaction():
    context.run_migrations()
"""

_REVISION = """
revision = "probe_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
"""


class _UnusedConnection:
    def __getattr__(self, name: str) -> object:
        raise AssertionError(f"An empty chain must not touch the database ({name}).")


def _script_directory(tmp_path: Path, *, revisions: bool) -> Path:
    location = tmp_path / "chain"
    (location / "versions").mkdir(parents=True)
    if revisions:
        (location / "versions" / "probe_0001.py").write_text(_REVISION, encoding="utf-8")
    return location


def _recorded_commands(tmp_path: Path) -> list[list[str]]:
    location = _script_directory(tmp_path, revisions=True)
    out = tmp_path / "functions.jsonl"
    (location / "env.py").write_text(_RECORDING_ENV.format(out=str(out)), encoding="utf-8")
    config = Config()
    config.set_main_option("script_location", str(location))
    command.upgrade(config, "head", sql=True)
    command.stamp(config, "head", sql=True)
    command.downgrade(config, "probe_0001:base", sql=True)
    return [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]


class _Context:
    def __init__(self, function: object, heads: tuple[str, ...]) -> None:
        self._migrations_fn = function
        self._heads = heads

    def get_current_heads(self) -> tuple[str, ...]:
        return self._heads


def test_only_alembic_upgrade_is_recognized_as_an_upgrade(tmp_path: Path) -> None:
    # Pins the Alembic internals the predicate reads: the command closures.
    upgrade, stamp, downgrade = _recorded_commands(tmp_path)

    assert upgrade == ["alembic.command", "upgrade"]
    assert stamp[1] != "upgrade"
    assert downgrade[1] != "upgrade"


def test_plugin_chains_follow_only_an_upgrade_that_reached_the_core_head() -> None:
    def upgrade() -> None: ...

    upgrade.__module__ = "alembic.command"

    def stamp() -> None: ...

    stamp.__module__ = "alembic.command"

    assert is_upgrade_to_head(_Context(upgrade, ("0170",)), ["0170"])  # type: ignore[arg-type]
    assert not is_upgrade_to_head(_Context(upgrade, ("0150",)), ["0170"])  # type: ignore[arg-type]
    assert not is_upgrade_to_head(_Context(stamp, ("0170",)), ["0170"])  # type: ignore[arg-type]
    assert not is_upgrade_to_head(_Context(None, ("0170",)), ["0170"])  # type: ignore[arg-type]


def test_a_chain_without_revisions_does_nothing(tmp_path: Path) -> None:
    location = _script_directory(tmp_path, revisions=False)
    spec = MigrationSpec(script_location=str(location), version_table="alembic_version_probe")

    assert upgrade_chain(_UnusedConnection(), "probe", spec) is False  # type: ignore[arg-type]


def test_a_plugin_without_a_chain_is_skipped() -> None:
    class _NoChain:
        name = "probe"

        def migrations(self) -> None:
            return None

    assert upgrade_plugin_chains(_UnusedConnection(), [_NoChain()]) == []  # type: ignore[arg-type,list-item]


def test_a_plugin_cannot_use_the_core_version_table(tmp_path: Path) -> None:
    location = _script_directory(tmp_path, revisions=True)
    spec = MigrationSpec(script_location=str(location), version_table=CORE_VERSION_TABLE)

    with pytest.raises(ValueError, match="Core version table"):
        upgrade_chain(_UnusedConnection(), "probe", spec)  # type: ignore[arg-type]
