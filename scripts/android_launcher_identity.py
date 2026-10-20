"""Verify the default launcher and its switchable aliases in a packaged APK."""

import argparse
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = "{http://schemas.android.com/apk/res/android}"
ORIGINAL = "de.eimir.app.MainActivity"
SHELL = "de.eimir.app.LauncherActivity"
CHOICES = {
    ORIGINAL,
    *(f"de.eimir.app.icons.{name}" for name in (
        "sunset", "sage", "daylight", "lavender", "sand", "midnight",
        "pearl", "dark", "monochrome", "minimal",
    )),
}


def launcher_identity(manifest: str) -> str:
    root = ET.fromstring(manifest)
    app = root.find("application")
    if app is None or app.get(f"{ANDROID}enabled", "true") != "true":
        raise ValueError("Android application must be enabled")
    shell = app.find(f"activity[@{ANDROID}name='{SHELL}']")
    if shell is None or shell.get(f"{ANDROID}enabled", "true") != "true":
        raise ValueError("Permanent Android shell is missing or disabled")
    launchers = []
    for component in list(app):
        for intent in component.findall("intent-filter"):
            main = intent.find(f"action[@{ANDROID}name='android.intent.action.MAIN']")
            launcher = intent.find(f"category[@{ANDROID}name='android.intent.category.LAUNCHER']")
            if main is not None and launcher is not None:
                launchers.append(component)
    names = [entry.get(f"{ANDROID}name") for entry in launchers]
    if len(names) != len(CHOICES) or set(names) != CHOICES:
        raise ValueError("Packaged launcher catalog does not match the approved eleven choices")
    enabled = []
    for entry in launchers:
        if entry.tag != "activity-alias" or entry.get(f"{ANDROID}targetActivity") != SHELL:
            raise ValueError("Every launcher must alias the permanent shell")
        if entry.get(f"{ANDROID}exported") != "true" or not entry.get(f"{ANDROID}icon"):
            raise ValueError("Every launcher must have an exported entry and explicit icon")
        if entry.get(f"{ANDROID}enabled", "true") == "true":
            enabled.append(entry.get(f"{ANDROID}name"))
    if enabled != [ORIGINAL]:
        raise ValueError("Original must be the only initially enabled launcher")
    return ORIGINAL


def apk_launcher_identity(apk: Path, analyzer: Path) -> str:
    manifest = subprocess.check_output([str(analyzer), "manifest", "print", str(apk)], text=True)
    return launcher_identity(manifest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--analyzer", required=True, type=Path)
    args = parser.parse_args()
    print(apk_launcher_identity(args.apk, args.analyzer))
