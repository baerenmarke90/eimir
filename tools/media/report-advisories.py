"""Describe what makes ``check-advisories.py`` fail, for the nightly review issue.

The gate prints only identifiers. A reviewer also needs the Debian description and the
``evidenceSha256`` to record in ``advisory-review.json``. This helper reuses the
checker's own functions (it never reimplements the filter or the hash) and applies the
same comparison against the recorded review, then writes a Markdown issue body.

It only reports. It does not decide whether a build may ship: the checker stays
fail-closed in Release Evidence and in the Codec Advisories workflow itself.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import runpy
import tempfile
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).parent
checker = runpy.run_path(str(HERE / "check-advisories.py"))
MAX_DESCRIPTION = 4000


def collect(data: dict, built: set[str], identifiers: set[str], baseline: dict) -> list[dict]:
    """Return one record per advisory the checker would list as needing review."""
    records: list[dict] = []
    findings = checker["findings"]
    actual = checker["relevant_findings"](data, built, identifiers=identifiers)
    expected = {key: value["evidenceSha256"] for key, value in baseline["findings"].items()}
    for key in sorted(actual):
        if actual[key] != expected.get(key):
            records.append(_record(data, "ffmpeg", key, actual[key], key in expected))
    for package, review in baseline["dependencies"].items():
        current = findings(data, package)
        reviewed = {key: value["evidenceSha256"] for key, value in review["findings"].items()}
        for key in sorted(current.keys() | reviewed.keys()):
            if current.get(key) != reviewed.get(key):
                records.append(
                    _record(data, package, key, current.get(key), key in reviewed, key in current)
                )
    return records


def _record(
    data: dict,
    package: str,
    key: str,
    digest: str | None,
    was_reviewed: bool,
    listed: bool = True,
) -> dict:
    entry = data.get(package, {}).get(key, {})
    kind = "removed" if not listed else "changed" if was_reviewed else "new"
    return {
        "package": package,
        "id": key,
        "kind": kind,
        "evidenceSha256": digest,
        "status": entry.get("releases", {}).get("sid", {}).get("status"),
        "description": entry.get("description", ""),
    }


def fingerprint(records: list[dict]) -> str:
    lines = sorted(
        f"{item['package']}|{item['id']}|{item['kind']}|{item['evidenceSha256']}"
        for item in records
    )
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def fence(text: str) -> str:
    """Wrap untrusted feed text in a code fence it cannot close, so it never renders."""
    longest = run = 0
    for char in text:
        run = run + 1 if char == "`" else 0
        longest = max(longest, run)
    marker = "`" * max(3, longest + 1)
    return f"{marker}text\n{text}\n{marker}"


def render(records: list[dict]) -> str:
    sections = []
    for item in records:
        description = item["description"]
        note = ""
        if len(description) > MAX_DESCRIPTION:
            description = description[:MAX_DESCRIPTION]
            note = "\n(Description truncated here; the digest covers the full text.)"
        package = item["package"]
        location = "findings" if package == "ffmpeg" else f"dependencies.{package}.findings"
        lines = [f"### {item['id']} ({package}, {item['kind']})", ""]
        lines.append(f"Debian sid status: `{item['status']}`")
        if item["kind"] == "removed":
            lines += [
                "",
                "Debian no longer lists this advisory. Remove its entry from "
                f"`{location}` in `tools/media/advisory-review.json` and say why in the PR.",
            ]
        else:
            lines += [
                "",
                "Debian description:",
                "",
                fence(description) + note,
                "",
                f"Entry for `{location}` in `tools/media/advisory-review.json` "
                "(write the real review text; the placeholder must not be committed):",
                "",
                "```json",
                f'"{item["id"]}": {{',
                f'  "evidenceSha256": "{item["evidenceSha256"]}",',
                '  "review": "<reachable / not reachable / mitigated, with the evidence>"',
                "}",
                "```",
            ]
        sections.append("\n".join(lines))
    findings = "\n\n".join(sections)
    return (
        "The nightly **Codec Advisories** check found findings that no recorded review "
        "covers. The restricted video worker build in *Publish Immutable Release* fails on "
        "the same check, so reviewing now keeps the private test channel unblocked.\n\n"
        f"## Findings ({len(records)})\n\n{findings}\n\n"
        "## What the review PR must contain\n\n"
        "- One entry per finding in `tools/media/advisory-review.json`, in the format of "
        "#2260 and #2269, with the `evidenceSha256` shown above.\n"
        "- A real per-CVE rationale: **reachable**, **not reachable** or **mitigated**, "
        "traced in the pinned FFmpeg source, the configure flags of "
        "`tools/media/build-ffmpeg.sh`, `tools/media/built-sources.txt` and the ffmpeg "
        "command lines the application builds. A reachable and unmitigated finding needs a "
        "mitigation, not a record.\n"
        "- No change to `tools/media/check-advisories.py` and no weaker gate.\n\n"
        "The digest covers the Debian description and status, so a changed description "
        "needs a new review. This issue closes itself once the nightly check passes "
        "again.\n\n"
        f"<!-- advisory-fingerprint: {fingerprint(records)} -->\n"
    )


def load_feed(path: Path | None) -> dict:
    if path:
        return json.loads(path.read_bytes())
    with urlopen(checker["FEED"], timeout=60) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feed-file", type=Path)
    parser.add_argument("--inventory", type=Path, default=HERE / "built-sources.txt")
    parser.add_argument("--review", type=Path, default=HERE / "advisory-review.json")
    parser.add_argument("--source-dir", type=Path, help="unpacked pinned FFmpeg source")
    parser.add_argument("--output-dir", type=Path, required=True)
    arguments = parser.parse_args()
    arguments.output_dir.mkdir(parents=True, exist_ok=True)

    def finish(status: str, detail: str = "", body: str = "", digest: str = "") -> int:
        (arguments.output_dir / "status").write_text(status + "\n", encoding="utf-8")
        (arguments.output_dir / "issue-body.md").write_text(body, encoding="utf-8")
        (arguments.output_dir / "fingerprint").write_text(digest + "\n", encoding="utf-8")
        print(detail or status)
        return 0

    try:
        data = load_feed(arguments.feed_file)
        if not isinstance(data.get("ffmpeg"), dict) or not data["ffmpeg"]:
            return finish("error", "The Debian security feed is missing FFmpeg advisory data.")
        built = set(arguments.inventory.read_text(encoding="utf-8").split())
        if arguments.source_dir:
            identifiers = checker["source_identifiers"](arguments.source_dir, built)
        else:
            with tempfile.TemporaryDirectory() as workspace:
                source = checker["fetch_source"](Path(workspace))
                identifiers = checker["source_identifiers"](source, built)
        baseline = json.loads(arguments.review.read_text(encoding="utf-8"))
        records = collect(data, built, identifiers, baseline)
    except Exception as error:  # report, never mask: the gate step already failed
        return finish("error", f"Could not describe the findings: {type(error).__name__}: {error}")
    if not records:
        return finish("clean", "No unreviewed finding; the failure is not an advisory difference.")
    for item in records:
        print(f"{item['package']}: {item['id']} ({item['kind']})")
    return finish("findings", f"{len(records)} finding(s).", render(records), fingerprint(records))


if __name__ == "__main__":
    raise SystemExit(main())
