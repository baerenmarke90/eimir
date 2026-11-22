"""Plugin configurations of the backend suite (Decision 0017, acceptance criterion 4).

CI runs the suite twice: with the Pro plugin loaded (the default
``EIMIR_PLUGINS=pro``) and Core-only (``EIMIR_PLUGINS=``). In the Core-only run
the Pro feature test modules are not collected and tests marked
``requires_pro`` are skipped; everything else, including the Core-only
assertions, runs in both.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

import pytest

from eimir.plugins import loader

requires_pro = pytest.mark.requires_pro
"""The test needs the Pro plugin loaded; skipped in the Core-only configuration."""

PRO_TEST_MODULES = frozenset(
    {
        # The recap modules compose recaps, which needs `relationship.passport`,
        # a capability only a loaded plugin provides; what stays readable and
        # writable without it is covered by `integration/test_core_only_recaps.py`.
        "integration/test_shared_experiences.py",
        "unit/test_account_table_lifecycle.py",
        "unit/test_m3_plan_openapi.py",
        # Recap composition is plugin code; the Core reads stay in
        # `unit/test_recap_composition.py`.
    }
)
"""Test modules of Pro features, relative to ``tests/``; not collected Core-only."""


def plugins_loaded() -> bool:
    """Whether this test process runs with a plugin (the plugin-loaded configuration)."""
    return bool(loader.loaded_plugins().plugins)


_PARAMETER = re.compile(r"\{[^}]*\}")


def operation_key(method: str, path: str) -> tuple[str, str]:
    """Compare operations independent of path-parameter names."""
    return method.upper(), _PARAMETER.sub("{}", path)


@lru_cache(maxsize=1)
def pro_operations() -> frozenset[tuple[str, str]]:
    """Every ``(method, path)`` the in-tree Pro plugin mounts under ``/api/v1``."""
    from fastapi import FastAPI
    from fastapi.routing import iter_route_contexts

    from eimir.pro_plugin import plugin

    app = FastAPI()
    for router in plugin.routers():
        app.include_router(router, prefix="/api/v1")
    return frozenset(
        (method, route.path)
        for route in iter_route_contexts(app.routes)
        if route.path is not None and route.path.startswith("/api/v1")
        for method in route.methods or ()
    )


def is_pro_operation(method: str, path: str) -> bool:
    return operation_key(method, path) in {
        operation_key(*operation) for operation in pro_operations()
    }


@contextmanager
def without_plugins() -> Iterator[None]:
    """Make ``loaded_plugins()`` report no plugin inside the block.

    Data is usually created with the plugin loaded (through its routes and
    services) and the lifecycle step under test then runs Core-only, the state
    of an instance that once ran with the plugin.
    """
    loaded = loader.loaded_plugins()
    loader._loaded = loader.LoadedPlugins(())
    try:
        yield
    finally:
        loader._loaded = loaded


@contextmanager
def with_pro_plugin() -> Iterator[None]:
    """Make ``loaded_plugins()`` report the in-tree Pro plugin inside the block.

    The Core-only configuration uses it to create the data an instance keeps
    from the time it ran with the plugin (for example composed recaps) before
    the step under test runs without it. Routes are not remounted: only the
    capabilities and hooks of the plugin become effective.
    """
    from eimir.pro_plugin import plugin

    loaded = loader.loaded_plugins()
    loader._loaded = loader.LoadedPlugins((plugin,))
    try:
        yield
    finally:
        loader._loaded = loaded
