"""Fail closed when reviewed codec/color dependency advisory evidence changes.

ffmpeg publishes advisories for every codec, so the feed is filtered by what the
restricted build actually compiles (``built-sources.txt``, written by
``build-inventory.py`` from the real build). An advisory that names only source
files outside that set cannot affect the product and needs no review. An
advisory that names a built file, an architecture-specific file, or no
resolvable file stays fail-closed until ``advisory-review.json`` records it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.request import urlopen

FEED = "https://security-tracker.debian.org/tracker/data/json"
HERE = Path(__file__).parent
SOURCE_PATH = re.compile(
    r"\b((?:libav\w+|libsw\w+|libpostproc|fftools|compat)/[\w+./-]*?\.(?:c|h|S|m|cpp|asm))\b"
)
ARCH_DIRECTORIES = {
    "x86",
    "aarch64",
    "arm",
    "ppc",
    "riscv",
    "loongarch",
    "mips",
    "sparc",
    "alpha",
    "bfin",
    "tomi",
}


def findings(data: dict, package: str = "ffmpeg") -> dict[str, str]:
    result = {}
    for identifier, value in data.get(package, {}).items():
        status = value.get("releases", {}).get("sid", {}).get("status")
        if status not in {None, "resolved"}:
            evidence = json.dumps(
                {"description": value["description"], "status": status},
                sort_keys=True,
                separators=(",", ":"),
            )
            result[identifier] = hashlib.sha256(evidence.encode()).hexdigest()
    return result


def is_relevant(description: str, built: set[str]) -> bool:
    """True when the advisory can concern the shipped build or cannot be placed."""
    paths = SOURCE_PATH.findall(description)
    if not paths:
        return True
    for path in paths:
        if path in built or ARCH_DIRECTORIES.intersection(path.split("/")[1:-1]):
            return True
    return False


def relevant_findings(data: dict, built: set[str], package: str = "ffmpeg") -> dict[str, str]:
    entries = data.get(package, {})
    return {
        identifier: digest
        for identifier, digest in findings(data, package).items()
        if is_relevant(entries[identifier]["description"], built)
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed-file", type=Path)
    parser.add_argument("--inventory", type=Path, default=HERE / "built-sources.txt")
    arguments = parser.parse_args()
    if arguments.feed_file:
        data = json.loads(arguments.feed_file.read_bytes())
    else:
        with urlopen(FEED, timeout=60) as response:
            data = json.load(response)
    built = set(arguments.inventory.read_text(encoding="utf-8").split())
    if not built:
        print(f"{arguments.inventory} is empty; regenerate it with build-inventory.py.")
        return 1
    baseline = json.loads((HERE / "advisory-review.json").read_text())
    changed = []
    # ffmpeg: every advisory that concerns built code must carry a matching review.
    expected = {key: value["evidenceSha256"] for key, value in baseline["findings"].items()}
    actual = relevant_findings(data, built)
    changed.extend(f"ffmpeg: {key}" for key in actual if actual[key] != expected.get(key))
    ignored = len(findings(data)) - len(actual)
    # Other native dependencies keep the exact-match contract.
    for package, review in baseline["dependencies"].items():
        current = findings(data, package)
        reviewed = {key: value["evidenceSha256"] for key, value in review["findings"].items()}
        changed.extend(
            f"{package}: {key}"
            for key in current.keys() | reviewed.keys()
            if current.get(key) != reviewed.get(key)
        )
    if changed:
        print("Codec advisory evidence requires a new source/build-surface review:")
        print("\n".join(sorted(changed)))
        return 1
    print(
        "Codec advisory evidence matches the recorded review; "
        f"{ignored} ffmpeg advisories name only source files outside the restricted build. "
        "This is not a vulnerability-free certification."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
