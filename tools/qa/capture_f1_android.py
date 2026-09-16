#!/usr/bin/env python3
"""Capture F1 on a dedicated emulator, including real fixture interactions.

Requires an already booted disposable emulator and a freshly built debug APK.
No production account/backend is involved. Device settings are restored on exit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.serial.startswith("emulator-"):
        parser.error("Use a dedicated disposable emulator, never a personal device.")
    args.output.mkdir(parents=True, exist_ok=True)
    command = [args.adb, "-s", args.serial]
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    apk_digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()

    def adb(*parts: str, binary: bool = False) -> str | bytes:
        return subprocess.check_output(command + list(parts), text=not binary, timeout=120)

    def setting(namespace: str, key: str, value: str | None = None) -> str:
        if value is None:
            return str(adb("shell", "settings", "get", namespace, key)).strip()
        return str(adb("shell", "settings", "put", namespace, key, value))

    def bounds(node: ET.Element) -> tuple[int, int, int, int]:
        return tuple(int(number) for number in re.findall(r"-?\d+", node.attrib["bounds"]))

    def hierarchy() -> ET.Element:
        adb("shell", "uiautomator", "dump", "/sdcard/eimir-f1.xml")
        return ET.fromstring(adb("exec-out", "cat", "/sdcard/eimir-f1.xml"))

    def find(tag: str, tree: ET.Element | None = None) -> ET.Element | None:
        if tree is None:
            tree = hierarchy()
        return next((node for node in tree.iter("node") if node.get("resource-id", "").endswith(tag)), None)

    width_pixels, height_pixels = 780, 1688

    targets: list[dict[str, object]] = []

    def reveal(tag: str) -> ET.Element:
        for _ in range(7):
            node = find(tag)
            if node is not None:
                left, top, right, bottom = bounds(node)
                if right > left and bottom > top and bottom <= height_pixels - 32:
                    return node
            adb("shell", "input", "swipe", str(width_pixels // 2), str(height_pixels * 3 // 4), str(width_pixels // 2), str(height_pixels // 3), "250")
        raise AssertionError(f"No reachable control: {tag}")

    def tap(tag: str) -> None:
        node = reveal(tag)
        left, top, right, bottom = bounds(node)
        if tag in {"proof-back", "proof-select", "proof-overlay-open", "proof-close", "proof-retry"}:
            assert right - left >= 96 and bottom - top >= 96, (tag, bounds(node))
            targets.append({"tag": tag, "bounds": bounds(node), "minimumDp": 48})
        adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
        time.sleep(0.5)

    package = "de.sidebyside.app.debug"  # Retained installation identity; see #953.
    component = package + "/de.eimir.app.design.VisualRolesProofActivity"
    captures: list[dict[str, object]] = []
    behavior: list[str] = []

    def launch(state: str = "ready", theme: str = "light") -> None:
        adb("shell", "am", "force-stop", package)
        adb("shell", "cmd", "uimode", "night", "yes" if theme == "dark" else "no")
        result = str(adb("shell", "am", "start", "-W", "-n", component, "--es", "state", state, "--es", "theme", theme))
        if "Error" in result or "Status: timeout" in result:
            raise AssertionError(result)
        time.sleep(0.6)

    def capture(name: str, gutter: int | None = None) -> None:
        tree = hierarchy()
        screenshot = args.output / f"f1-android-{name}.png"
        screenshot.write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        ET.ElementTree(tree).write(args.output / f"f1-android-{name}.xml", encoding="utf-8")
        content = find("proof-content", tree)
        content_bounds = bounds(content) if content is not None else None
        photo = find("proof-photo", tree)
        photo_bounds = bounds(photo) if photo is not None else None
        if gutter is not None:
            # UIAutomator reports the scroll viewport including its padding.
            # Measure the rendered photo inside that viewport on ready scenes.
            assert photo_bounds is not None, "Missing rendered photo semantics"
            assert abs(photo_bounds[0] / 2 - gutter) <= 1, (name, photo_bounds, gutter)
            assert abs((width_pixels - photo_bounds[2]) / 2 - gutter) <= 1, (name, photo_bounds, gutter)
        captures.append({"name": name, "pixels": [width_pixels, height_pixels], "contentBounds": content_bounds,
                         "photoBounds": photo_bounds,
                         "pngSha256": hashlib.sha256(screenshot.read_bytes()).hexdigest()})
        print("Captured", name, flush=True)

    keys = [("system", "font_scale"), ("global", "animator_duration_scale"),
            ("global", "transition_animation_scale"), ("global", "window_animation_scale")]
    saved = {(namespace, key): setting(namespace, key) for namespace, key in keys}
    original_night = str(adb("shell", "cmd", "uimode", "night")).strip().split()[-1]
    original_size = str(adb("shell", "wm", "size"))
    original_density = str(adb("shell", "wm", "density"))
    completed = False
    try:
        adb("install", "-r", str(args.apk.resolve()))
        setting("system", "font_scale", "1.0")
        for _, key in keys[1:]:
            setting("global", key, "1.0")
        adb("shell", "wm", "density", "320")
        for width in (320, 360, 390, 430, 1280):
            width_pixels = width * 2
            height_pixels = 1688 if width < 840 else 1800
            adb("shell", "wm", "size", f"{width_pixels}x{height_pixels}")
            for theme in ("light", "dark"):
                launch(theme=theme)
                capture(f"{width}-{theme}", gutter=(16 if width < 390 else 20) if width < 840 else None)

        width_pixels, height_pixels = 780, 1688
        adb("shell", "wm", "size", "780x1688")
        for state in ("loading", "error", "empty", "offline", "success", "overlay", "photo-detail", "text-detail"):
            launch(state)
            capture(state)
        launch("overlay", "dark")
        capture("overlay-dark")
        tap("proof-close")
        assert find("proof-overlay") is None
        behavior.append("Native sheet visible Close dismisses and restores underlying content")

        launch("ready")
        tap("proof-photo-open")
        assert find("proof-back") is not None
        adb("shell", "input", "keyevent", "4")
        assert find("proof-photo-open") is not None
        behavior.append("Photo opens full detail; System Back returns to its source")
        tap("proof-text-open")
        assert find("proof-back") is not None
        tap("proof-back")
        assert find("proof-text-open") is not None
        behavior.append("Text opens readable detail; visible Back returns to its source")
        tap("proof-select")
        reveal("proof-status")
        capture("utility-selected")
        assert find("proof-status") is not None
        behavior.append("Utility selection exposes an announced fixture completion")
        tap("proof-overlay-open")
        assert find("proof-overlay") is not None
        adb("shell", "input", "keyevent", "4")
        assert find("proof-overlay") is None
        behavior.append("System Back dismisses the native sheet before the underlying task")
        launch("error")
        tap("proof-retry")
        assert find("proof-error") is None and find("proof-photo") is not None
        capture("retry-success")
        behavior.append("Failed-media Retry reveals the local photo while retaining its content")
        launch("empty")
        tap("proof-photo-open")
        assert find("proof-photo") is None
        behavior.append("A text-only memory remains without an image in detail")

        launch(theme="dark")
        tap("proof-select")
        reveal("proof-status")
        capture("utility-selected-dark")

        setting("system", "font_scale", "2.0")
        for _, key in keys[1:]:
            setting("global", key, "0.0")
        launch(theme="dark")
        capture("390-dark-large-text-reduced-motion")
        tap("proof-overlay-open")
        capture("390-dark-large-text-sheet")
        tap("proof-close")
        assert find("proof-overlay") is None
        behavior.append("200% text and disabled system animations retain operable sheet actions")
        assert hashlib.sha256(args.apk.read_bytes()).hexdigest() == apk_digest, "APK changed during capture"
        completed = True
    finally:
        for (namespace, key), value in saved.items():
            if value == "null":
                adb("shell", "settings", "delete", namespace, key)
            else:
                setting(namespace, key, value)
        adb("shell", "cmd", "uimode", "night", original_night)
        for kind, original in (("size", original_size), ("density", original_density)):
            override = re.search(r"Override .*?: (.+)", original)
            adb("shell", "wm", kind, override.group(1) if override else "reset")
        report = {"completed": completed,
                  "sourceCommit": source_commit,
                  "apkSha256": apk_digest,
                  "device": args.serial, "androidRelease": str(adb("shell", "getprop", "ro.build.version.release")).strip(),
                  "captures": captures, "behavior": behavior, "touchTargets": targets,
                  "themeControl": "Activity theme argument plus matching Android system night mode",
                  "limitations": "UIAutomator semantics and real emulator operation; no human TalkBack session or full release device matrix."}
        (args.output / "f1-android-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
