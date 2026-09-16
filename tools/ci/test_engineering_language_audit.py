#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from documentation_language_audit import check_documentation_file, documentation_files
from engineering_language_audit import _is_excluded_platform_path, check_file


class EngineeringLanguageAuditTest(unittest.TestCase):
    def test_visual_proof_excludes_only_localization_resources(self) -> None:
        for resource in (
            "android/app/src/debug/res/values/strings_visual_proof.xml",
            "web/e2e/fixtures/locales/de.ts",
        ):
            self.assertTrue(_is_excluded_platform_path(Path(resource)))
        for implementation in (
            "android/app/src/debug/java/de/eimir/app/design/VisualRolesProofActivity.kt",
            "web/e2e/fixtures/product-reference-foundations.tsx",
            "web/e2e/tests/product-reference-foundations.spec.ts",
        ):
            self.assertFalse(_is_excluded_platform_path(Path(implementation)))

    def test_legacy_engineering_marker_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.md"
            path.write_text("## Zusammenfassung\n", encoding="utf-8")
            findings = check_file(path)
            self.assertEqual(len(findings), 1)
            self.assertIn("Zusammenfassung", findings[0])

    def test_english_engineering_text_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.md"
            path.write_text("## Summary\n", encoding="utf-8")
            self.assertEqual(check_file(path), [])

    def test_localized_product_fixture_is_allowed_without_excluding_test_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "localized.test.ts"
            path.write_text(
                "expect(screen).toContain('Eure Story beginnt hier.');\n",
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_common_english_article_is_not_a_german_marker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.md"
            path.write_text(
                "An existing component is not selected merely because it exists.\n",
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_english_address_identifier_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "def normalize_address(address: str) -> str:\n    return address.strip()\n",
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_english_domain_moment_identifier_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "def load_heart_moment(heart_moment_id: str):\n"
                "    moment = heart_moment_id\n"
                "    return moment\n",
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_english_camel_case_and_constant_identifiers_are_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "class TestRegistration:\n"
                "    pass\n\n"
                "SPACE_ENDPOINTS = ()\n",
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_english_status_drift_term_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.md"
            path.write_text("Status-drift migration guard.\n", encoding="utf-8")
            self.assertEqual(check_file(path), [])

    def test_legacy_status_marker_is_allowed_as_migration_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text('sample = "Aktueller `main`"\n', encoding="utf-8")
            self.assertEqual(check_file(path), [])

    def test_stable_markdown_link_target_is_not_treated_as_documentation_prose(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "docs" / "example.md"
            path.parent.mkdir(parents=True)
            path.write_text(
                "[English label](docs/example.md#status-und-entscheidung)\n",
                encoding="utf-8",
            )
            self.assertEqual(check_documentation_file(path, root), [])

    def test_stable_json_contract_target_is_not_treated_as_documentation_prose(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "docs" / "manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(
                '{"contract":"docs/COMPONENT-CONTRACTS.md#41-text-field-und-text-area"}\n',
                encoding="utf-8",
            )
            self.assertEqual(check_documentation_file(path, root), [])

    def test_german_json_documentation_prose_remains_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "docs" / "manifest.json"
            path.parent.mkdir(parents=True)
            path.write_text(
                '{"description":"Die Entscheidung wird im Client getroffen."}\n',
                encoding="utf-8",
            )
            findings = check_documentation_file(path, root)
            self.assertEqual(len(findings), 1)

    def test_frozen_review_snapshots_are_outside_active_documentation_scope(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frozen = root / "docs" / "reviews" / "snapshot.md"
            active = root / "docs" / "active.md"
            frozen.parent.mkdir(parents=True)
            active.parent.mkdir(parents=True, exist_ok=True)
            frozen.write_text("## Zusammenfassung\n", encoding="utf-8")
            active.write_text("## Summary\n", encoding="utf-8")
            paths = documentation_files(root)
            self.assertIn(active, paths)
            self.assertNotIn(frozen, paths)

    def test_localized_product_copy_is_allowed_in_migrated_documentation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "design" / "m2" / "SCREEN-FLOWS.md"
            path.parent.mkdir(parents=True)
            path.write_text(
                'Button copy: "Nur für mich"\n',
                encoding="utf-8",
            )
            self.assertEqual(check_documentation_file(path, root), [])

    def test_active_documentation_tree_satisfies_language_policy(self) -> None:
        findings: list[str] = []
        for path in documentation_files():
            findings.extend(check_documentation_file(path))
        self.assertEqual(findings, [])

    def test_python_comment_and_identifier_are_audited(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "# Die Pruefung bleibt technisch.\ndef test_fehler_wird_abgewiesen():\n    pass\n",
                encoding="utf-8",
            )
            findings = check_file(path)
            self.assertGreaterEqual(len(findings), 2)

    def test_hybrid_identifiers_from_backend_migration_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "def upload_hoch():\n"
                "    pass\n\n"
                "def test_png_als_jpeg_angekuendigt_scheitert():\n"
                "    pass\n\n"
                "CANARY_FREMD = b'fixture'\n",
                encoding="utf-8",
            )
            findings = check_file(path)
            self.assertEqual(len(findings), 3)
            self.assertTrue(any("upload_hoch" in finding for finding in findings))
            self.assertTrue(any("angekuendigt" in finding for finding in findings))
            self.assertTrue(any("CANARY_FREMD" in finding for finding in findings))

    def test_camel_case_and_uppercase_residual_identifiers_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                "class TestRegistrierung:\n"
                "    pass\n\n"
                "class TestSitzungsverwaltung:\n"
                "    pass\n\n"
                "class TestKoordinaten:\n"
                "    pass\n\n"
                "class TestAnlegen:\n"
                "    pass\n\n"
                "class TestPruefen:\n"
                "    pass\n\n"
                "SPACE_ENDPUNKTE = ()\n"
                "DETAIL_ENDPUNKTE = ()\n"
                "SCHREIBENDE_ENDPUNKTE = ()\n"
                "def test_session_data_returns_beide_token():\n"
                "    pass\n",
                encoding="utf-8",
            )
            findings = check_file(path)
            expected_markers = (
                "TestRegistrierung",
                "TestSitzungsverwaltung",
                "TestKoordinaten",
                "TestAnlegen",
                "TestPruefen",
                "SPACE_ENDPUNKTE",
                "DETAIL_ENDPUNKTE",
                "SCHREIBENDE_ENDPUNKTE",
                "test_session_data_returns_beide_token",
            )
            self.assertEqual(len(findings), len(expected_markers))
            for marker in expected_markers:
                self.assertTrue(any(marker in finding for finding in findings), marker)

    def test_hybrid_engineering_prose_from_backend_migration_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                '"""Schwerpunkte: attachment status and metadata stripping."""\n'
                "# No Storage-Interna are exposed.\n",
                encoding="utf-8",
            )
            findings = check_file(path)
            self.assertEqual(len(findings), 2)

    def test_ordinary_product_literal_is_not_classified(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text(
                'subject = "Dein Anmeldelink fuer Eimir"\nbody = "Nur fuer mich"\n',
                encoding="utf-8",
            )
            self.assertEqual(check_file(path), [])

    def test_exception_diagnostic_is_audited(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "example.py"
            path.write_text('raise ValueError("Der Wert ist ungueltig")\n', encoding="utf-8")
            findings = check_file(path)
            self.assertEqual(len(findings), 1)


if __name__ == "__main__":
    unittest.main()
