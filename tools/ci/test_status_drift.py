#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from status_drift import (
    AUTHORITATIVE_STATUS_FILE,
    STATUS_ROLE_MARKERS,
    check_repository,
    open_issue_references,
    resolve_tracker_repository,
    validate_role,
    validate_text,
)


def role_marker(path: Path) -> str:
    return f"<!-- status-surface: {STATUS_ROLE_MARKERS[path]} -->\n"


def write_contract_files(root: Path, *, skip: Path | None = None) -> None:
    for relative_path in STATUS_ROLE_MARKERS:
        if relative_path == skip:
            continue
        path = root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            role_marker(relative_path) + "Status contract.\n",
            encoding="utf-8",
        )


class StatusDriftTest(unittest.TestCase):
    def test_static_current_main_sha_is_rejected_on_current_surface(self) -> None:
        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "Current main: a07830ce3c8963a54207765e841f9c3f87b0576e\n",
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("static 'Current main' SHA", errors[0])

    def test_legacy_german_current_main_sha_is_rejected_during_migration(self) -> None:
        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "Aktueller main: a07830ce3c8963a54207765e841f9c3f87b0576e\n",
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("static 'Current main' SHA", errors[0])

    def test_static_planning_sha_is_allowed_in_frozen_m6_snapshot(self) -> None:
        errors = validate_text(
            Path("docs/m6/README.md"),
            "Planning baseline: Current main: 7564800df85f53f9f0c9a99a7414de22906ade73\n",
        )
        self.assertEqual(errors, [])

    def test_closed_issue_marked_open_is_rejected_in_authoritative_status(self) -> None:
        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [ ] **#59 — Security:** still open\n",
            lambda number: "closed" if number == 59 else "open",
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("issue #59", errors[0])

    def test_open_issue_marked_open_is_valid(self) -> None:
        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [ ] **#914 — Release:** publication evidence\n",
            lambda _number: "open",
        )
        self.assertEqual(errors, [])

    def test_checked_issue_is_not_live_state_assertion(self) -> None:
        called = False

        def fetch(_number: int) -> str:
            nonlocal called
            called = True
            return "closed"

        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [x] **#524 — Evidence:** delivered\n",
            fetch,
        )
        self.assertEqual(errors, [])
        self.assertFalse(called)

    def test_bare_and_qualified_open_references_are_parsed(self) -> None:
        text = (
            "- [ ] **#2148:** deferred items\n"
            "- [ ] **baerenmarke90/eimir-archive#2183:** cut-over tracker\n"
            "- [ ] see Owner.Name/repo_x.y#7 for details\n"
            "- [x] **other/repo#1:** delivered\n"
            "- [ ] not/a reference #12\n"
        )
        self.assertEqual(
            open_issue_references(text),
            [
                (None, 2148),
                ("baerenmarke90/eimir-archive", 2183),
                ("Owner.Name/repo_x.y", 7),
                (None, 12),
            ],
        )

    def test_reference_qualified_with_tracker_repository_is_checked(self) -> None:
        requested: list[int] = []

        def fetch(number: int) -> str:
            requested.append(number)
            return "closed"

        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [ ] **Baerenmarke90/Eimir-Core#41:** still open\n",
            fetch,
            tracker_repository="baerenmarke90/eimir-core",
        )
        self.assertEqual(requested, [41])
        self.assertEqual(len(errors), 1)
        self.assertIn("issue Baerenmarke90/Eimir-Core#41", errors[0])

    def test_reference_to_other_repository_is_reported_not_checked(self) -> None:
        requested: list[int] = []
        skipped: list[str] = []

        def fetch(number: int) -> str:
            requested.append(number)
            return "open"

        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [ ] **baerenmarke90/eimir-archive#2183:** re-created later\n"
            "- [ ] **#7:** current tracker item\n",
            fetch,
            tracker_repository="baerenmarke90/eimir-core",
            skipped=skipped,
        )
        self.assertEqual(errors, [])
        self.assertEqual(requested, [7])
        self.assertEqual(len(skipped), 1)
        self.assertIn("baerenmarke90/eimir-archive#2183", skipped[0])
        self.assertIn("baerenmarke90/eimir-core", skipped[0])

    def test_qualified_reference_without_known_tracker_is_reported_not_checked(self) -> None:
        skipped: list[str] = []

        def fetch(_number: int) -> str:
            raise AssertionError("no request expected")

        errors = validate_text(
            AUTHORITATIVE_STATUS_FILE,
            "- [ ] **baerenmarke90/eimir#5:** open\n",
            fetch,
            skipped=skipped,
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(skipped), 1)

    def test_tracker_repository_override_wins_over_workflow_repository(self) -> None:
        self.assertEqual(
            resolve_tracker_repository(
                None,
                {
                    "GITHUB_REPOSITORY": "baerenmarke90/eimir-core",
                    "EIMIR_STATUS_TRACKER_REPOSITORY": "baerenmarke90/eimir-pro",
                },
            ),
            "baerenmarke90/eimir-pro",
        )
        self.assertEqual(
            resolve_tracker_repository(
                "owner/cli",
                {"EIMIR_STATUS_TRACKER_REPOSITORY": "owner/env"},
            ),
            "owner/cli",
        )
        self.assertEqual(
            resolve_tracker_repository(None, {"GITHUB_REPOSITORY": "baerenmarke90/eimir"}),
            "baerenmarke90/eimir",
        )
        self.assertEqual(
            resolve_tracker_repository(
                None,
                {"GITHUB_REPOSITORY": "o/r", "EIMIR_STATUS_TRACKER_REPOSITORY": ""},
            ),
            "o/r",
        )
        self.assertEqual(resolve_tracker_repository(None, {}), "")

    def test_malformed_tracker_repository_is_rejected(self) -> None:
        for value in ("eimir", "a/b/c", "owner/repo name", "https://github.com/o/r"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                resolve_tracker_repository(value, {})

    def test_check_repository_passes_tracker_and_collects_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_contract_files(root)
            status = root / AUTHORITATIVE_STATUS_FILE
            status.write_text(
                role_marker(AUTHORITATIVE_STATUS_FILE)
                + "- [ ] **baerenmarke90/eimir-archive#2183:** tracker\n"
                + "- [ ] **#3:** open item\n",
                encoding="utf-8",
            )
            skipped: list[str] = []
            errors = check_repository(
                root,
                lambda _number: "open",
                tracker_repository="baerenmarke90/eimir-core",
                skipped=skipped,
            )
            self.assertEqual(errors, [])
            self.assertEqual(len(skipped), 1)

    def test_secondary_surface_does_not_become_issue_database(self) -> None:
        called = False

        def fetch(_number: int) -> str:
            nonlocal called
            called = True
            return "closed"

        errors = validate_text(
            Path("docs/ROADMAP.md"),
            "- [ ] Example roadmap reference #999\n",
            fetch,
        )
        self.assertEqual(errors, [])
        self.assertFalse(called)

    def test_known_obsolete_status_phrases_are_rejected(self) -> None:
        cases = (
            (Path("README.md"), "private repository under the current plan"),
            (AUTHORITATIVE_STATUS_FILE, "M6 is the next milestone"),
            (Path("docs/ROADMAP.md"), "G5 has not yet been evaluated"),
            (Path("docs/assets/roadmap/roadmap-overview.svg"), "ACTIVE · M5"),
            (
                Path("docs/m6/README.md"),
                "#262 remains the authoritative product/architecture decision. Until it is resolved:",
            ),
        )
        for path, phrase in cases:
            with self.subTest(path=path, phrase=phrase):
                errors = validate_text(path, phrase)
                self.assertEqual(len(errors), 1)
                self.assertIn("obsolete status phrase", errors[0])

    def test_expected_status_role_is_required_exactly_once(self) -> None:
        path = Path("README.md")
        self.assertEqual(validate_role(path, role_marker(path)), [])

        errors = validate_role(path, "README without role\n")
        self.assertEqual(len(errors), 1)
        self.assertIn("secondary-overview", errors[0])

        duplicate = role_marker(path) + role_marker(path)
        errors = validate_role(path, duplicate)
        self.assertEqual(len(errors), 1)

    def test_competing_status_role_is_rejected(self) -> None:
        path = Path("README.md")
        errors = validate_role(
            path,
            "<!-- status-surface: authoritative-living -->\n",
        )
        self.assertEqual(len(errors), 1)
        self.assertIn("secondary-overview", errors[0])

    def test_historical_reviews_are_not_scanned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_contract_files(root)

            review = root / "docs/reviews/2026-08-26-g2-final-gate-review.md"
            review.parent.mkdir(parents=True, exist_ok=True)
            review.write_text(
                "Current main: 0000000000000000000000000000000000000000\n"
                "G5 has not yet been evaluated\n",
                encoding="utf-8",
            )

            self.assertEqual(check_repository(root), [])

    def test_missing_status_contract_file_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            missing = Path("docs/STATUS-SOURCES.md")
            write_contract_files(root, skip=missing)

            errors = check_repository(root)
            self.assertEqual(len(errors), 1)
            self.assertIn(str(missing), errors[0])


if __name__ == "__main__":
    unittest.main()
