"""Editorial date-idea images: manifest validation, lookup order and import."""

from __future__ import annotations

import json
import shutil
from importlib.resources import files
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from eimir.date_ideas.catalog import DateIdeaCategory, get_catalog
from eimir.date_ideas.images import get_images, manifest_problems, parse_manifest
from scripts import date_ideas_catalog

DATA = Path(str(files("eimir.date_ideas").joinpath("data")))


def _manifest() -> dict[str, Any]:
    return json.loads((DATA / "images.json").read_text(encoding="utf-8"))


def test_bundled_manifest_is_valid_and_every_file_is_webp() -> None:
    images = get_images()
    entries = images.manifest.entries()
    assert len(entries) == len(list((DATA / "images").glob("*.webp"))) == 25
    for entry in entries:
        head = (DATA / entry.file).read_bytes()[:12]
        assert head[:4] == b"RIFF" and head[8:12] == b"WEBP", entry.file
        assert (entry.width, entry.height) == (1200, 800)


def test_lookup_prefers_the_idea_image_then_the_category_image() -> None:
    images = get_images()
    manifest = images.manifest
    for idea in get_catalog().ideas("de"):
        resolved = images.for_idea(idea.id, idea.category, "de")
        expected = (
            manifest.images_by_idea_id.get(idea.id) or (manifest.images_by_category[idea.category])
        )
        assert resolved.id == expected.image_id
        assert resolved.alt == expected.alt.de
        assert images.read(resolved.id) is not None
    first = images.for_idea("eimir-date-001", DateIdeaCategory.FOOD_DRINK, "en")
    assert first.id == "eimir-date-001"
    assert first.alt == manifest.images_by_idea_id["eimir-date-001"].alt.en
    fallback = images.for_idea("eimir-date-004", DateIdeaCategory.FOOD_DRINK, "de")
    assert fallback.id == "category-food_drink"
    assert images.read("category-unknown") is None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d["imagesByCategory"].pop("play"),
        lambda d: d["imagesByIdeaId"].update(
            {"not-an-idea": d["imagesByIdeaId"]["eimir-date-001"]}
        ),
        lambda d: d["imagesByIdeaId"]["eimir-date-001"]["alt"].pop("en"),
        lambda d: d["imagesByIdeaId"]["eimir-date-001"].update(file="../secret.webp"),
        lambda d: d["imagesByIdeaId"]["eimir-date-002"].update(
            file=d["imagesByIdeaId"]["eimir-date-001"]["file"]
        ),
        lambda d: d.update(lookupOrder=["category", "ideaId"]),
        lambda d: d.update(schemaVersion=2),
    ],
)
def test_invalid_manifests_are_rejected(mutate: Any) -> None:
    data = _manifest()
    mutate(data)
    with pytest.raises(ValidationError):
        parse_manifest(json.dumps(data))


def test_manifest_problems_detect_catalog_and_file_mismatches(tmp_path: Path) -> None:
    data = _manifest()
    data["catalogVersion"] = "1.9.9"
    data["imagesByIdeaId"]["eimir-date-005"] = {
        **data["imagesByIdeaId"]["eimir-date-001"],
        "file": "images/eimir-date-005.webp",
    }
    (tmp_path / "images").mkdir()
    problems = manifest_problems(parse_manifest(json.dumps(data)), tmp_path)
    assert any("catalog 1.9.9" in problem for problem in problems)
    assert "missing file images/eimir-date-005.webp" in problems
    assert len([p for p in problems if p.startswith("missing file")]) == 26


@pytest.fixture
def handoff(tmp_path: Path) -> Path:
    directory = tmp_path / "handoff"
    shutil.copytree(DATA / "images", directory / "images")
    shutil.copyfile(DATA / "images.json", directory / date_ideas_catalog.IMAGE_MANIFEST_NAME)
    return directory


def test_import_images_validates_then_replaces_the_bundle(
    handoff: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "bundle"
    target.mkdir()
    monkeypatch.setattr(date_ideas_catalog, "BUNDLED", target / "catalog.json")
    assert date_ideas_catalog.main(["validate-images", str(handoff)]) == 0
    assert date_ideas_catalog.main(["import-images", str(handoff)]) == 0
    assert len(list((target / "images").glob("*.webp"))) == 25
    assert (target / "images.json").read_bytes() == (
        handoff / date_ideas_catalog.IMAGE_MANIFEST_NAME
    ).read_bytes()

    (handoff / "images" / "category-play.webp").write_bytes(b"not an image")
    assert date_ideas_catalog.main(["import-images", str(handoff)]) == 1
