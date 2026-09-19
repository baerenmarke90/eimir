#!/usr/bin/env python3
"""Classify every tracked legacy project-identity reference.

The guard is intentionally stricter than a plain search. A reference that is
not covered by one of the narrow migration, immutable-history, or linguistic
exceptions is a MUST_RENAME finding and fails CI.
"""

from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
LEGACY_PATTERN = re.compile(
    r"SideBySide-Next|SideBySide|sidebyside|side-by-side|side by side|SBS_|\bSBS\b|sbs_|sbs-|sbs(?=[A-Z])",
    re.IGNORECASE,
)


class Classification(StrEnum):
    MUST_RENAME = "MUST_RENAME"
    TEMP_COMPAT = "TEMP_COMPAT"
    HISTORICAL_IMMUTABLE = "HISTORICAL_IMMUTABLE"
    FALSE_POSITIVE = "FALSE_POSITIVE"


@dataclass(frozen=True)
class Finding:
    path: Path
    line_number: int
    match: str
    classification: Classification
    reason: str


HISTORICAL_PREFIXES = (Path("docs/reviews"),)
HISTORICAL_FILES = {Path("specification/CLEAN-ROOM-MASTER-SPEC.md")}
GUARD_FILES = {
    Path("tools/ci/project_identity_scan.py"),
    Path("tools/ci/test_project_identity_scan.py"),
}

ANDROID_IMMUTABLE_IDENTIFIERS = (
    "de.sidebyside.app",
    "sidebyside-read-cache.db",
    "sidebyside_owner_only_read_cache",
)
WEB_PERSISTENCE_IDENTIFIERS = (
    "sidebyside-session-v1",
    "sidebyside-auth-return-v1",
    "sidebyside-web-read-cache",
    "sidebyside.theme",
    "sbs-demo-mode",
)
PROTOCOL_COMPATIBILITY_IDENTIFIERS = (
    "sidebyside-revision",
    "x-sidebyside-revision",
    "sidebyside-self-hosted-backup",
    "sidebyside-account-deletion-journal",
)
RELEASE_COMPATIBILITY_IDENTIFIERS = (
    "sidebyside-release-manifest.json",
    "sidebyside-cloud-deployment-identity",
    'legacy_product_name = "sidebyside"',
)


def _under(path: Path, prefix: Path) -> bool:
    try:
        path.relative_to(prefix)
    except ValueError:
        return False
    return True


