"""Extract the approved app-icon pixels from the preserved owner poster."""

import json
from pathlib import Path
from shutil import copyfile

from PIL import Image

BASE = Path(__file__).parent
ASSETS = BASE / "assets"
WEB_PUBLIC = BASE.parents[3] / "web" / "public"
POSTER = BASE / "references" / "owner-app-logo.png"

# Pixel coordinates in the unchanged 1254 x 1254 owner poster. These square
# crops retain the supplied tile artwork, including its lighting and shadow.
ICON_BOUNDS = {
    "light": (132, 76, 482, 426),
    "dark": (1068, 232, 1209, 373),
    "mono": (1068, 420, 1209, 561),
}

with Image.open(POSTER) as original:
    assert original.size == (1254, 1254), "The owner poster changed dimensions"
    for name, bounds in ICON_BOUNDS.items():
        crop = original.crop(bounds).convert("RGB")
        filename = f"app-icon-{name}.png"
        source_path = ASSETS / filename
        crop.save(source_path)
        copyfile(source_path, WEB_PUBLIC / "identity" / filename)

with Image.open(ASSETS / "app-icon-light.png") as light:
    for name, size in (
        ("pwa-192.png", 192),
        ("pwa-512.png", 512),
        ("apple-touch-icon.png", 180),
    ):
        light.resize((size, size), Image.Resampling.LANCZOS).save(WEB_PUBLIC / name)

    # The colored circles, loop and dot are inside the central mask-safe circle
    # of the source tile. Keep the complete owner tile rather than adding art.
    light.resize((512, 512), Image.Resampling.LANCZOS).save(
        WEB_PUBLIC / "pwa-maskable.png"
    )

proposal = json.loads((BASE / "tokens.proposal.json").read_text())
(ASSETS / "tokens.generated.js").write_text(
    "const SYSTEM_TOKENS = " + json.dumps(proposal, ensure_ascii=False) + ";\n"
)
