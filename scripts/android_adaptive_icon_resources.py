"""Verify all Android launcher's mask-safe resources against the poster catalog."""

import json
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
CATALOG = ROOT / "docs/design/eimir/1307-premium-app-icons/source-crops.json"
ANDROID = "{http://schemas.android.com/apk/res/android}"
MASK_SAFE_LAYER_DP = 132
POSTER_TILE_PX = 288
FOREGROUND_PX = 432
ANDROID_MASK_DP = 72


def validate_icon_xml(icon_id: str, adaptive_xml: str, layer_xml: str) -> None:
    adaptive = ET.fromstring(adaptive_xml)
    if adaptive.tag != "adaptive-icon":
        raise ValueError(f"{icon_id}: expected an adaptive icon")
    background = adaptive.find("background")
    foreground = adaptive.find("foreground")
    if background is None or not background.get(f"{ANDROID}drawable"):
        raise ValueError(f"{icon_id}: missing fallback background")
    if foreground is None or foreground.get(f"{ANDROID}drawable") != (
        f"@drawable/app_icon_{icon_id}_mask_safe"
    ):
        raise ValueError(f"{icon_id}: missing mask-safe drawable")

    layer = ET.fromstring(layer_xml)
    if layer.tag != "layer-list" or len(layer) != 1:
        raise ValueError(f"{icon_id}: expected one scaled foreground layer")
    item = layer.find("item")
    if item is None or item.get(f"{ANDROID}drawable") != (
        f"@drawable/app_icon_{icon_id}_foreground"
    ):
        raise ValueError(f"{icon_id}: wrong poster source")
    if item.get(f"{ANDROID}width") != f"{MASK_SAFE_LAYER_DP}dp" or item.get(
        f"{ANDROID}height"
    ) != f"{MASK_SAFE_LAYER_DP}dp":
        raise ValueError(f"{icon_id}: adaptive foreground must overscan the mask")
    if item.get(f"{ANDROID}gravity") != "center":
        raise ValueError(f"{icon_id}: poster artwork must remain centered")
    if MASK_SAFE_LAYER_DP * POSTER_TILE_PX / FOREGROUND_PX <= ANDROID_MASK_DP:
        raise ValueError(f"{icon_id}: tile does not cover the platform mask")


def validate_resource_catalog(res: Path = RES, catalog: Path = CATALOG) -> None:
    candidates = json.loads(catalog.read_text(encoding="utf-8"))["candidates"]
    ids = [entry["id"] for entry in candidates]
    if len(ids) != 11 or len(set(ids)) != 11 or "original" not in ids:
        raise ValueError("The approved catalog must have eleven choices")

    root = ET.fromstring((res / "../AndroidManifest.xml").read_text(encoding="utf-8"))
    app = root.find("application")
    if app is None:
        raise ValueError("Missing Android application")
    aliases = {
        entry.get(f"{ANDROID}name"): entry for entry in app.findall("activity-alias")
    }
    if len(aliases) != len(ids):
        raise ValueError("Launcher alias count does not match the icon catalog")
    for icon_id in ids:
        alias_name = (
            ".MainActivity" if icon_id == "original" else f"de.eimir.app.icons.{icon_id}"
        )
        alias = aliases.get(alias_name)
        if alias is None or alias.get(f"{ANDROID}icon") != f"@mipmap/app_icon_{icon_id}":
            raise ValueError(f"{icon_id}: missing or incorrectly mapped launcher alias")

        adaptive = res / "mipmap-anydpi-v26" / f"app_icon_{icon_id}.xml"
        layer = res / "drawable" / f"app_icon_{icon_id}_mask_safe.xml"
        validate_icon_xml(
            icon_id,
            adaptive.read_text(encoding="utf-8"),
            layer.read_text(encoding="utf-8"),
        )
        png = res / "drawable-nodpi" / f"app_icon_{icon_id}_foreground.png"
        with png.open("rb") as stream:
            header = stream.read(24)
        if (
            len(header) < 24
            or not header.startswith(b"\x89PNG\r\n\x1a\n")
            or struct.unpack_from(">II", header, 16) != (FOREGROUND_PX, FOREGROUND_PX)
        ):
            raise ValueError(f"{icon_id}: missing or wrongly sized source bitmap")


if __name__ == "__main__":
    validate_resource_catalog()
    print("All eleven Android adaptive launcher variants passed mask-safe validation.")
