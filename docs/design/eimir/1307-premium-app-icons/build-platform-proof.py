"""Build reproducible public launcher assets for the pending real-device proof.

Artwork remains the exact supplied crops, with deterministic LANCZOS sampling
only for platform sizes. This does not activate launcher metadata in the app.
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
TARGET = ROOT / "web/public/identity/app-icons/v1"


def build() -> None:
    catalog = json.loads((HERE / "source-crops.json").read_text())
    baseline = json.loads((ROOT / "web/public/manifest.webmanifest").read_text())
    for candidate in catalog["candidates"]:
        icon_id = candidate["id"]
        source = HERE / candidate["file"]
        (TARGET / f"{icon_id}.png").write_bytes(source.read_bytes())
        with Image.open(source) as artwork:
            for size in (180, 192, 512):
                artwork.resize((size, size), Image.Resampling.LANCZOS).save(
                    TARGET / f"{icon_id}-{size}.png"
                )
        manifest = {**baseline, "id": "/"}
        if icon_id != "original":
            manifest["icons"] = [
                {
                    "src": f"/identity/app-icons/v1/{icon_id}-{size}.png",
                    "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any",
                }
                for size in (192, 512)
            ]
        (TARGET / f"{icon_id}.webmanifest").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        )


if __name__ == "__main__":
    build()
    print("Built eleven static manifests with one app identity; launcher switching stays inactive.")
