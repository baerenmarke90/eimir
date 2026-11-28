#!/usr/bin/env python3
"""The Core wheel carries no plugin code (Decision 0017, Phase 2, #2182).

Shared by the Supply Chain job and the Core export (tools/cutover/core_export.py):
the Core distribution must not ship the Pro plugin, the operator plugin, the old
in-tree plugin object or the editorial Pro data.

Usage: check_core_wheel.py DIST_DIRECTORY
"""

from __future__ import annotations

import pathlib
import sys
import zipfile

PLUGIN_PREFIXES = ("eimir_pro/", "eimir_admin/", "eimir/pro_plugin")
EDITORIAL_MARKERS = ("date_ideas", "daily_sayings")


def plugin_files(names: list[str]) -> list[str]:
    return [
        name
        for name in names
        if name.startswith(PLUGIN_PREFIXES) or any(marker in name for marker in EDITORIAL_MARKERS)
    ]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    wheels = sorted(pathlib.Path(argv[1]).glob("eimir-*.whl"))
    if len(wheels) != 1:
        print(f"Expected one Core wheel, found {wheels}", file=sys.stderr)
        return 1
    names = zipfile.ZipFile(wheels[0]).namelist()
    found = plugin_files(names)
    if found:
        print("The Core wheel contains plugin files: " + ", ".join(found[:20]), file=sys.stderr)
        return 1
    print(f"{wheels[0].name}: {len(names)} files, no plugin file.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
