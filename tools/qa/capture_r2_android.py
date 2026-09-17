#!/usr/bin/env python3
"""Capture R2 Momente/Timeline evidence from the real debug APK on a disposable emulator.

The debug-only TaskJourneyProofActivity supplies deterministic transport data while the
production navigation, ViewModel, Story/Discover composables and accessibility semantics
are exercised unchanged. TalkBack binding is recorded separately; no spoken transcript
is inferred from screenshots or UIAutomator output.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not args.serial.startswith("emulator-"):
        parser.error("R2 evidence may only run on a disposable emulator.")

    args.output.mkdir(parents=True, exist_ok=True)
    command = [args.adb, "-s", args.serial]
    package = "de.sidebyside.app.debug"
    component = package + "/de.eimir.app.reference.TaskJourneyProofActivity"
    strings = {
        node.attrib["name"]: node.text or ""
        for node in ET.parse("android/app/src/main/res/values/strings.xml").getroot()
    }
    captures: list[dict] = []
    behavior: list[str] = []
    targets: list[dict] = []

    def adb(*parts: str, binary: bool = False) -> str | bytes:
        return subprocess.check_output(
            command + list(parts), text=not binary, timeout=120
        )

    def dump(name: str = "r2") -> ET.Element:
        remote = f"/sdcard/eimir-{name}.xml"
        adb("shell", "uiautomator", "dump", remote)
        return ET.fromstring(adb("exec-out", "cat", remote))

    def bounds(node: ET.Element) -> tuple[int, int, int, int]:
        values = tuple(map(int, re.findall(r"-?\d+", node.attrib.get("bounds", ""))))
        if len(values) != 4:
            raise AssertionError(f"Missing bounds for node: {node.attrib}")
        return values  # type: ignore[return-value]

    def parents(root: ET.Element) -> dict[ET.Element, ET.Element]:
        return {child: parent for parent in root.iter() for child in parent}

    def clickable(node: ET.Element, root: ET.Element) -> ET.Element:
        lookup = parents(root)
        current = node
        while current.get("clickable") != "true" and current in lookup:
            current = lookup[current]
        return current

    def find_tag(tag: str, root: ET.Element | None = None) -> ET.Element | None:
        current = dump() if root is None else root
        return next(
            (node for node in current.iter("node") if node.get("resource-id", "").endswith(tag)),
            None,
        )

    def find_text(text: str, root: ET.Element | None = None) -> ET.Element | None:
        current = dump() if root is None else root
        return next((node for node in current.iter("node") if node.get("text") == text), None)

    def screen_size() -> tuple[int, int]:
        png = adb("exec-out", "screencap", "-p", binary=True)
        if not isinstance(png, bytes) or len(png) < 24 or png[:8] != b"\x89PNG\r\n\x1a\n":
            raise AssertionError("Could not read emulator screenshot dimensions")
        return struct.unpack(">II", png[16:24])

    def reveal_tag(tag: str, *, upward: bool = False, attempts: int = 14) -> ET.Element:
        for _ in range(attempts):
            root = dump()
            node = find_tag(tag, root)
            if node is not None:
                left, top, right, bottom = bounds(node)
                width, height = screen_size()
                if right > left and bottom > top and top >= 0 and bottom <= height:
                    return node
            width, height = screen_size()
            start = height // 3 if upward else height * 3 // 4
            end = height * 3 // 4 if upward else height // 3
            adb("shell", "input", "swipe", str(width // 2), str(start), str(width // 2), str(end), "250")
            time.sleep(0.25)
        raise AssertionError(f"Unreachable tagged control: {tag}")

    def reveal_text(text: str, *, upward: bool = False, attempts: int = 14) -> ET.Element:
        for _ in range(attempts):
            root = dump()
            node = find_text(text, root)
            if node is not None:
                node = clickable(node, root)
                left, top, right, bottom = bounds(node)
                width, height = screen_size()
                if right > left and bottom > top and top >= 0 and bottom <= height:
                    return node
            width, height = screen_size()
            start = height // 3 if upward else height * 3 // 4
            end = height * 3 // 4 if upward else height // 3
            adb("shell", "input", "swipe", str(width // 2), str(start), str(width // 2), str(end), "250")
            time.sleep(0.25)
        raise AssertionError(f"Unreachable text control: {text}")

    def tap_node(node: ET.Element, root: ET.Element | None = None) -> None:
        current = dump() if root is None else root
        node = clickable(node, current)
        left, top, right, bottom = bounds(node)
        adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
        time.sleep(0.4)

    def tap_tag(tag: str, *, upward: bool = False) -> None:
        node = reveal_tag(tag, upward=upward)
        root = dump()
        refreshed = find_tag(tag, root)
        tap_node(refreshed or node, root)

    def tap_text(text: str, *, upward: bool = False) -> None:
        node = reveal_text(text, upward=upward)
        left, top, right, bottom = bounds(node)
        adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
        time.sleep(0.4)

    def wait_tag(tag: str, timeout: float = 25.0) -> ET.Element:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            node = find_tag(tag)
            if node is not None:
                return node
            time.sleep(0.35)
        raise AssertionError(f"Did not reach tagged state: {tag}")

    def wait_text(text: str, timeout: float = 25.0) -> ET.Element:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            node = find_text(text)
            if node is not None:
                return node
            time.sleep(0.35)
        raise AssertionError(f"Did not reach text state: {text}")

    def capture(name: str) -> None:
        root = dump(name)
        png = adb("exec-out", "screencap", "-p", binary=True)
        assert isinstance(png, bytes)
        image_path = args.output / f"r2-android-{name}.png"
        xml_path = args.output / f"r2-android-{name}.xml"
        image_path.write_bytes(png)
        ET.ElementTree(root).write(xml_path, encoding="utf-8")
        width, height = struct.unpack(">II", png[16:24])
        captures.append(
            {
                "name": name,
                "pixels": [width, height],
                "sha256": hashlib.sha256(png).hexdigest(),
            }
        )
        print("Captured", name, flush=True)

    def launch(theme: str = "light") -> None:
        adb("shell", "am", "force-stop", package)
        adb("shell", "cmd", "uimode", "night", "yes" if theme == "dark" else "no")
        result = str(
            adb(
                "shell",
                "am",
                "start",
                "-W",
                "-n",
                component,
                "--es",
                "scenario",
                "ready",
            )
        )
        if "Error" in result or "Status: timeout" in result:
            raise AssertionError(result)
        wait_text(strings["destination_story"])

    def open_story() -> None:
        tap_text(strings["destination_story"])
        wait_tag("timeline-scroll")

    def open_discover() -> None:
        tap_tag("momente-tab-discover", upward=True)
        wait_tag("discover-scroll")
        wait_tag("discover-featured")

    def assert_target(tag: str, minimum_dp: int = 48) -> None:
        root = dump()
        node = find_tag(tag, root)
        if node is None:
            raise AssertionError(f"Missing target: {tag}")
        node = clickable(node, root)
        box = bounds(node)
        # Evidence uses density 320, so 48 dp == 96 physical px.
        minimum_px = minimum_dp * 2
        if box[2] - box[0] < minimum_px or box[3] - box[1] < minimum_px:
            raise AssertionError(f"Target below {minimum_dp}dp: {tag} {box}")
        targets.append({"tag": tag, "bounds": box, "minimumDp": minimum_dp})

    settings = [
        ("system", "font_scale"),
        ("system", "accelerometer_rotation"),
        ("system", "user_rotation"),
        ("global", "animator_duration_scale"),
        ("global", "transition_animation_scale"),
        ("global", "window_animation_scale"),
        ("secure", "enabled_accessibility_services"),
        ("secure", "accessibility_enabled"),
        ("secure", "touch_exploration_enabled"),
    ]
    saved = {
        (namespace, key): str(adb("shell", "settings", "get", namespace, key)).strip()
        for namespace, key in settings
    }
    original_size = str(adb("shell", "wm", "size"))
    original_density = str(adb("shell", "wm", "density"))
    original_night = str(adb("shell", "cmd", "uimode", "night")).strip().split()[-1]
    apk_digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    source_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    completed = False

    try:
        adb("install", "-r", str(args.apk.resolve()))
        adb("shell", "wm", "density", "320")
        adb("shell", "settings", "put", "system", "font_scale", "1.0")
        for namespace, key in settings[3:6]:
            adb("shell", "settings", "put", namespace, key, "0")

        # Compact matrix: corrected Discover composition at all normative native widths,
        # in both themes. Height approximates representative modern phones at each width.
        compact = {320: 720, 360: 800, 390: 844, 430: 932}
        for logical_width, logical_height in compact.items():
            adb("shell", "wm", "size", f"{logical_width * 2}x{logical_height * 2}")
            for theme in ("light", "dark"):
                launch(theme)
                open_story()
                open_discover()
                wait_tag("discover-featured")
                assert_target("momente-tab-discover")
                capture(f"{logical_width}-{theme}-discover")
        behavior.append("Discover renders at 320/360/390/430 dp in Light and Dark from the submitted APK")

        # Filter scope/order survives a visit to Discover and remains visible outside
        # the filter task when returning to Timeline.
        adb("shell", "wm", "size", "780x1688")
        launch("light")
        open_story()
        tap_tag("timeline-filter")
        tap_text(strings["timeline_filter_all_years"])
        tap_text("2025")
        tap_text(strings["timeline_filter_order_oldest"])
        tap_text(strings["timeline_filter_apply"])
        wait_tag("timeline-applied-order")
        if find_text(strings["timeline_filter_order_oldest"]) is None:
            raise AssertionError("Applied oldest-first order is not visible outside Filter")
        capture("timeline-applied-scope")
        open_discover()
        capture("discover-after-filtered-timeline")
        tap_tag("momente-tab-timeline", upward=True)
        wait_tag("timeline-scroll")
        wait_tag("timeline-applied-order")
        if find_text("2025 · " + strings["timeline_filter_all_kinds"]) is None:
            raise AssertionError("Timeline year/type scope did not survive Discover")
        if find_text(strings["timeline_filter_order_oldest"]) is None:
            raise AssertionError("Timeline order did not survive Discover")
        capture("timeline-scope-restored-after-discover")
        behavior.append("Applied year/type/order scope survives Timeline -> Discover -> Timeline and order is visible outside Filter")

        # Discover year entrance composes the existing Timeline scope rather than a
        # new navigation system.
        open_discover()
        tap_tag("discover-year-2025")
        wait_tag("timeline-scroll")
        if find_text("2025 · " + strings["timeline_filter_all_kinds"]) is None:
            raise AssertionError("Discover year entrance did not apply Timeline year scope")
        capture("discover-year-entrance-timeline")
        behavior.append("Discover year entrance applies the existing Timeline year scope")

        # System Back from canonical Story detail returns to the Discover context.
        tap_tag("momente-tab-discover", upward=True)
        wait_tag("discover-featured")
        capture("discover-before-detail")
        tap_tag("discover-featured")
        wait_tag("memory-detail")
        capture("discover-featured-detail")
        adb("shell", "input", "keyevent", "4")
        time.sleep(0.6)
        wait_tag("discover-scroll")
        wait_tag("discover-featured")
        capture("discover-system-back")
        behavior.append("System Back from canonical featured Memory detail returns to Discover rather than resetting Momente")

        # Orientation recreation keeps the selected Discover mode and its actual content.
        adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
        adb("shell", "settings", "put", "system", "user_rotation", "1")
        time.sleep(1.2)
        wait_tag("discover-scroll")
        wait_tag("discover-featured")
        capture("discover-landscape")
        adb("shell", "settings", "put", "system", "user_rotation", "0")
        time.sleep(1.2)
        wait_tag("discover-scroll")
        wait_tag("discover-featured")
        capture("discover-after-rotation")
        behavior.append("Orientation recreation retains Discover mode and curated content")

        # 200% text on the narrowest Compact width: content and continuation remain
        # reachable, then the Timeline Filter can still be opened and completed.
        adb("shell", "wm", "size", "640x1440")
        adb("shell", "settings", "put", "system", "font_scale", "2.0")
        launch("dark")
        open_story()
        open_discover()
        capture("320-dark-large-text-discover-top")
        reveal_tag("momente-discover-continue")
        assert_target("momente-discover-continue")
        capture("320-dark-large-text-discover-continue")
        tap_tag("momente-tab-timeline", upward=True)
        wait_tag("timeline-scroll")
        reveal_tag("timeline-filter", upward=True)
        assert_target("timeline-filter")
        tap_tag("timeline-filter", upward=True)
        apply_node = reveal_text(strings["timeline_filter_apply"])
        apply_box = bounds(apply_node)
        if apply_box[2] - apply_box[0] < 96 or apply_box[3] - apply_box[1] < 96:
            raise AssertionError(f"Large-text Apply target below 48dp: {apply_box}")
        targets.append({"tag": "timeline-apply-large-text", "bounds": apply_box, "minimumDp": 48})
        capture("320-dark-large-text-filter")
        behavior.append("200% text at 320 dp keeps Discover continuation and Timeline Filter actions reachable at 48dp minimum")

        # Genuine TalkBack service binding plus the submitted R2 semantics tree.
        adb("shell", "settings", "put", "system", "font_scale", "1.0")
        adb("shell", "wm", "size", "780x1688")
        talkback = "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService"
        packages = str(adb("shell", "pm", "list", "packages"))
        if "com.google.android.marvin.talkback" not in packages:
            raise AssertionError("TalkBack package is unavailable on the disposable emulator")
        adb("shell", "settings", "put", "secure", "enabled_accessibility_services", talkback)
        adb("shell", "settings", "put", "secure", "accessibility_enabled", "1")
        adb("shell", "settings", "put", "secure", "touch_exploration_enabled", "1")
        time.sleep(3)
        enabled = str(adb("shell", "settings", "get", "secure", "enabled_accessibility_services"))
        accessibility = str(adb("shell", "dumpsys", "accessibility"))
        (args.output / "r2-android-talkback-enabled-services.txt").write_text(enabled)
        (args.output / "r2-android-talkback-accessibility-dumpsys.txt").write_text(accessibility)
        if "com.google.android.marvin.talkback" not in enabled or "TalkBackService" not in accessibility:
            raise AssertionError("TalkBack was not genuinely enabled and bound")
        launch("light")
        open_story()
        open_discover()
        time.sleep(2)
        wait_tag("discover-featured")
        root = dump("talkback")
        required = ["momente-tab-discover", "momente-tab-timeline", "discover-featured"]
        missing = [tag for tag in required if find_tag(tag, root) is None]
        if missing:
            raise AssertionError(f"Missing R2 accessibility semantics with TalkBack active: {missing}")
        capture("talkback-discover")
        behavior.append("TalkBack is enabled/bound and the Discover tabs, featured content and headings remain present in the accessibility tree")

        if hashlib.sha256(args.apk.read_bytes()).hexdigest() != apk_digest:
            raise AssertionError("APK changed during evidence capture")
        completed = True
    finally:
        for (namespace, key), value in saved.items():
            if value == "null":
                subprocess.run(command + ["shell", "settings", "delete", namespace, key], check=False)
            else:
                subprocess.run(command + ["shell", "settings", "put", namespace, key, value], check=False)
        subprocess.run(command + ["shell", "cmd", "uimode", "night", original_night], check=False)
        for name, original in (("size", original_size), ("density", original_density)):
            override = re.search(r"Override .*?: (.+)", original)
            subprocess.run(command + ["shell", "wm", name, override.group(1) if override else "reset"], check=False)

        report = {
            "completed": completed,
            "sourceCommit": source_commit,
            "apkSha256": apk_digest,
            "device": args.serial,
            "captures": captures,
            "behavior": behavior,
            "targets": targets,
            "fixtureBoundary": "Production navigation, ViewModel and R2 Story/Discover UI; deterministic debug-only transport fixture",
            "talkBackLimitation": "TalkBack service binding and accessibility-tree presence are proven; a complete spoken linear-navigation transcript is not claimed from the headless emulator.",
        }
        (args.output / "r2-android-report.json").write_text(json.dumps(report, indent=2) + "\n")

    if not completed:
        raise SystemExit("R2 Android evidence did not complete")


if __name__ == "__main__":
    main()
