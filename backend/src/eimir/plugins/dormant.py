"""Startup warning for plugin data whose plugin is not loaded (Decision 0017, decision 5).

A Core instance can run without a plugin after it once ran with it. The data
stays where it is: the manifest keeps deleting and expiring it, and it returns
to use when the plugin is loaded again. An operator should still learn that it
is there, so each process start logs one warning that names the capability
groups, the tables and how many rows they hold.

The check only reads. It logs table names and row counts, never content, IDs or
anything personal. Counts are bounded (``LIMIT``), so a large table costs no full
scan. A missing table or a database error never stops the start; the warning is
then skipped and the reason goes to the debug log.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterator
from contextlib import contextmanager, nullcontext

from sqlalchemy import Connection, Engine, literal_column, select, table
from sqlalchemy import func as sql_func

from eimir.plugins.lifecycle import absent_tables

log = logging.getLogger(__name__)

COUNT_LIMIT = 1000
"""Counts above this value are reported as "at least" the limit."""


@contextmanager
def _reading(bind: Engine | Connection) -> Iterator[Connection]:
    if isinstance(bind, Connection):
        yield bind
        return
    # Autocommit: a failing statement for one table does not abort the others.
    with bind.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        yield connection


def dormant_plugin_data(bind: Engine | Connection) -> dict[str, dict[str, int]]:
    """Return ``{capability: {table: bounded row count}}`` for absent plugins' non-empty tables.

    With an open ``Connection`` each table is read inside a savepoint, so a failing
    statement leaves the caller's transaction usable.
    """
    found: dict[str, dict[str, int]] = {}
    rows = absent_tables()
    if not rows:
        return found
    with _reading(bind) as connection:
        for row in rows:
            bounded = select(sql_func.count()).select_from(
                select(literal_column("1"))
                .select_from(table(row.table))
                .limit(COUNT_LIMIT + 1)
                .subquery()
            )
            try:
                with connection.begin_nested() if isinstance(bind, Connection) else nullcontext():
                    count = int(connection.execute(bounded).scalar_one())
            except Exception as error:
                # A missing table (for example before the migration) or a database error.
                log.debug(
                    "Dormant plugin data check skipped a table.",
                    extra={"table": row.table, "error_type": type(error).__name__},
                )
                continue
            if count:
                found.setdefault(row.capability.value, {})[row.table] = count
    return found


def _describe(count: int) -> str:
    return f"at least {COUNT_LIMIT}" if count > COUNT_LIMIT else str(count)


def warn_dormant_plugin_data(bind: Engine | Connection) -> dict[str, dict[str, int]]:
    """Log one warning if absent plugins left data; return what was found."""
    try:
        found = dormant_plugin_data(bind)
    except Exception as error:
        log.debug("Dormant plugin data check skipped.", extra={"error_type": type(error).__name__})
        return {}
    if not found:
        return found
    groups = "; ".join(
        f"{capability}: "
        + ", ".join(f"{name} ({_describe(count)})" for name, count in sorted(tables.items()))
        for capability, tables in sorted(found.items())
    )
    log.warning(
        "Data of plugins that are not loaded: %s. It stays untouched and is used again when the "
        "plugin is loaded; check EIMIR_PLUGINS.",
        groups,
        extra={
            "dormant_plugin_data": {
                capability: {
                    name: min(count, COUNT_LIMIT) for name, count in sorted(tables.items())
                }
                for capability, tables in sorted(found.items())
            },
            "count_limit": COUNT_LIMIT,
        },
    )
    return found


_lock = threading.Lock()
_warned = False


def warn_dormant_plugin_data_once(engine: Engine) -> None:
    """``warn_dormant_plugin_data`` at most once per process."""
    global _warned
    with _lock:
        if _warned:
            return
        _warned = True
    warn_dormant_plugin_data(engine)
