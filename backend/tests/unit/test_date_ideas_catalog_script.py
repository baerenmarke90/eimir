"""The reusable validation/import path for the editorial date-idea catalog."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from eimir.date_ideas.catalog import bundled_catalog_text
from scripts import date_ideas_catalog


def _bundled() -> dict[str, Any]:
    return json.loads(bundled_catalog_text())


@pytest.fixture
def bundled_target(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    target = tmp_path / "catalog.json"
    target.write_text(bundled_catalog_text(), encoding="utf-8")
    monkeypatch.setattr(date_ideas_catalog, "BUNDLED", target)
    return target


def _write(path: Path, data: dict[str, Any]) -> Path:
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_validate_accepts_copy_edits_and_reordering(tmp_path: Path, bundled_target: Path) -> None:
    edited = _bundled()
    edited["catalogVersion"] = "1.0.1"
    edited["ideas"][0]["copy"]["de"]["title"] = "Edited title"
    edited["ideas"].reverse()
    assert date_ideas_catalog.main(["validate", str(_write(tmp_path / "e.json", edited))]) == 0


def test_validate_rejects_invalid_files(tmp_path: Path, bundled_target: Path) -> None:
    broken = _bundled()
    broken["ideas"][0]["minutes"] = 90
    assert date_ideas_catalog.main(["validate", str(_write(tmp_path / "b.json", broken))]) == 1


def test_import_copies_the_validated_file_verbatim(tmp_path: Path, bundled_target: Path) -> None:
    edited = _bundled()
    edited["catalogVersion"] = "1.1.0"
    source = _write(tmp_path / "next.json", edited)
    assert date_ideas_catalog.main(["import", str(source)]) == 0
    assert bundled_target.read_bytes() == source.read_bytes()

    invalid = _bundled()
    invalid["currency"] = "USD"
    before = bundled_target.read_bytes()
    assert date_ideas_catalog.main(["import", str(_write(tmp_path / "x.json", invalid))]) == 1
    assert bundled_target.read_bytes() == before
