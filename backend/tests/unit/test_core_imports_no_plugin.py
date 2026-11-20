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

PLUGIN_PACKAGES = (
    "eimir.calendar_sync",
    "eimir.couple_games",
    "eimir.date_ideas",
    "eimir.garden",
    "eimir.heart_hunt",
    "eimir.once_messages",
    "eimir.photo_sources",
    "eimir.picture_ping_pong",
    "eimir.presence",
    "eimir.quotes",
)
"""The in-tree Pro modules; Phase 2 moves them into their own distribution."""

PLUGIN_MODULES = (
    "eimir.pro_plugin",
    "eimir.games.service",
    "eimir.providers.caldav",
    *(
        f"eimir.api.v1.{name}"
        for name in (
            "calendar_sync",
            "couple_games",
            "daily_quote",
            "date_ideas",
            "games",
            "garden",
            "heart_hunt",
            "once_messages",
            "partner_location",
            "photo_sources",
            "picture_ping_pong",
        )
    ),
)
"""Single Pro modules inside otherwise Core packages."""


def _module_name(path: Path) -> str:
    parts = list(path.relative_to(SOURCE).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _is_plugin(module: str) -> bool:
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
        "def f():\n    from eimir.garden import service\n"
        "from eimir.api.v1 import date_ideas\nimport eimir.presence.models\n"
    )
    assert {
        name for name in _imported(tree, "eimir.wish_selections.service") if _is_plugin(name)
    } == {
        "eimir.garden",
        "eimir.garden.service",
        "eimir.api.v1.date_ideas",
        "eimir.presence.models",
    }
