"""Integration setup of the operator plugin tests (#2189).

The Core ``client`` fixture builds the app from the plugins this process
resolved. CI names ``pro`` only, so these tests load the operator plugin for
their duration, in addition to whatever else is loaded, exactly as
``EIMIR_PLUGINS=pro,admin`` would.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.plugin import plugin as admin_plugin

from eimir.plugins import loader
from tests.conftest import client, production_client  # noqa: F401  (pytest fixtures)


@pytest.fixture(autouse=True)
def operator_plugin_loaded() -> Iterator[None]:
    previous = loader.loaded_plugins()
    others = tuple(plugin for plugin in previous.plugins if plugin.name != admin_plugin.name)
    loader._loaded = loader.LoadedPlugins((*others, admin_plugin))
    try:
        yield
    finally:
        loader._loaded = previous
