"""Verify exact source provenance, complete Pro coverage and stable proof identity."""

import hashlib
import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
TARGET = ROOT / "web/public/identity/app-icons/v1"
catalog = json.loads((HERE / "source-crops.json").read_text())
poster_path = (HERE / catalog["source"]).resolve()
assert hashlib.sha256(poster_path.read_bytes()).hexdigest() == catalog["sourceSha256"]
assert len(catalog["candidates"]) == 11
assert len({candidate["id"] for candidate in catalog["candidates"]}) == 11
contract = json.loads((ROOT / "backend/openapi.json").read_text())
assert set(contract["components"]["schemas"]["AppIconId"]["enum"]) == {
    candidate["id"] for candidate in catalog["candidates"]
}
baseline = json.loads((ROOT / "web/public/manifest.webmanifest").read_text())
with Image.open(poster_path) as poster:
    for candidate in catalog["candidates"]:
        icon_id = candidate["id"]
        source = HERE / candidate["file"]
        assert (TARGET / f"{icon_id}.png").read_bytes() == source.read_bytes()
        assert candidate["tier"] == ("Free/Core" if icon_id == "original" else "Pro")
        if icon_id != "original":
            assert candidate["capability"] == "theme.bespoke_packs"
        with Image.open(source) as artwork:
            assert artwork.convert("RGB").tobytes() == poster.crop(candidate["bounds"]).convert("RGB").tobytes()
            for size in (180, 192, 512):
                with Image.open(TARGET / f"{icon_id}-{size}.png") as scaled:
                    assert scaled.size == (size, size)
                    assert scaled.tobytes() == artwork.resize((size, size), Image.Resampling.LANCZOS).tobytes()
        manifest = json.loads((TARGET / f"{icon_id}.webmanifest").read_text())
        assert manifest["id"] == "/"
        for field in ("name", "short_name", "start_url", "scope", "display"):
            assert manifest[field] == baseline[field]
        assert "?" not in manifest["start_url"]
print("Exact source pixels, eleven-entry tier coverage and stable launcher-proof identity verified.")
