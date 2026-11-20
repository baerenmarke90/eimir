"""The recap read path stands on its own (Decision 0017, #2085).

Stored editions stay readable, exportable and restorable on every server, so the
Core read module and the job member helpers must not depend on the composing
side of recaps (selection pool, film cut, look, mood computation, notices,
freshness or the jobs). This keeps the composition movable into the Pro plugin.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[2] / "src" / "eimir"

COMPOSING = {
    f"eimir.recaps.{name}"
    for name in ("film", "freshness", "jobs", "montage", "mood", "notices", "service", "words")
}


def _imports(path: Path) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
            found.update(f"{node.module}.{alias.name}" for alias in node.names)
    return found


@pytest.mark.parametrize(
    "relative",
    ["recaps/presentation.py", "recaps/invalidation.py", "jobs/members.py", "context_tags/jobs.py"],
)
def test_the_read_path_does_not_import_recap_composition(relative: str) -> None:
    assert _imports(SOURCE / relative) & COMPOSING == set()
