"""Build Android adaptive launcher resources from the approved poster crops."""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
RES = HERE.parents[3] / "android/app/src/main/res"


def build() -> None:
    catalog = json.loads((HERE / "source-crops.json").read_text())
    drawable = RES / "drawable-nodpi"
    drawable.mkdir(exist_ok=True)
    for candidate in catalog["candidates"]:
        icon_id = candidate["id"]
        with Image.open(HERE / candidate["file"]) as source:
            # The 72dp tile fills the launcher's normal masked viewport; the
            # poster's central mark stays inside Android's 66dp safe circle.
            canvas = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
            tile = source.convert("RGBA").resize((288, 288), Image.Resampling.LANCZOS)
            canvas.alpha_composite(tile, (72, 72))
            canvas.save(drawable / f"app_icon_{icon_id}_foreground.png")
        (RES / "mipmap-anydpi-v26" / f"app_icon_{icon_id}.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background"/>\n'
            f'    <foreground android:drawable="@drawable/app_icon_{icon_id}_foreground"/>\n'
            '</adaptive-icon>\n'
        )


if __name__ == "__main__":
    build()
