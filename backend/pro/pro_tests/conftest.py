"""Shared setup of the Pro tests (Decision 0017, Phase 2, #2182).

The Pro tests reuse the Core test support (database fixtures, helpers): in this
repository it is the ``tests`` package next to ``pro/``; an extracted Pro
repository installs it from the pinned Core checkout. Pro tests need the Pro
plugin loaded; the Core-only configuration (``EIMIR_PLUGINS=""``) does not
collect them at all.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import text

# Importing the Core conftest also applies its test environment defaults. The
# fixtures are re-exported so they reach the Pro tests, the autouse ones too.
from tests.conftest import (  # noqa: F401  (pytest fixtures)
    _media_root,
    _restore_pillow_pixel_limit,
    client,
    encryption,
    engine,
    production_client,
    session,
)

# The tables of the Pro migration chain, children first (ServerAdmin part 5).
_CHAIN_TABLES = ("gift_codes", "gift_code_batches")


def pytest_ignore_collect(collection_path, config):  # type: ignore[no-untyped-def]
    from tests.support.plugins import plugins_loaded

    return None if plugins_loaded() else True


@pytest.fixture(scope="module", autouse=True)
def _pro_chain_tables(request: pytest.FixtureRequest) -> Iterator[None]:
    """The Pro chain's own tables exist only while the Pro tests run.

    Core migrations that downgrade past ``accounts``, ``spaces`` or
    ``entitlement_grants`` cannot drop them while the gift code tables reference
    them, so the shared test database never keeps these tables. They are dropped
    again, children first, after each module.
    """
    from tests.conftest import DATABASE_AVAILABLE

    if not DATABASE_AVAILABLE:
        yield
        return
    from eimir_pro.gift_codes import models  # noqa: F401  (registers the tables)

    from eimir.db.base import Base

    database = request.getfixturevalue("engine")
    Base.metadata.create_all(
        database, tables=[Base.metadata.tables[name] for name in reversed(_CHAIN_TABLES)]
    )
    try:
        yield
    finally:
        with database.begin() as connection:
            for name in _CHAIN_TABLES:
                connection.execute(text(f"DROP TABLE IF EXISTS {name}"))
