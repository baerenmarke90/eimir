#!/usr/bin/env python3
"""Measure F1 token contrast and verify exact role colors in emulator captures.

Uses Pillow from the local QA environment. Images are read without alteration.
Pixel presence within a semantic region supplements, but does not replace,
visual review: it does not establish text/background adjacency or TalkBack use.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tokens", type=Path, default=Path(__file__).resolve().parents[2] / "design/tokens.json")
    args = parser.parse_args()
    tokens = json.loads(args.tokens.read_text())
    capture_report = args.captures / "f1-android-report.json"
    provenance = json.loads(capture_report.read_text()) if capture_report.is_file() else {}
    expected_hashes = {item["name"]: item["pngSha256"] for item in provenance.get("captures", [])}

    def value(path: str) -> str:
        entry = tokens
        for key in path.split("."):
            entry = entry[key]
        raw = entry["$value"]
        return value(raw[1:-1]) if raw.startswith("{") else raw

    def color(scheme: str, role: str) -> tuple[int, int, int]:
        if role == "linkText":
            role = "brandStrong" if scheme == "light" else "brand"
        raw = value(f"color.scheme.{scheme}.{role}")
        if len(raw) != 7:
            raise ValueError(f"This sampler requires an opaque role: {role}={raw}")
        return tuple(int(raw[index:index + 2], 16) for index in (1, 3, 5))

    def luminance(rgb: tuple[int, int, int]) -> float:
        def channel(part: int) -> float:
            scaled = part / 255
            return scaled / 12.92 if scaled <= 0.04045 else ((scaled + 0.055) / 1.055) ** 2.4
        return sum(weight * channel(part) for weight, part in zip((0.2126, 0.7152, 0.0722), rgb))

    def ratio(first: tuple[int, int, int], second: tuple[int, int, int]) -> float:
        values = sorted((luminance(first), luminance(second)))
        return (values[1] + 0.05) / (values[0] + 0.05)

    # These scenes have visible consumers for the declared foreground roles.
    samples = [
        ("390-light", "light", "proof-content", "textPrimary", "background"),
        ("390-light", "light", "proof-content", "textSecondary", "background"),
        ("390-dark", "dark", "proof-content", "textPrimary", "background"),
        ("390-dark", "dark", "proof-content", "textSecondary", "background"),
        ("390-light", "light", "proof-utility-heading", "textPrimary", "background"),
        ("390-dark", "dark", "proof-utility-heading", "textPrimary", "background"),
        ("utility-selected", "light", "proof-select", "linkText", "background"),
        ("utility-selected-dark", "dark", "proof-select", "linkText", "background"),
        ("overlay", "light", "proof-overlay", "textPrimary", "surfaceRaised"),
        ("overlay-dark", "dark", "proof-overlay", "textPrimary", "surfaceRaised"),
        ("overlay", "light", "proof-overlay-heading", "textPrimary", "surfaceRaised"),
        ("overlay-dark", "dark", "proof-overlay-heading", "textPrimary", "surfaceRaised"),
        ("overlay", "light", "proof-close", "onAccent", "brandStrong"),
        ("overlay-dark", "dark", "proof-close", "onAccent", "brandStrong"),
        ("error", "light", "proof-error", "error", "surfaceSubtle"),
    ]
    results = []
    for scene, scheme, tag, foreground, background in samples:
        first, second = color(scheme, foreground), color(scheme, background)
        measured = ratio(first, second)
        result = {"scene": scene, "scheme": scheme, "semanticRegion": tag,
                  "foregroundRole": foreground, "backgroundRole": background,
                  "foregroundRgb": first, "backgroundRgb": second,
                  "tokenContrastRatio": round(measured, 3), "minimum": 4.5}
        png = args.captures / f"f1-android-{scene}.png"
        xml = args.captures / f"f1-android-{scene}.xml"
        if not provenance.get("completed"):
            result.update(passed=False, reason="Capture run is not complete")
        elif not png.is_file() or not xml.is_file():
            result.update(passed=False, reason="Missing screenshot or semantic hierarchy")
        elif hashlib.sha256(png.read_bytes()).hexdigest() != expected_hashes.get(scene):
            result.update(passed=False, reason="Screenshot does not match the completed capture report")
        else:
            nodes = ET.parse(xml).getroot().iter("node")
            node = next((item for item in nodes if item.get("resource-id", "").endswith(tag)), None)
            if node is None:
                result.update(passed=False, reason="Semantic region is not visible")
            else:
                bounds = tuple(int(number) for number in re.findall(r"-?\d+", node.attrib["bounds"]))
                with Image.open(png) as image:
                    region = image.convert("RGB").crop(bounds)
                    data = region.get_flattened_data() if hasattr(region, "get_flattened_data") else region.getdata()
                    pixels = Counter(data)
                counts = {"foreground": pixels[first], "background": pixels[second]}
                observed = counts["foreground"] >= 3 and counts["background"] >= 3
                result.update(bounds=bounds, exactTokenPixelCounts=counts,
                              passed=measured >= 4.5 and observed,
                              reason="Token contrast and exact role pixels observed" if observed else "Expected exact role pixels absent")
        results.append(result)
    report = {"passed": all(item["passed"] for item in results), "samples": results,
              "sourceCommit": provenance.get("sourceCommit"), "apkSha256": provenance.get("apkSha256"),
              "limitations": "Exact pixels in bounded semantics regions supplement token calculations; this does not prove adjacency, every text edge, focus appearance, or human assistive-technology operation."}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "samples": len(results),
                      "failed": sum(not item["passed"] for item in results)}))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
