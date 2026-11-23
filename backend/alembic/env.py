"""Alembic environment.

The connection comes from the environment rather than alembic.ini because
credentials do not belong in a committed file. Only `DatabaseSettings` is
loaded instead of the complete application configuration: a migration needs
the database, but neither a cursor-signing key nor SMTP nor a public address.
Depending on those would make `alembic upgrade head` fail in production
before the first revision ran.

All models are imported here so `--autogenerate` can see them. A missing
import can produce a migration that tries to drop a table. Plugin models come
from the plugins named in `EIMIR_PLUGINS` (Decision 0017); a named plugin that
cannot be loaded stops the migration. Without the plugin, its tables stay in
the database and in the Core chain, so autogenerate must not propose dropping
them: `include_object` skips the tables of the plugin manifest.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import CheckConstraint, engine_from_config, pool
from sqlalchemy.schema import SchemaItem

from eimir.config import DatabaseSettings
from eimir.db.base import Base
from eimir.db.registry import load_all_models
from eimir.plugins.loader import loaded_plugins
from eimir.plugins.manifest import PLUGIN_TABLE_NAMES
from eimir.plugins.migrations import is_upgrade_to_head, upgrade_plugin_chains


def _migration_connection() -> str:
    """Return the database URL for this run or fail with a clear diagnostic."""
    try:
        return DatabaseSettings().database_url
    except ValidationError as error:
        raise SystemExit(
            "Migration cannot start: EIMIR_DATABASE_URL is missing or invalid. "
            "Expected a PostgreSQL URL, for example "
            "postgresql+psycopg://user:password@host:5432/database. "
            f"Cause: {error}"
        ) from error


config = context.config
config.set_main_option("sqlalchemy.url", _migration_connection())

# The CLI owns its logging setup. Embedded migrations share the caller's handlers.
if config.config_file_name is not None and config.cmd_opts is not None:
    fileConfig(config.config_file_name)

load_all_models()
target_metadata = Base.metadata


def _type_bound_checks(table_name: str) -> set[str]:
    """Return CHECK names owned by a column type rather than the table."""
    table = Base.metadata.tables.get(table_name)
    if table is None:
        return set()
    return {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
        and getattr(constraint, "_type_bound", False)
        and constraint.name is not None
    }


def include_object(
    object_: SchemaItem,
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to: SchemaItem | None,
) -> bool:
    """Exclude type-bound CHECK constraints and absent plugin tables from comparison."""
    if type_ == "table" and reflected and compare_to is None and name in PLUGIN_TABLE_NAMES:
        # A plugin table without a model in this process: its plugin is not loaded.
        return False
    if type_ != "check_constraint" or not reflected or name is None:
        return True
    table = getattr(object_, "table", None)
    if table is None:
        return True
    return name not in _type_bound_checks(table.name)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
        # The plugin chains follow an upgrade that left Core at its head, each
        # with its own version table (Decision 0017, decision 6).
        if is_upgrade_to_head(
            context.get_context(), ScriptDirectory.from_config(config).get_heads()
        ):
            if connection.in_transaction():
                # Only the read of the Core heads above; nothing to keep.
                connection.commit()
            upgrade_plugin_chains(connection, loaded_plugins().plugins)
    # After the migration, read-only and never fatal: data of plugins that are
    # not loaded (Decision 0017).
    from eimir.plugins.dormant import warn_dormant_plugin_data_once

    warn_dormant_plugin_data_once(connectable)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
