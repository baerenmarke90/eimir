"""Build Android adaptive launcher resources from the approved poster crops."""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
RES = HERE.parents[3] / "android/app/src/main/res"

# The shipped 432px foreground holds the poster tile in its central 288px.
# Android masks a 72dp viewport from the 108dp adaptive-icon canvas. Enlarging
# the existing layer makes the 288/432 tile 88dp wide: it fills any OS mask
# without exposing its own baked-in rounded border.
MASK_SAFE_FOREGROUND_DP = 132


def build() -> None:
    catalog = json.loads((HERE / "source-crops.json").read_text())
    drawable = RES / "drawable-nodpi"
    drawable.mkdir(exist_ok=True)
    (RES / "drawable").mkdir(exist_ok=True)
    for candidate in catalog["candidates"]:
        icon_id = candidate["id"]
        with Image.open(HERE / candidate["file"]) as source:
            # Keep the approved tile pixels unchanged in a stable, centered
            # bitmap. The drawable XML supplies the launcher-mask overscan.
            canvas = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
            tile = source.convert("RGBA").resize((288, 288), Image.Resampling.LANCZOS)
            canvas.alpha_composite(tile, (72, 72))
            canvas.save(drawable / f"app_icon_{icon_id}_foreground.png")
        # Retain the approved source pixels; the platform owns the outer mask.
        (RES / "drawable" / f"app_icon_{icon_id}_mask_safe.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
            f'    <item android:drawable="@drawable/app_icon_{icon_id}_foreground" '
            f'android:width="{MASK_SAFE_FOREGROUND_DP}dp" '
            f'android:height="{MASK_SAFE_FOREGROUND_DP}dp" '
            'android:gravity="center"/>\n'
            '</layer-list>\n'
        )
        (RES / "mipmap-anydpi-v26" / f"app_icon_{icon_id}.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            f'    <foreground android:drawable="@drawable/app_icon_{icon_id}_mask_safe"/>\n'
            '</adaptive-icon>\n'
        )


if __name__ == "__main__":
    build()
