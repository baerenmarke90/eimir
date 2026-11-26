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
        "integration/test_shared_experiences.py",
        "unit/test_account_table_lifecycle.py",
        "unit/test_m3_plan_openapi.py",
    }
)
"""Core test modules that need the plugin loaded, relative to ``tests/``; not collected Core-only.

The Pro feature tests themselves live in ``backend/pro/pro_tests``.
"""

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
    return import_pro("eimir_pro.plugin").plugin


def admin_distribution_installed() -> bool:
    """Whether ``eimir-admin`` (the operator plugin) is importable in this test process."""
    return find_spec("eimir_admin") is not None


def admin_plugin_object() -> Any:
    """The operator plugin object, or skip the calling test when it is not installed."""
    if not admin_distribution_installed():
        pytest.skip("The operator plugin distribution (eimir-admin) is not installed.")
    return import_module("eimir_admin.plugin").plugin


CHAIN_PLUGIN_TABLES = frozenset({"support_report_tickets", "support_reply_templates"})
"""Manifest tables created by a plugin's own migration chain, never by the Core chain.

The Pro tables are part of the Core chain; the operator plugin's are not
(Decision 0017, decision 6). The test database gets them from the models when
that distribution is installed.
"""


def plugins_loaded() -> bool:
    """Whether this test process runs with a plugin (the plugin-loaded configuration)."""
    return bool(loader.loaded_plugins().plugins)


_PARAMETER = re.compile(r"\{[^}]*\}")


def operation_key(method: str, path: str) -> tuple[str, str]:
    """Compare operations independent of path-parameter names."""
    return method.upper(), _PARAMETER.sub("{}", path)


HIDDEN_PRO_OPERATIONS = frozenset(
    {
        ("GET", "/api/v1/calendar-sync/google/callback"),
        ("GET", "/api/v1/photo-sources/google/callback"),
        ("POST", "/api/v1/spaces/{spaceId}/photo-selections/{selectionId}/items/{itemId}"),
    }
)
"""Pro routes hidden from the OpenAPI contract; a Pro test keeps this list exact."""


ADMIN_OPERATIONS = frozenset(
    {
        ("GET", "/api/v1/server-admin/support-reports"),
        ("GET", "/api/v1/server-admin/support-reports/{reportId}"),
        ("PUT", "/api/v1/server-admin/support-reports/{reportId}/state"),
        ("PUT", "/api/v1/server-admin/support-reports/{reportId}/archive"),
        ("DELETE", "/api/v1/server-admin/support-reports/{reportId}"),
        ("POST", "/api/v1/server-admin/support-reports/{reportId}/reply"),
        ("POST", "/api/v1/server-admin/support-reports/{reportId}/ticket"),
        ("DELETE", "/api/v1/server-admin/support-reports/{reportId}/ticket"),
    }
)
"""Operations of the operator plugin (``eimir-admin``) in the complete contract.

The complete contract is built with ``EIMIR_PLUGINS=pro,admin``. Core tests built
with another plugin set neither mount them nor treat them as Pro operations;
``backend/admin/admin_tests`` covers them. A test in that package keeps this list
exact. Add the operator plugin's later routes here.
"""


def is_admin_operation(method: str, path: str) -> bool:
    return operation_key(method, path) in {
        operation_key(*operation) for operation in ADMIN_OPERATIONS
    }


def plugin_route_operations() -> frozenset[tuple[str, str]]:
    """Every ``(method, path)`` the installed Pro plugin's routers mount."""
    from fastapi import FastAPI
    from fastapi.routing import iter_route_contexts

    app = FastAPI()
    for router in pro_plugin_object().routers():
        app.include_router(router, prefix="/api/v1")
    return frozenset(
        (method, route.path)
        for route in iter_route_contexts(app.routes)
        if route.path is not None and route.path.startswith("/api/v1")
        for method in route.methods or ()
    )


def contract_pro_operations() -> frozenset[tuple[str, str]]:
    """The operations of the complete contract that the Core router does not mount."""
    import json
    from pathlib import Path

    from fastapi import FastAPI
    from fastapi.routing import iter_route_contexts

    from eimir.api.v1 import router as core_router

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
        and not is_admin_operation(method, path)
    )


@lru_cache(maxsize=1)
def pro_operations() -> frozenset[tuple[str, str]]:
    """Every ``(method, path)`` the Pro plugin mounts under ``/api/v1``.

    Read from the plugin's routers when ``eimir-pro`` is installed. Without it,
    the versioned contract (built with the plugin loaded) minus the Core routes,
    plus the few Pro routes hidden from the schema, gives the same set.
    """
    if pro_distribution_installed():
        return plugin_route_operations()
    return contract_pro_operations() | HIDDEN_PRO_OPERATIONS


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
