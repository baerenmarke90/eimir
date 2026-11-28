"""Fail closed when reviewed codec/color dependency advisory evidence changes.

ffmpeg publishes advisories for every codec, so the feed is filtered by what the
restricted build actually compiles. ``built-sources.txt`` (written by
``build-inventory.py`` from the real build) lists the source files that reach the
binary. An advisory is dismissed only when everything it names is demonstrably
outside the build: every source file it names is unbuilt, or, when it names no
file, every function it names is absent from the built sources. An advisory that
names a built file, an architecture-specific file or function, or nothing
resolvable stays fail-closed until ``advisory-review.json`` records it.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import tarfile
import tempfile
from pathlib import Path
from urllib.request import urlopen

FEED = "https://security-tracker.debian.org/tracker/data/json"
# The pinned upstream source of tools/media/build-ffmpeg.sh; also asserted against
# .github/workflows/media-video.yml by backend/tests/unit/test_codec_advisories.py.
FFMPEG_COMMIT = "946fcce07b6dcd0331c8cc609192aeff5e1924f8"
FFMPEG_SHA256 = "0aa2b1de2a5698b20a23e93d539a9a8e82ca0117496c5bdf05d198805f42bb3b"
FFMPEG_URL = f"https://github.com/FFmpeg/FFmpeg/archive/{FFMPEG_COMMIT}.tar.gz"
HERE = Path(__file__).parent
SOURCE_PATH = re.compile(
    r"\b((?:libav\w+|libsw\w+|libpostproc|fftools|compat)/[\w+./-]*?\.(?:c|h|S|m|cpp|asm))\b"
)
SOURCE_NAME = re.compile(r"(?<![\w/.-])([\w+-]+\.(?:c|S))\b")
FUNCTION_NAME = re.compile(r"\b([A-Za-z_]\w{3,})\(\)")
IDENTIFIER = re.compile(r"[A-Za-z_]\w*")
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
# Names that are architecture-specific or assembled by macro token pasting never
# appear verbatim in the built sources, so their absence proves nothing.
NOT_VERBATIM = re.compile(
    r"(_(c|sse\d?|ssse\d|avx\d*|mmx\w*|neon|sve\d?|rvv|altivec|vsx|lsx|lasx)|_\d+(_c)?)$"
)


def description_of(entry: dict) -> str:
    """Debian files new TEMP entries before their text: an empty one places nothing."""
    return entry.get("description") or ""


def findings(data: dict, package: str = "ffmpeg") -> dict[str, str]:
    result = {}
    for identifier, value in data.get(package, {}).items():
        status = value.get("releases", {}).get("sid", {}).get("status")
        if status not in {None, "resolved"}:
            evidence = json.dumps(
                {"description": description_of(value), "status": status},
                sort_keys=True,
                separators=(",", ":"),
            )
            result[identifier] = hashlib.sha256(evidence.encode()).hexdigest()
    return result


def is_relevant(description: str, built: set[str], identifiers: set[str] | None = None) -> bool:
    """True when the advisory can concern the shipped build or cannot be placed."""
    qualified = SOURCE_PATH.findall(description)
    bare = SOURCE_NAME.findall(SOURCE_PATH.sub(" ", description))
    if qualified or bare:
        for path in qualified:
            if path in built or ARCH_DIRECTORIES.intersection(path.split("/")[1:-1]):
                return True
        built_names = {path.rsplit("/", 1)[-1] for path in built}
        return any(name in built_names for name in bare)
    names = FUNCTION_NAME.findall(description)
    if identifiers is None or not names:
        return True
    return any(NOT_VERBATIM.search(name) or name in identifiers for name in names)


def relevant_findings(
    data: dict, built: set[str], package: str = "ffmpeg", identifiers: set[str] | None = None
) -> dict[str, str]:
    entries = data.get(package, {})
    return {
        identifier: digest
        for identifier, digest in findings(data, package).items()
        if is_relevant(description_of(entries[identifier]), built, identifiers)
    }


def source_identifiers(source_dir: Path, built: set[str]) -> set[str]:
    """Every identifier in the built sources; generated files absent from the tree are skipped."""
    found: set[str] = set()
    for path in built:
        candidate = source_dir / path
        if candidate.is_file():
            found.update(IDENTIFIER.findall(candidate.read_text(encoding="utf-8", errors="ignore")))
    return found


def fetch_source(target: Path) -> Path:
    """Download the pinned upstream archive, verify its digest and unpack it."""
    with urlopen(FFMPEG_URL, timeout=120) as response:
        blob = response.read()
    if hashlib.sha256(blob).hexdigest() != FFMPEG_SHA256:
        raise SystemExit("The downloaded FFmpeg source does not match the pinned digest.")
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as archive:
        archive.extractall(target, filter="data")
    return next(path for path in target.iterdir() if path.is_dir())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed-file", type=Path)
    parser.add_argument("--inventory", type=Path, default=HERE / "built-sources.txt")
    parser.add_argument(
        "--source-dir", type=Path, help="unpacked pinned FFmpeg source; downloaded when omitted"
    )
    arguments = parser.parse_args()
    if arguments.feed_file:
        data = json.loads(arguments.feed_file.read_bytes())
    else:
        with urlopen(FEED, timeout=60) as response:
            data = json.load(response)
    if not isinstance(data, dict) or not isinstance(data.get("ffmpeg"), dict) or not data["ffmpeg"]:
        print("The Debian security feed is missing FFmpeg advisory data.")
        return 1
    built = set(arguments.inventory.read_text(encoding="utf-8").split())
    if not built:
        print(f"{arguments.inventory} is empty; regenerate it with build-inventory.py.")
        return 1
    if arguments.source_dir:
        identifiers = source_identifiers(arguments.source_dir, built)
    else:
        with tempfile.TemporaryDirectory() as workspace:
            identifiers = source_identifiers(fetch_source(Path(workspace)), built)
    baseline = json.loads((HERE / "advisory-review.json").read_text())
    changed = []
    # ffmpeg: every advisory that concerns built code must carry a matching review.
    expected = {key: value["evidenceSha256"] for key, value in baseline["findings"].items()}
    actual = relevant_findings(data, built, identifiers=identifiers)
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
        f"{ignored} ffmpeg advisories concern only code outside the restricted build. "
        "This is not a vulnerability-free certification."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
