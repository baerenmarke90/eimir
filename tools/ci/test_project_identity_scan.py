#!/usr/bin/env python3
from __future__ import annotations

import unittest
from pathlib import Path

from project_identity_scan import LEGACY_PATTERN, Classification, classify


class ProjectIdentityScanTest(unittest.TestCase):
    def test_unclassified_active_reference_must_be_renamed(self) -> None:
        classification, _ = classify(
            Path("backend/src/example.py"),
            "active_name = 'SideBySide'",
            "SideBySide",
        )
        self.assertEqual(classification, Classification.MUST_RENAME)

    def test_environment_alias_is_temporary_compatibility(self) -> None:
        classification, _ = classify(
            Path("compose.yaml"),
            'EIMIR_ENVIRONMENT: "${EIMIR_ENVIRONMENT:-${SBS_ENVIRONMENT:-production}}"',
            "SBS_",
        )
        self.assertEqual(classification, Classification.TEMP_COMPAT)

    def test_android_application_id_is_temporary_compatibility(self) -> None:
        classification, _ = classify(
            Path("android/app/build.gradle"),
            'applicationId "de.sidebyside.app"',
            "sidebyside",
        )
        self.assertEqual(classification, Classification.TEMP_COMPAT)

    def test_retired_native_cache_identifiers_are_no_longer_exempt(self) -> None:
        # The Room database and Keystore alias belonged to the retired Kotlin
        # client (#1009); nothing keeps them alive, so they get no exception.
        for line in (
            'DATABASE_NAME = "sidebyside-read-cache.db"',
            'DEFAULT_KEY_ALIAS = "sidebyside_owner_only_read_cache"',
        ):
            with self.subTest(line=line):
                classification, _ = classify(
                    Path("android/app/src/main/java/de/eimir/app/Example.java"),
                    line,
                    "sidebyside",
                )
                self.assertEqual(classification, Classification.MUST_RENAME)

    def test_frozen_spec_is_historical(self) -> None:
        classification, _ = classify(
            Path("specification/CLEAN-ROOM-MASTER-SPEC.md"),
            "SideBySide",
            "SideBySide",
        )
        self.assertEqual(classification, Classification.HISTORICAL_IMMUTABLE)

    def test_generic_layout_term_is_a_false_positive(self) -> None:
        classification, _ = classify(
            Path("web/e2e/tests/today-living-home.spec.ts"),
            "a forced side-by-side layout",
            "side-by-side",
        )
        self.assertEqual(classification, Classification.FALSE_POSITIVE)

    def test_required_patterns_are_case_insensitive_and_complete(self) -> None:
        samples = (
            "SideBySide-Next",
            "SideBySide",
            "sidebyside",
            "sideBySide",
            "side-by-side",
            "side by side",
            "SBS_VALUE",
            "SBS",
            "sbs_value",
            "sbs-value",
            "sbsVersionCode",
        )
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertIsNotNone(LEGACY_PATTERN.search(sample))


if __name__ == "__main__":
    unittest.main()
