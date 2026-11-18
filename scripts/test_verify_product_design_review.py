#!/usr/bin/env python3
"""Unit tests for the mandatory Product Design / UX review gate (Issues #824/#947)."""

from __future__ import annotations

import os
import sys
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.verify_product_design_review import (
    AUTOMATED_DEPENDENCY_AUTHOR,
    REQUIRED_DESIGN_REVIEW_ITEMS,
    is_exempt_dependency_update,
    main,
    verify_impact_decision,
    verify_mandatory_design_review,
)


def _checked_design_review_body(*, extra: str = "") -> str:
    checklist = "\n".join(f"- [x] {item}" for item in REQUIRED_DESIGN_REVIEW_ITEMS)
    return (
        "- [x] User-facing UI / UX impact reviewed\n\n"
        "## Product Design / UX\n\n"
        f"{checklist}\n\n"
        "**Design result / rationale**\n\n"
        f"- {extra or 'Selected the focused-page pattern for the Compact create flow.'}\n\n"
        "**Visual evidence**\n\n"
        "- https://example.invalid/compact.png\n"
    )


class TestImpactDecision(unittest.TestCase):
    def test_reviewed_and_ui_changed_passes(self) -> None:
        body = "- [x] User-facing UI / UX impact reviewed"
        self.assertEqual(verify_impact_decision(body, ui_changed=True), [])

    def test_no_impact_and_no_ui_change_passes(self) -> None:
        body = "- [x] No user-facing UI / UX impact"
        self.assertEqual(verify_impact_decision(body, ui_changed=False), [])

    def test_no_impact_declared_but_ui_changed_fails(self) -> None:
        body = "- [x] No user-facing UI / UX impact"
        errors = verify_impact_decision(body, ui_changed=True)
        self.assertTrue(errors)
        self.assertIn("mandatory", errors[0])

    def test_both_checked_fails(self) -> None:
        body = "- [x] User-facing UI / UX impact reviewed\n- [x] No user-facing UI / UX impact"
        errors = verify_impact_decision(body, ui_changed=True)
        self.assertTrue(errors)

    def test_neither_checked_fails(self) -> None:
        errors = verify_impact_decision("no boxes here", ui_changed=False)
        self.assertTrue(errors)

    def test_backend_only_pr_with_no_impact_is_not_blocked_by_ui_fields(self) -> None:
        """A backend/docs/infra-only PR must not be forced through the UI checklist."""
        body = "- [x] No user-facing UI / UX impact"
        self.assertEqual(verify_impact_decision(body, ui_changed=False), [])


class TestMandatoryDesignReview(unittest.TestCase):
    def test_pass_with_full_compact_first_declaration_and_evidence(self) -> None:
        body = _checked_design_review_body()
        self.assertEqual(verify_mandatory_design_review(body), [])

    def test_fail_missing_compact_first_declaration(self) -> None:
        body = _checked_design_review_body().replace(
            "- [x] Designed from Compact/smartphone outward\n", ""
        )
        errors = verify_mandatory_design_review(body)
        self.assertTrue(any("Designed from Compact/smartphone outward" in e for e in errors))

    def test_fail_missing_mobile_interaction_contract_declaration(self) -> None:
        body = _checked_design_review_body().replace(
            "- [x] Mobile Interaction Contract implemented or deviations documented\n", ""
        )
        errors = verify_mandatory_design_review(body)
        self.assertTrue(
            any("Mobile Interaction Contract implemented or deviations documented" in e for e in errors)
        )

    def test_fail_missing_established_mobile_pattern_declaration(self) -> None:
        body = _checked_design_review_body().replace(
            "- [x] Established platform/mobile interaction pattern reused or deviation justified\n",
            "",
        )
        errors = verify_mandatory_design_review(body)
        self.assertTrue(
            any(
                "Established platform/mobile interaction pattern reused or deviation justified"
                in e
                for e in errors
            )
        )

    def test_fail_missing_typing_keyboard_burden_declaration(self) -> None:
        body = _checked_design_review_body().replace(
            "- [x] Typing and keyboard burden minimized for Compact where applicable\n",
            "",
        )
        errors = verify_mandatory_design_review(body)
        self.assertTrue(
            any(
                "Typing and keyboard burden minimized for Compact where applicable" in e
                for e in errors
            )
        )

    def test_fail_missing_visual_evidence_section(self) -> None:
        body = _checked_design_review_body().replace("**Visual evidence**\n\n", "")
        errors = verify_mandatory_design_review(body)
        self.assertTrue(any("visual evidence" in e for e in errors))

    def test_fail_missing_table_list_master_detail_justification(self) -> None:
        body = _checked_design_review_body().replace(
            "- [x] If table/list/master-detail is used, its necessity is explicitly justified\n",
            "",
        )
        errors = verify_mandatory_design_review(body)
        self.assertTrue(
            any("its necessity is explicitly justified" in e for e in errors)
        )

    def test_fail_missing_section_heading(self) -> None:
        body = _checked_design_review_body().replace("## Product Design / UX\n\n", "")
        errors = verify_mandatory_design_review(body)
        self.assertTrue(any("Product Design / UX" in e for e in errors))

    def test_admin_exception_passes_when_declared_and_documented(self) -> None:
        """An explicit, documented administrative/diagnostic exception still
        satisfies the anti-CRM declaration mechanically; the human review
        judges whether the documented rationale is actually sound."""
        body = _checked_design_review_body(
            extra=(
                "ServerAdmin job queue view. Administrative/diagnostic exception: "
                "this is not couple-facing content, dense tabular comparison is "
                "the correct task pattern for operators."
            )
        )
        self.assertEqual(verify_mandatory_design_review(body), [])

    def test_checkbox_text_case_variation_does_not_break_the_gate(self) -> None:
        """A harmless casing edit to one checkbox line must not fail the gate:
        matching mirrors the historical grep -Fqi behavior for checkbox text."""
        body = _checked_design_review_body().replace(
            "- [x] Designed from Compact/smartphone outward",
            "- [X] designed FROM Compact/Smartphone Outward",
        )
        self.assertEqual(verify_mandatory_design_review(body), [])