def classify(path: Path, line: str, match: str) -> tuple[Classification, str]:
    """Return the narrow exception for one occurrence, or MUST_RENAME."""

    normalized = line.casefold()

    if path in GUARD_FILES:
        return (
            Classification.FALSE_POSITIVE,
            "the scanner's definitions and regression fixtures must name the rejected patterns",
        )

    if path in HISTORICAL_FILES or any(
        _under(path, prefix) for prefix in HISTORICAL_PREFIXES
    ):
        return (
            Classification.HISTORICAL_IMMUTABLE,
            "the original clean-room input or a dated review snapshot is immutable evidence",
        )

    if path == Path("PROVENANCE.md") and "sidebyside classic" in normalized:
        return (
            Classification.HISTORICAL_IMMUTABLE,
            "the predecessor name is required historical provenance",
        )

    if (
        path == Path("tools/ci/documentation_language_audit.py")
        and "sidebyside" in normalized
    ):
        return (
            Classification.FALSE_POSITIVE,
            "the language guard must name localized copy in the immutable clean-room input",
        )

    if path == Path("docs/PROJECT-IDENTITY-MIGRATION.md"):
        return (
            Classification.TEMP_COMPAT,
            "the operator migration guide must identify deprecated inputs and stable legacy IDs",
        )

    if path == Path("web/e2e/tests/today-living-home.spec.ts") and (
        "side-by-side layout" in normalized
        or "side by side" in normalized
        or "sidebyside" in normalized
    ):
        return (
            Classification.FALSE_POSITIVE,
            "side-by-side is used as generic responsive-layout terminology",
        )

    if "side by side" in normalized and any(
        layout_term in normalized
        for layout_term in ("row", "photograph", "representation", "muted role")
    ):
        return (
            Classification.FALSE_POSITIVE,
            "side by side is ordinary comparison or layout terminology in this sentence",
        )

    if (
        path == Path("web/src/components/Brand.test.tsx")
        and "not.tocontain" in normalized
    ):
        return (
            Classification.FALSE_POSITIVE,
            "the negative brand regression assertion intentionally names a rejected spelling",
        )

    if any(identifier in normalized for identifier in ANDROID_IMMUTABLE_IDENTIFIERS):
        return (
            Classification.TEMP_COMPAT,
            "the released Android application, callback, Room, or Keystore identity cannot change in-place",
        )

    if any(identifier in normalized for identifier in WEB_PERSISTENCE_IDENTIFIERS):
        return (
            Classification.TEMP_COMPAT,
            "the persisted browser identifier is read only to migrate existing client state",
        )

    if any(
        identifier in normalized for identifier in PROTOCOL_COMPATIBILITY_IDENTIFIERS
    ):
        return (
            Classification.TEMP_COMPAT,
            "the old wire/storage identifier remains a deprecated reader or endpoint alias",
        )

    if any(
        identifier in normalized for identifier in RELEASE_COMPATIBILITY_IDENTIFIERS
    ):
        return (
            Classification.TEMP_COMPAT,
            "immutable prior release evidence remains consumable during the identity transition",
        )

    if path == Path("tools/ci/test_release_manifest.py") and (
        '"product": {"name": "sidebyside"' in normalized
    ):
        return (
            Classification.TEMP_COMPAT,
            "the fixture proves that immutable prior release evidence remains consumable",
        )

    if "demo.sbs.ur-cloud.de" in normalized:
        return (
            Classification.TEMP_COMPAT,
            "the deployed demo hostname remains stable until its external DNS migration is scheduled",
        )

    if "sbs_" in normalized or "vite_sbs_" in normalized or "sbs*" in normalized:
        return (
            Classification.TEMP_COMPAT,
            "the deprecated configuration name is accepted as a lower-precedence upgrade alias",
        )

    if path in (
        Path("android/app/build.gradle.kts"),
        Path("capacitor-android/app/build.gradle"),
        Path("capacitor-android/README.md"),
    ) and (
        "providers.gradleproperty" in normalized
        or any(
            legacy_property in normalized
            for legacy_property in ("sbsapibaseurl", "sbsversioncode", "sbsrelease")
        )
    ):
        return (
            Classification.TEMP_COMPAT,
            "the deprecated Gradle property remains a lower-precedence Android upgrade alias",
        )

    if "sidebyside" in normalized and (
        "postgres" in normalized
        or "database_url" in normalized
        or "pg_isready" in normalized
    ):
        return (
            Classification.TEMP_COMPAT,
            "the default PostgreSQL role/database identity preserves existing named-volume startup",
        )

    return (
        Classification.MUST_RENAME,
        "active project identity has no approved compatibility or historical exception",
    )


def tracked_paths(root: Path = REPOSITORY_ROOT) -> list[Path]:
    """Return tracked files plus non-ignored additions in a developer checkout."""

    result = subprocess.run(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    return [
        Path(raw.decode("utf-8", errors="surrogateescape"))
        for raw in result.stdout.split(b"\0")
        if raw
    ]


def scan(root: Path = REPOSITORY_ROOT) -> list[Finding]:
    findings: list[Finding] = []
    for relative_path in tracked_paths(root):
        path = root / relative_path
        if not path.is_file():
            continue
        try:
            contents = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        path_match = LEGACY_PATTERN.search(relative_path.as_posix())
        if path_match:
            classification, reason = classify(
                relative_path, relative_path.as_posix(), path_match.group()
            )
            findings.append(
                Finding(relative_path, 0, path_match.group(), classification, reason)
            )

        for line_number, line in enumerate(contents.splitlines(), start=1):
            for legacy_match in LEGACY_PATTERN.finditer(line):
                classification, reason = classify(
                    relative_path, line, legacy_match.group()
                )
                findings.append(
                    Finding(
                        relative_path,
                        line_number,
                        legacy_match.group(),
                        classification,
                        reason,
                    )
                )
    return findings


def main() -> int:
    findings = scan()
    counts = {classification: 0 for classification in Classification}
    for finding in findings:
        counts[finding.classification] += 1
        print(
            f"{finding.path}:{finding.line_number}: "
            f"{finding.classification}: {finding.match!r} — {finding.reason}"
        )

    print("Project identity scan summary:")
    for classification in Classification:
        print(f"  {classification}: {counts[classification]}")

    must_rename = counts[Classification.MUST_RENAME]
    if must_rename:
        print(
            f"ERROR: {must_rename} active legacy reference(s) must be renamed.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
