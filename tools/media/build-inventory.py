"""List every source file that contributes to the restricted ffmpeg build.

ffmpeg's build writes one make dependency file (``*.d``) next to every object it
compiles. Their union is the exact set of translation units, included templates
and headers that reach the shipped binary, so it is the evidence that a codec
advisory names code that is (or is not) part of the product.
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

SOURCE_SUFFIXES = (".c", ".h", ".S", ".m", ".cpp", ".asm")


def dependency_paths(path: Path) -> set[str]:
    """Parse one make dependency file and return its in-tree source paths."""
    text = path.read_text(encoding="utf-8", errors="strict").replace("\\\n", " ")
    found: set[str] = set()
    for rule in text.splitlines():
        _, separator, prerequisites = rule.partition(":")
        if not separator:
            continue
        for token in prerequisites.split():
            token = token.removeprefix("./")
            if not token.startswith("/") and token.endswith(SOURCE_SUFFIXES):
                found.add(token)
    return found


def inventory(source_dir: Path) -> list[str]:
    files = sorted(source_dir.rglob("*.d"))
    if not files:
        raise SystemExit(f"No dependency files below {source_dir}; build ffmpeg first.")
    paths: set[str] = set()
    for dependency in files:
        paths |= dependency_paths(dependency)
    return sorted(paths)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", type=Path, help="write the inventory to this file")
    mode.add_argument("--check", type=Path, help="fail when the build differs from this file")
    arguments = parser.parse_args()
    current = inventory(arguments.source_dir)
    if arguments.write:
        arguments.write.write_text("\n".join(current) + "\n", encoding="utf-8", newline="\n")
        print(f"Wrote {len(current)} source paths to {arguments.write}.")
        return 0
    recorded = (
        arguments.check.read_text(encoding="utf-8").splitlines() if arguments.check.exists() else []
    )
    if recorded == current:
        print(f"Build inventory matches the recorded {len(recorded)} source paths.")
        return 0
    print("The built source set differs from the recorded inventory:")
    sys.stdout.writelines(
        line + "\n"
        for line in difflib.unified_diff(recorded, current, "recorded", "built", lineterm="", n=0)
    )
    print("Rerun with --write, review the change against the advisory record and commit it.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