class TestAutomatedDependencyExemption(unittest.TestCase):
    def test_only_the_exact_bot_without_a_ui_change_is_exempt(self) -> None:
        self.assertTrue(is_exempt_dependency_update(AUTOMATED_DEPENDENCY_AUTHOR, ui_changed=False))
        for author in (
            AUTOMATED_DEPENDENCY_AUTHOR,
            "dependabot",
            "Dependabot[bot]",
            "dependabot[bot] ",
            "app/dependabot",
            "renovate[bot]",
            "baerenmarke90",
            "",
            None,
        ):
            with self.subTest(author=author, ui_changed=True):
                self.assertFalse(is_exempt_dependency_update(author, ui_changed=True))
        for author in ("dependabot", "Dependabot[bot]", "dependabot[bot] ", "renovate[bot]", "", None):
            with self.subTest(author=author, ui_changed=False):
                self.assertFalse(is_exempt_dependency_update(author, ui_changed=False))

    @staticmethod
    def run_main(*, body: str, author: str, ui_changed: str) -> tuple[int, str]:
        environment = {"PR_BODY": body, "PR_AUTHOR": author, "UI_CHANGED": ui_changed}
        output = StringIO()
        with mock.patch.dict(os.environ, environment, clear=False), redirect_stdout(output):
            return main(), output.getvalue()

    def test_dependabot_pr_with_default_body_passes_when_no_ui_path_changed(self) -> None:
        code, output = self.run_main(body="Bumps x from 1 to 2.", author="dependabot[bot]", ui_changed="false")
        self.assertEqual(code, 0)
        self.assertIn("Automated dependency update", output)

    def test_dependabot_pr_that_changed_a_ui_path_still_needs_the_declaration(self) -> None:
        code, _ = self.run_main(body="Bumps x from 1 to 2.", author="dependabot[bot]", ui_changed="true")
        self.assertEqual(code, 1)

    def test_other_authors_keep_the_gate_even_without_a_ui_change(self) -> None:
        for author in ("baerenmarke90", "", "Dependabot[bot]"):
            with self.subTest(author=author):
                code, _ = self.run_main(body="no checkboxes", author=author, ui_changed="false")
                self.assertEqual(code, 1)

    def test_regular_pr_flow_is_unchanged(self) -> None:
        code, _ = self.run_main(
            body="- [x] No user-facing UI / UX impact", author="baerenmarke90", ui_changed="false"
        )
        self.assertEqual(code, 0)
        code, _ = self.run_main(
            body=_checked_design_review_body(), author="baerenmarke90", ui_changed="true"
        )
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
