"""Unit coverage for curated canonical-demo media."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from eimir.demo.assets import (
    DemoAssetError,
    load_and_validate_assets,
    resolve_asset_root,
)
from eimir.demo.story import MEMORIES


def _copy_assets(tmp_path: Path) -> Path:
    destination = tmp_path / "demo_assets"
    shutil.copytree(resolve_asset_root(), destination)
    return destination


def _rewrite_manifest(root: Path, mutate) -> None:  # type: ignore[no-untyped-def]
    path = root / "manifest.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    mutate(document)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def test_repository_manifest_is_valid_complete_and_local() -> None:
    catalog = load_and_validate_assets()

    assert len(catalog.assets) == 12
    assert {asset.source_provider for asset in catalog.assets} == {"pixabay"}
    assert len({asset.id for asset in catalog.assets}) == len(catalog.assets)
    assert len({asset.filename for asset in catalog.assets}) == len(catalog.assets)
    for asset in catalog.assets:
        assert asset.path.is_file()
        assert asset.source_asset_id
        assert asset.source_page_url.startswith("https://pixabay.com/photos/")
        assert asset.creator
        assert asset.license_name
        assert asset.license_url.startswith("https://")
        assert asset.license_basis_url == "https://pixabay.com/service/terms/"
        assert asset.alt_text_de
        assert asset.usage_context
        assert asset.mime_type == "image/jpeg"
        assert asset.attribution_required is False
        assert asset.attribution_text is None


def test_story_references_only_manifest_assets_and_never_hotlinks() -> None:
    catalog = load_and_validate_assets()
    available = {asset.id for asset in catalog.assets}
    referenced = {asset_id for memory in MEMORIES for asset_id in memory.asset_ids}

    assert referenced <= available
    assert len(referenced) == 11
    assert "http://" not in repr(MEMORIES)
    assert "https://" not in repr(MEMORIES)


def test_hash_mismatch_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["sha256"] = "0" * 64

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="SHA-256 mismatch"):
        load_and_validate_assets(root)


def test_unreferenced_local_file_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)
    images = root / "images"
    source = next(images.iterdir())
    shutil.copyfile(source, images / "unreferenced.jpg")

    with pytest.raises(DemoAssetError, match="unreferenced"):
        load_and_validate_assets(root)


def test_unknown_provider_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["source_provider"] = "google-images"

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="unsupported provider"):
        load_and_validate_assets(root)


def test_mime_mismatch_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["mime_type"] = "image/png"

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="MIME mismatch"):
        load_and_validate_assets(root)


def test_historical_pixabay_cc0_cutoff_is_enforced(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["source_published_at"] = "2019-01-09"

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="CC0 after"):
        load_and_validate_assets(root)


def test_missing_creator_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["creator"] = ""

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="creator"):
        load_and_validate_assets(root)


def test_missing_alt_text_is_rejected(tmp_path: Path) -> None:
    root = _copy_assets(tmp_path)

    def mutate(document: dict[str, object]) -> None:
        assets = document["assets"]
        assert isinstance(assets, list)
        first = assets[0]
        assert isinstance(first, dict)
        first["alt_text_de"] = ""

    _rewrite_manifest(root, mutate)
    with pytest.raises(DemoAssetError, match="alt_text_de"):
        load_and_validate_assets(root)
