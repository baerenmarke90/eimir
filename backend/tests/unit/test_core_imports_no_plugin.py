"""Core never imports plugin code (Decision 0017, decision 1 and acceptance criterion 1 of #2082).

The plugin may import any Core module. Core reaches plugin code only through
the seam (``eimir.plugins``), so a Core-only tree builds and starts without it.
This test walks every Core source file with ``ast``, including imports inside
functions, and fails on any import of plugin code.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[2] / "src"

PLUGIN_PACKAGES: tuple[str, ...] = ()
"""In-tree Pro packages; Phase 2 moved them into ``backend/pro`` (#2182)."""

PLUGIN_MODULES: tuple[str, ...] = ()
"""Single in-tree Pro modules; none is left since the plugin object moved (#2182)."""


def _module_name(path: Path) -> str:
    parts = list(path.relative_to(SOURCE).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


PLUGIN_DISTRIBUTION_ROOTS: tuple[str, ...] = ("eimir_pro", "eimir_admin")
"""The import roots of the plugin distributions (``backend/pro`` #2182, ``backend/admin`` #2189)."""


def _is_plugin(module: str) -> bool:
    if any(module == root or module.startswith(f"{root}.") for root in PLUGIN_DISTRIBUTION_ROOTS):
        return True
    return any(
        module == package or module.startswith(f"{package}.") for package in PLUGIN_PACKAGES
    ) or any(module == name or module.startswith(f"{name}.") for name in PLUGIN_MODULES)


def _imported(tree: ast.AST, module: str, *, is_package: bool = False) -> set[str]:
    package = module if is_package else module.rsplit(".", 1)[0]
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                parts = package.split(".")
                parent = parts[: len(parts) - node.level + 1]
                base = ".".join([*parent, *([base] if base else [])])
            found.add(base)
            # ``from eimir.api.v1 import garden`` imports the submodule ``garden``.
            found.update(f"{base}.{alias.name}" for alias in node.names)
    return found


CORE_FILES = sorted(path for path in SOURCE.rglob("*.py") if not _is_plugin(_module_name(path)))


def test_the_plugin_code_lists_name_existing_modules() -> None:
    for name in (*PLUGIN_PACKAGES, *PLUGIN_MODULES):
        relative = Path(*name.split("."))
        assert (SOURCE / relative).is_dir() or (SOURCE / relative).with_suffix(".py").is_file(), (
            name
        )
    assert len(CORE_FILES) > 300


@pytest.mark.parametrize("path", CORE_FILES, ids=lambda path: path.relative_to(SOURCE).as_posix())
def test_core_module_imports_no_plugin_code(path: Path) -> None:
    module = _module_name(path)
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imported = _imported(tree, module, is_package=path.name == "__init__.py")
    offending = sorted(name for name in imported if _is_plugin(name))
    assert not offending, f"{module} imports plugin code: {', '.join(offending)}"


def test_the_check_catches_a_plugin_import() -> None:
    tree = ast.parse(
        "def f():\n    from eimir_pro.garden import service\n"
        "from eimir_pro.api import calendar_sync\nimport eimir_pro.presence.models\n"
        "import eimir_pro.plugin\n"
        "from eimir_admin import plugin\nimport eimir_admin.api.reports\n"
    )
    assert {
        name for name in _imported(tree, "eimir.wish_selections.service") if _is_plugin(name)
    } == {
        "eimir_pro.garden",
        "eimir_pro.garden.service",
        "eimir_pro.api",
        "eimir_pro.api.calendar_sync",
        "eimir_pro.presence.models",
        "eimir_pro.plugin",
        "eimir_admin",
        "eimir_admin.plugin",
        "eimir_admin.api.reports",
    }
