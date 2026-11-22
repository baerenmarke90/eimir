"""Run the plugins' own migration chains after the Core chain (Decision 0017, decision 6).

Every plugin chain records its state in its own version table, so a Core-only
``migrate`` never meets a plugin revision and a Core-only start after Pro keeps
working. The chains run in the ``migrate`` process, after Core reached its head
and in the same deploy step: ``alembic upgrade head`` calls
``upgrade_plugin_chains`` from ``alembic/env.py`` once the Core revisions are
committed. A chain without revisions does nothing and creates no table. A
failing plugin revision rolls its transaction back and fails ``migrate``, which
blocks the runtime exactly like a failing Core revision.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable
from typing import TYPE_CHECKING, Any

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory

if TYPE_CHECKING:
    from sqlalchemy import Connection

    from eimir.plugins.contract import MigrationSpec, ProPlugin

log = logging.getLogger(__name__)

CORE_VERSION_TABLE = "alembic_version"


def _script(spec: MigrationSpec) -> ScriptDirectory:
    config = Config()
    config.set_main_option("script_location", spec.script_location)
    return ScriptDirectory.from_config(config)


def upgrade_chain(connection: Connection, name: str, spec: MigrationSpec) -> bool:
    """Upgrade one plugin chain to its heads; ``False`` when it has no revisions.

    Runs in its own transaction on ``connection``, which must not be inside one,
    and leaves no transaction open.
    """
    if spec.version_table == CORE_VERSION_TABLE:
        raise ValueError(
            f"Plugin {name!r} must not record its revisions in the Core version table."
        )
    script = _script(spec)
    if not script.get_heads():
        return False

    def upgrade(revision: Any, context: MigrationContext) -> Any:
        return script._upgrade_revs("heads", revision)

    with connection.begin():
        context = MigrationContext.configure(
            connection,
            opts={"version_table": spec.version_table, "fn": upgrade, "script": script},
        )
        with Operations.context(context):
            context.run_migrations()
        heads = sorted(context.get_current_heads())
    log.info(
        "Plugin %r migrations are at %s.",
        name,
        ", ".join(heads),
        extra={"plugin": name, "version_table": spec.version_table, "heads": heads},
    )
    return True


def upgrade_plugin_chains(connection: Connection, plugins: Iterable[ProPlugin]) -> list[str]:
    """Upgrade every loaded plugin's chain in load order; return the names that ran."""
    ran: list[str] = []
    for plugin in plugins:
        spec = plugin.migrations()
        if spec is not None and upgrade_chain(connection, plugin.name, spec):
            ran.append(plugin.name)
    return ran


def is_upgrade_to_head(migration_context: MigrationContext, core_heads: Iterable[str]) -> bool:
    """Whether this Alembic run was an ``upgrade`` that left Core at its head.

    Plugin chains follow only that command: ``revision --autogenerate``,
    ``stamp``, ``downgrade`` or an upgrade to an older Core revision must not
    run them.
    """
    function: Callable[..., Any] | None = getattr(migration_context, "_migrations_fn", None)
    if function is None or getattr(function, "__module__", None) != "alembic.command":
        return False
    if getattr(function, "__name__", None) != "upgrade":
        return False
    return set(migration_context.get_current_heads()) == set(core_heads)
