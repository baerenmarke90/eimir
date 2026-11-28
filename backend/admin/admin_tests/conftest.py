"""Shared setup of the operator plugin tests (#2189).

The plugin is a separate distribution on top of Core. The metadata tests need no
database. The integration tests reuse the Core fixtures (database engine and
session) the same way the Pro tests do.
"""

from __future__ import annotations

import importlib.util
from collections.abc import Iterator

import pytest
from sqlalchemy import text

# Importing the Core conftest also applies its test environment defaults. The
# fixtures are re-exported so they reach the operator plugin tests.
from tests.conftest import (  # noqa: F401  (pytest fixtures)
    _media_root,
    _restore_pillow_pixel_limit,
    engine,
    session,
)

# The Core-only configuration installs no operator distribution. Its modules are
# not even imported there (no skip records either, which the Core-only skip-reason
# check in CI would flag), exactly as the Pro feature tests are not collected.
collect_ignore_glob = ["*"] if importlib.util.find_spec("eimir_admin") is None else []


@pytest.fixture(scope="module", autouse=True)
def _plugin_tables(request: pytest.FixtureRequest) -> Iterator[None]:
    """The plugin's own tables exist only while its tests run.

    Core migrations that downgrade past ``support_reports`` cannot drop that table
    while the ticket table references it, so the shared test database never keeps
    the plugin chain's tables. They are dropped again, before the report table,
    after each module.
    """
    from tests.conftest import DATABASE_AVAILABLE

    if not DATABASE_AVAILABLE:
        yield
        return
    from eimir_admin.reply_templates.models import SupportReplyTemplate
    from eimir_admin.support_tickets.models import SupportReportTicket

    database = request.getfixturevalue("engine")
    SupportReportTicket.__table__.create(database, checkfirst=True)  # type: ignore[attr-defined]
    SupportReplyTemplate.__table__.create(database, checkfirst=True)  # type: ignore[attr-defined]
    try:
        yield
    finally:
        with database.begin() as connection:
            connection.execute(text("DROP TABLE IF EXISTS support_report_tickets"))
            connection.execute(text("DROP TABLE IF EXISTS support_reply_templates"))
