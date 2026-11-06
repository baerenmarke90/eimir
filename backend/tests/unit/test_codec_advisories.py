"""New native dependencies retain the existing advisory-change review boundary."""

from __future__ import annotations

import runpy
from pathlib import Path

import pytest

findings = runpy.run_path(
    str(Path(__file__).resolve().parents[3] / "tools/media/check-advisories.py")
)["findings"]


@pytest.mark.parametrize("package", ["ffmpeg", "openh264", "zimg"])
def test_each_native_dependency_tracks_new_and_changed_unresolved_evidence(package: str) -> None:
    entry = {"description": "Synthetic security finding", "releases": {"sid": {"status": "open"}}}
    feed = {package: {"TEST-ADVISORY": entry}}
    original = findings(feed, package)
    assert set(original) == {"TEST-ADVISORY"}
    assert findings(feed, "unrelated") == {}
    entry["description"] = "Changed applicability evidence"
    assert findings(feed, package) != original
    entry["releases"]["sid"]["status"] = "undetermined"
    assert findings(feed, package)
    entry["releases"]["sid"]["status"] = "resolved"
    assert findings(feed, package) == {}
