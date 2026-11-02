"""Fail closed when upstream FFmpeg advisory evidence changes after review."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

FEED = "https://security-tracker.debian.org/tracker/data/json"


def findings(data: dict) -> dict[str, str]:
    result = {}
    for identifier, value in data["ffmpeg"].items():
        status = value.get("releases", {}).get("sid", {}).get("status")
        if status not in {None, "resolved"}:
            evidence = json.dumps(
                {"description": value["description"], "status": status},
                sort_keys=True, separators=(",", ":"),
            )
            result[identifier] = hashlib.sha256(evidence.encode()).hexdigest()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed-file", type=Path)
    arguments = parser.parse_args()
    if arguments.feed_file:
        data = json.loads(arguments.feed_file.read_bytes())
    else:
        with urlopen(FEED, timeout=60) as response:
            data = json.load(response)
    baseline = json.loads(Path(__file__).with_name("advisory-review.json").read_text())
    actual = findings(data)
    expected = {key: value["evidenceSha256"] for key, value in baseline["findings"].items()}
    changed = sorted(key for key in actual.keys() | expected.keys() if actual.get(key) != expected.get(key))
    if changed:
        print("FFmpeg advisory evidence requires a new source/build-surface review:")
        print("\n".join(changed))
        return 1
    print("FFmpeg advisory evidence matches the recorded review; this is not a vulnerability-free certification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
