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
from importlib import import_module
from importlib.util import find_spec
from types import ModuleType
from typing import Any

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

PRO_DISTRIBUTION_TEST_MODULES = frozenset(
    {
        # Core lifecycle tests that create real Pro rows through the Pro models
        # and then switch the plugin off themselves (``without_plugins``). They
        # run wherever the Pro distribution is installed, the plugin-loaded
        # configuration included.
        "integration/test_core_only_lifecycle.py",
        "integration/test_dormant_plugin_data.py",
        "integration/test_plugin_lifecycle.py",
    }
)
"""Core test modules that import Pro models; not collected without ``eimir-pro`` (#2182)."""

CORE_ONLY_SKIP = "Core-only configuration: the Pro distribution (eimir-pro) is not installed."


def pro_distribution_installed() -> bool:
    """Whether ``eimir-pro`` is importable in this test process."""
    return find_spec("eimir_pro") is not None


def require_pro_distribution() -> None:
    """Skip the calling test when the Pro distribution is not installed."""
    if not pro_distribution_installed():
        pytest.skip(CORE_ONLY_SKIP)


def import_pro(module: str) -> ModuleType:
    """Import a Pro module, or skip the calling test when Pro is not installed."""
    require_pro_distribution()
    return import_module(module)


def pro_plugin_object() -> Any:
    """The Pro plugin object, or skip the calling test when Pro is not installed."""
    return import_pro("eimir.pro_plugin").plugin


def plugins_loaded() -> bool:
    """Whether this test process runs with a plugin (the plugin-loaded configuration)."""
    return bool(loader.loaded_plugins().plugins)


_PARAMETER = re.compile(r"\{[^}]*\}")


def operation_key(method: str, path: str) -> tuple[str, str]:
    """Compare operations independent of path-parameter names."""
    return method.upper(), _PARAMETER.sub("{}", path)


@lru_cache(maxsize=1)
def pro_operations() -> frozenset[tuple[str, str]]:
    """Every ``(method, path)`` the Pro plugin mounts under ``/api/v1``.

    With ``eimir-pro`` installed this is read from the plugin's routers. Without
    it, the versioned contract (``backend/openapi.json``, built with the plugin
    loaded) minus what the Core router mounts stands in; it lacks only the few
    plugin routes hidden from the schema (OAuth callbacks).
    """
    import json
    from pathlib import Path

    from fastapi import FastAPI
    from fastapi.routing import iter_route_contexts

    from eimir.api.v1 import router as core_router

    if pro_distribution_installed():
        plugin_app = FastAPI()
        for plugin_router in pro_plugin_object().routers():
            plugin_app.include_router(plugin_router, prefix="/api/v1")
        return frozenset(
            (method, route.path)
            for route in iter_route_contexts(plugin_app.routes)
            if route.path is not None and route.path.startswith("/api/v1")
            for method in route.methods or ()
        )

    app = FastAPI()
    app.include_router(core_router, prefix="/api/v1")
    core = {
        operation_key(method, route.path)
        for route in iter_route_contexts(app.routes)
        if route.path is not None
        for method in route.methods or ()
    }
    contract = json.loads(
        (Path(__file__).resolve().parents[2] / "openapi.json").read_text(encoding="utf-8")
    )
    return frozenset(
        (method.upper(), path)
        for path, operations in contract["paths"].items()
        for method in operations
        if method.lower() in {"get", "put", "post", "delete", "patch", "options", "head"}
        and operation_key(method, path) not in core
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
    plugin = pro_plugin_object()

    loaded = loader.loaded_plugins()
    loader._loaded = loader.LoadedPlugins((plugin,))
    try:
        yield
    finally:
        loader._loaded = loaded
