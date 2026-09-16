#!/usr/bin/env python3
"""Exercise the real F2 Android task on a disposable emulator with debug transport fixtures.

Screenshots are untouched device output. This is not a substitute for TalkBack:
the report inventories services and keeps separate assistive-technology evidence.
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
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--skip-matrix", action="store_true", help="Diagnostic behavior-only run; final evidence uses the full matrix.")
    args = parser.parse_args()
    if not args.serial.startswith("emulator-"):
        parser.error("Only a disposable task emulator may be used.")
    args.output.mkdir(parents=True, exist_ok=True)
    command = [args.adb, "-s", args.serial]
    package = "de.sidebyside.app.debug"
    component = package + "/de.eimir.app.reference.TaskJourneyProofActivity"
    strings = {n.attrib["name"]: n.text or "" for n in ET.parse("android/app/src/main/res/values/strings.xml").getroot()}
    captures: list[dict] = []
    behavior: list[str] = []
    targets: list[dict] = []
    width, height = 780, 1688

    def adb(*parts: str, binary: bool = False) -> str | bytes:
        return subprocess.check_output(command + list(parts), text=not binary, timeout=120)

    def tree() -> ET.Element:
        adb("shell", "uiautomator", "dump", "/sdcard/eimir-f2.xml")
        return ET.fromstring(adb("exec-out", "cat", "/sdcard/eimir-f2.xml"))

    def bounds(node: ET.Element) -> tuple[int, ...]:
        return tuple(map(int, re.findall(r"-?\d+", node.attrib["bounds"])))

    def find(value: str, *, text: bool = False, root: ET.Element | None = None) -> ET.Element | None:
        root = tree() if root is None else root
        node = next((n for n in root.iter("node") if
                     (n.get("text") == value if text else n.get("resource-id", "").endswith(value))), None)
        # Material modal windows have a separate semantics root, so the debug
        # Activity's resource-ID export does not cover their Compose test tags.
        modal_labels = {
            "timeline-year": strings["timeline_filter_all_years"],
            "timeline-apply": strings["timeline_filter_apply"],
            "task-sheet-close": strings["task_sheet_close"],
        }
        if node is None and not text and value in modal_labels:
            node = next((n for n in root.iter("node") if n.get("text") == modal_labels[value]), None)
            if node is not None:
                parents = {child: parent for parent in root.iter() for child in parent}
                while node.get("clickable") != "true" and node in parents:
                    node = parents[node]
        return node

    def reveal(value: str, *, text: bool = False, upward: bool = False) -> ET.Element:
        for _ in range(12):
            node = find(value, text=text)
            if node is not None:
                left, top, right, bottom = bounds(node)
                if right > left and bottom > top and top >= 24 and bottom < height - 25:
                    return node
            start, end = (height // 3, height * 3 // 4) if upward else (height * 3 // 4, height // 3)
            adb("shell", "input", "swipe", str(width // 2), str(start), str(width // 2), str(end), "250")
        raise AssertionError(f"Unreachable control: {value}")

    def tap(value: str, *, text: bool = False, upward: bool = False) -> None:
        node = reveal(value, text=text, upward=upward)
        left, top, right, bottom = bounds(node)
        if not text and value in {"quick-create-trigger", "task-sheet-close", "memory-create-close", "memory-create-save", "timeline-filter", "timeline-apply", "memory-detail-back"}:
            assert right - left >= 96 and bottom - top >= 96, (value, bounds(node))
            targets.append({"tag": value, "bounds": bounds(node), "minimumDp": 48})
        adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
        time.sleep(0.35)

    def label(key: str) -> None:
        tap(strings[key], text=True)

    def back() -> None:
        adb("shell", "input", "keyevent", "4")
        time.sleep(0.35)

    def capture(name: str) -> None:
        hierarchy = tree()
        path = args.output / f"f2-android-{name}.png"
        path.write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        ET.ElementTree(hierarchy).write(args.output / f"f2-android-{name}.xml", encoding="utf-8")
        captures.append({"name": name, "pixels": [width, height], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        print("Captured", name, flush=True)

    def launch(scenario: str = "ready", *, theme: str = "light", direct: str | None = None) -> None:
        adb("shell", "am", "force-stop", package)
        adb("shell", "cmd", "uimode", "night", "yes" if theme == "dark" else "no")
        extras = ["--es", "scenario", scenario]
        if direct:
            extras += ["--es", "direct", direct]
        result = str(adb("shell", "am", "start", "-W", "-n", component, *extras))
        assert "Error" not in result and "Status: timeout" not in result, result
        time.sleep(0.7)

    def open_task() -> None:
        tap("quick-create-trigger")
        label("quick_create_memory")
        assert find("memory-create-title") is not None
        assert find("quick-create-trigger") is None

    def type_words() -> None:
        tap("memory-create-title")
        adb("shell", "input", "text", "F2%sshared%smemory")
        tap("memory-create-body")
        adb("shell", "input", "text", "A%squiet%smoment%sto%sremember.")

    def wait_for(tag: str, limit: float = 25) -> None:
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            if find(tag) is not None:
                return
            time.sleep(0.4)
        raise AssertionError(f"Did not reach {tag}")

    keys = [("system", "font_scale"), ("system", "accelerometer_rotation"), ("system", "user_rotation"),
            ("global", "animator_duration_scale"), ("global", "transition_animation_scale"), ("global", "window_animation_scale")]
    saved = {(ns, key): str(adb("shell", "settings", "get", ns, key)).strip() for ns, key in keys}
    size = str(adb("shell", "wm", "size"))
    density = str(adb("shell", "wm", "density"))
    night = str(adb("shell", "cmd", "uimode", "night")).strip().split()[-1]
    apk_digest = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    source = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    completed = False
    try:
        adb("install", "-r", str(args.apk.resolve()))
        adb("shell", "wm", "density", "320")
        adb("shell", "settings", "put", "system", "font_scale", "1.0")
        for logical_width in (() if args.skip_matrix else (320, 360, 390, 430, 1280)):
            width, height = logical_width * 2, 1688 if logical_width < 840 else 1800
            adb("shell", "wm", "size", f"{width}x{height}")
            for theme in ("light", "dark"):
                launch(theme=theme)
                tap("quick-create-trigger")
                capture(f"{logical_width}-{theme}-quick-create")
                label("quick_create_memory")
                capture(f"{logical_width}-{theme}-composer")

        width, height = 780, 1688
        adb("shell", "wm", "size", "780x1688")
        launch(); open_task(); type_words()
        ime = str(adb("shell", "dumpsys", "input_method"))
        assert re.search(r"mInputShown=true|isInputViewShown=true|mShowRequested=true", ime), "IME did not open after explicit input"
        capture("ime-input")
        back()
        assert find("memory-create-title") is not None, "IME Back exited the task"
        behavior.append("Explicit typing opens IME; first System Back hides it without leaving the draft")
        adb("shell", "input", "keyevent", "3")
        adb("shell", "am", "start", "-n", component, "--activity-reorder-to-front")
        assert find("F2 shared memory", text=True) is not None
        behavior.append("Home and Activity return retain the in-memory draft")
        adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
        adb("shell", "settings", "put", "system", "user_rotation", "1")
        time.sleep(1)
        adb("shell", "settings", "put", "system", "user_rotation", "0")
        time.sleep(1)
        assert find("F2 shared memory", text=True) is not None
        assert find("A quiet moment to remember.", text=True) is not None
        capture("draft-after-rotation")
        behavior.append("Activity rotation and return retain title/body in the task ViewModel")
        tap("memory-create-save")
        wait_for("memory-detail")
        capture("confirmed-result")
        tap("memory-detail-back", upward=True)
        assert find("quick-create-trigger") is not None
        behavior.append("Confirmed save opens the actual full Memory; visible Back returns to the original root")

        launch(); open_task(); type_words(); back(); back()
        assert find(strings["memory_task_discard"], text=True) is not None
        label("memory_task_keep")
        tap("memory-create-close", upward=True)
        label("memory_task_discard")
        assert find("memory-create-scroll") is None
        behavior.append("Dirty System Back offers keep/discard; keeping retains input and deliberate discard exits")

        launch("pending"); open_task(); type_words(); back(); tap("memory-create-save"); back()
        assert find(strings["memory_task_wait"], text=True) is not None
        capture("pending-exit-explanation")
        label("memory_task_wait")
        wait_for("memory-detail", limit=65)
        behavior.append("Pending System Back explains why the task stays open; completion opens the actual result")

        for scenario in ("rejected", "uncertain", "offline", "refresh-failure"):
            launch(scenario); open_task(); type_words(); back(); tap("memory-create-save")
            wait_for("memory-detail" if scenario == "refresh-failure" else "memory-create-problem")
            capture(scenario)
            if scenario == "uncertain":
                assert find("memory-create-save") is None
            behavior.append(f"{scenario}: expected confirmed or retained-draft boundary visible")

        launch("denied"); open_task(); type_words(); back(); tap("memory-create-save")
        wait_for("memory-detail-back")
        assert find("F2 shared memory", text=True) is None
        capture("denied-result")
        tap("memory-detail-back")
        assert find("quick-create-trigger") is not None
        behavior.append("Denied canonical read hides retained content and preserves a safe Back action")

        launch(); label("destination_story"); tap("timeline-filter"); tap("timeline-year")
        back()
        assert find("task-sheet-close") is not None
        back()
        assert find("task-sheet-close") is None
        behavior.append("Nested year-menu System Back closes the menu before the filter sheet")
        tap("timeline-filter"); tap("timeline-year"); tap("2025", text=True)
        tap("task-sheet-close")
        assert find(strings["timeline_filter_all_years"] + " · " + strings["timeline_filter_all_kinds"], text=True) is not None
        tap("timeline-filter"); tap("timeline-year"); tap("2025", text=True)
        label("story_kind_memory"); tap("timeline-apply")
        label("load_more")
        older = "story-memory-00000000-0000-03be-0000-000000000009"
        before = bounds(reveal(older))
        capture("scoped-older-position")
        tap(older); wait_for("memory-detail"); capture("scoped-older-detail"); back()
        assert bounds(reveal(older)) == before
        capture("scoped-older-return")
        behavior.append("Applied year/type and loaded older-page position survive canonical detail and System Back")

        launch(direct="create")
        tap("memory-create-close")
        wait_for("timeline-scroll")
        behavior.append("Direct composer without an origin falls back to canonical Moments")
        launch(direct="memory")
        tap("memory-detail-back")
        wait_for("timeline-scroll")
        behavior.append("Direct detail without an origin falls back to canonical Moments")

        adb("shell", "settings", "put", "system", "font_scale", "2.0")
        for _, key in keys[3:]:
            adb("shell", "settings", "put", "global", key, "0")
        launch(theme="dark"); tap("quick-create-trigger"); capture("large-text-reduced-motion-sheet")
        label("quick_create_memory"); capture("large-text-reduced-motion-composer")
        assert find("memory-create-close") is not None
        behavior.append("200% text and reduced system animation retain short-sheet and task actions")
        assert hashlib.sha256(args.apk.read_bytes()).hexdigest() == apk_digest
        completed = True
    finally:
        for (ns, key), value in saved.items():
            adb("shell", "settings", "delete" if value == "null" else "put", ns, key, *([] if value == "null" else [value]))
        adb("shell", "cmd", "uimode", "night", night)
        for name, original in (("size", size), ("density", density)):
            override = re.search(r"Override .*?: (.+)", original)
            adb("shell", "wm", name, override.group(1) if override else "reset")
        report = {"completed": completed, "matrixIncluded": not args.skip_matrix, "sourceCommit": source, "apkSha256": apk_digest,
                  "device": args.serial, "captures": captures, "behavior": behavior, "targets": targets,
                  "fixtureBoundary": "Production route, ViewModel, task, picker and detail; deterministic debug-only transport",
                  "limitations": "TalkBack and photo-picker device results are recorded separately; none is inferred from screenshots."}
        (args.output / "f2-android-report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
