"""Convert the Web eimir. outline icon grammar (#1225) into Compose path data.

Usage: python3 android-native-test/tools/generate_icons.py

Reads web/src/components/EimirIcon.tsx and writes EimirIconData.kt so the
native client draws the identical owner-selected icons instead of a generic
icon set. Only the outline variant is converted; stroke roles map to the same
semantic colours the Web CSS uses (accent -> private, cool -> sharedAccent).
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "web/src/components/EimirIcon.tsx"
TARGET = ROOT / "android-native-test/app/src/main/java/de/eimir/nativetest/ui/icons/EimirIconData.kt"

ATTR = re.compile(r'([a-zA-Z]+)="([^"]*)"')
ELEMENT = re.compile(r"<(circle|rect|path|line)\b([^>]*)/>", re.S)
ENTRY = re.compile(r"^  ([a-z]+): \(\s*$")


def number(value: str) -> float:
    return float(value)


def fmt(value: float) -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-0") else "0"


def circle(attrs: dict[str, str]) -> str:
    cx, cy, r = number(attrs["cx"]), number(attrs["cy"]), number(attrs["r"])
    return (
        f"M{fmt(cx - r)},{fmt(cy)}a{fmt(r)},{fmt(r)} 0 1,0 {fmt(2 * r)},0"
        f"a{fmt(r)},{fmt(r)} 0 1,0 {fmt(-2 * r)},0Z"
    )


def rect(attrs: dict[str, str]) -> str:
    x, y = number(attrs["x"]), number(attrs["y"])
    w, h = number(attrs["width"]), number(attrs["height"])
    rx = min(number(attrs.get("rx", "0")), w / 2, h / 2)
    if rx == 0:
        return f"M{fmt(x)},{fmt(y)}h{fmt(w)}v{fmt(h)}h{fmt(-w)}Z"
    return (
        f"M{fmt(x + rx)},{fmt(y)}h{fmt(w - 2 * rx)}a{fmt(rx)},{fmt(rx)} 0 0,1 {fmt(rx)},{fmt(rx)}"
        f"v{fmt(h - 2 * rx)}a{fmt(rx)},{fmt(rx)} 0 0,1 {fmt(-rx)},{fmt(rx)}"
        f"h{fmt(-(w - 2 * rx))}a{fmt(rx)},{fmt(rx)} 0 0,1 {fmt(-rx)},{fmt(-rx)}"
        f"v{fmt(-(h - 2 * rx))}a{fmt(rx)},{fmt(rx)} 0 0,1 {fmt(rx)},{fmt(-rx)}Z"
    )


def role(attrs: dict[str, str], raw: str) -> str:
    css = attrs.get("className", "")
    if css == "accent":
        return "Accent"
    if css == "cool":
        return "Cool"
    if css == "icon-fill-accent":
        return "AccentFill"
    if "--color-on-accent" in raw:
        return "OnAccent"
    if "--color-surface-raised" in raw:
        return "Surface"
    return "Base"


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("const OUTLINE"))
    icons: dict[str, list[tuple[str, str]]] = {}
    current: str | None = None
    buffer: list[str] = []
    for line in lines[start + 1 :]:
        if line.startswith("};"):
            break
        match = ENTRY.match(line)
        if match:
            current, buffer = match.group(1), []
            continue
        if current and line.startswith("  ),"):
            parts: list[tuple[str, str]] = []
            for kind, raw in ELEMENT.findall("\n".join(buffer)):
                attrs = dict(ATTR.findall(raw))
                if kind == "circle":
                    data = circle(attrs)
                elif kind == "rect":
                    data = rect(attrs)
                elif kind == "line":
                    data = f"M{attrs['x1']},{attrs['y1']}L{attrs['x2']},{attrs['y2']}"
                else:
                    data = attrs["d"]
                parts.append((role(attrs, raw), data))
            icons[current] = parts
            current = None
            continue
        if current:
            buffer.append(line)

    out = [
        "package de.eimir.nativetest.ui.icons",
        "",
        "// Generated from web/src/components/EimirIcon.tsx by",
        "// android-native-test/tools/generate_icons.py. Do not edit by hand.",
        "",
        "internal val EIMIR_ICON_DATA: Map<String, List<IconStroke>> = mapOf(",
    ]
    for name, parts in icons.items():
        out.append(f'    "{name}" to listOf(')
        for kind, data in parts:
            out.append(f'        IconStroke(IconRole.{kind}, "{data}"),')
        out.append("    ),")
    out.append(")")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"{len(icons)} icons -> {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
