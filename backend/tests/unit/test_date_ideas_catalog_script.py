"""The reusable validation/import path for the date inspiration catalog."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from eimir.date_ideas.catalog import CatalogFile, bundled_catalog_text
from scripts import date_ideas_catalog

SCHEMA_FILE = (
    Path(__file__).resolve().parents[3] / "docs/product/date-inspiration/catalog.schema.json"
)


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


def test_published_json_schema_matches_the_file_model() -> None:
    assert json.loads(SCHEMA_FILE.read_text(encoding="utf-8")) == CatalogFile.model_json_schema(
        by_alias=True
    )


def test_validate_accepts_retired_ideas_and_rejects_dropped_ids(
    tmp_path: Path, bundled_target: Path
) -> None:
    retired = _bundled()
    retired["ideas"][0]["active"] = False
    assert date_ideas_catalog.main(["validate", str(_write(tmp_path / "r.json", retired))]) == 0

    dropped = _bundled()
    removed = dropped["ideas"].pop(0)["id"]
    with pytest.raises(SystemExit, match=removed):
        date_ideas_catalog.main(["validate", str(_write(tmp_path / "d.json", dropped))])


def test_validate_reports_invalid_files(tmp_path: Path, bundled_target: Path) -> None:
    broken = _bundled()
    broken["ideas"][0]["category"] = "missing"
    assert date_ideas_catalog.main(["validate", str(_write(tmp_path / "b.json", broken))]) == 1


def test_import_writes_canonical_editorial_catalog_and_guards_development(
    tmp_path: Path, bundled_target: Path
) -> None:
    development = _bundled()
    source = _write(tmp_path / "dev.json", development)
    assert date_ideas_catalog.main(["import", str(source)]) == 1
    assert bundled_target.read_text(encoding="utf-8") == bundled_catalog_text()

    editorial = _bundled()
    editorial["edition"] = "editorial"
    editorial["catalogVersion"] = "2026.12-editorial.1"
    editorial["ideas"].reverse()
    assert date_ideas_catalog.main(["import", str(_write(tmp_path / "ed.json", editorial))]) == 0
    imported = json.loads(bundled_target.read_text(encoding="utf-8"))
    assert imported["edition"] == "editorial"
    order = [(idea["sortKey"], idea["id"]) for idea in imported["ideas"]]
    assert order == sorted(order)


def test_import_of_the_bundled_file_onto_itself_keeps_its_content(bundled_target: Path) -> None:
    before = bundled_target.read_text(encoding="utf-8")
    assert date_ideas_catalog.main(["import", str(bundled_target), "--allow-development"]) == 0
    assert bundled_target.read_text(encoding="utf-8") == before
