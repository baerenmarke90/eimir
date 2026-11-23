"""Shared setup of the Pro tests (Decision 0017, Phase 2, #2182).

The Pro tests reuse the Core test support (database fixtures, helpers): in this
repository it is the ``tests`` package next to ``pro/``; an extracted Pro
repository installs it from the pinned Core checkout. Pro tests need the Pro
plugin loaded; the Core-only configuration (``EIMIR_PLUGINS=""``) does not
collect them at all.
"""

from __future__ import annotations

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


def pytest_ignore_collect(collection_path, config):  # type: ignore[no-untyped-def]
    from tests.support.plugins import plugins_loaded

    return None if plugins_loaded() else True
