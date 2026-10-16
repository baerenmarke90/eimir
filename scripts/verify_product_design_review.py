#!/usr/bin/env python3
"""Verify the mandatory Product Design / UX declarations on a pull request body.

Enforces Issue #824 plus the interaction-level consolidation from Issue #947:
a smartphone-first partner-app invariant declaration is mandatory for every PR
that changes user-facing client paths (as classified by
``scripts/classify_product_design_paths.py``). This module owns the machine-
checkable part of that gate only: are the required declarations present and
checked. It cannot and does not judge whether the resulting UI is actually
warm, beautiful, intuitive, or genuinely smartphone-first — that remains
human/product visual acceptance
(`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 12/13).
"""

from __future__ import annotations

import sys

IMPACT_REVIEWED = "- [x] User-facing UI / UX impact reviewed"
IMPACT_NO_IMPACT = "- [x] No user-facing UI / UX impact"

REQUIRED_SECTION_HEADING = "## Product Design / UX"
REQUIRED_RATIONALE_HEADING = "**Design result / rationale**"
REQUIRED_EVIDENCE_HEADING = "**Visual evidence**"

# Mirrors the "If user-facing UI / UX is affected" checklist in
# .github/pull_request_template.md. Keep both in sync: this list is the
# mandatory declaration surface for the smartphone-first partner-app
# invariant (Issue #824) and intuitive mobile interaction rules (Issue #947).
# CI verifies presence of the checked declaration, not the aesthetic/usability
# truth of its content.
REQUIRED_DESIGN_REVIEW_ITEMS: tuple[str, ...] = (
    "Partner-app experience standard applied",
    "Designed from Compact/smartphone outward",
    "Mobile Interaction Contract implemented or deviations documented",
    "Screen Template selected or a documented design-system gap explains why no existing template fits",
    "Existing design-system components and semantic tokens reused or the gap is documented",
    "Primary human/content focal point and dominant action are clear",
    "Primary actions smartphone-reachable and touch-target behavior reviewed",
    "Progressive disclosure applied where appropriate",
    "Established platform/mobile interaction pattern reused or deviation justified",
    "Typing and keyboard burden minimized for Compact where applicable",
    "Couple-facing composition is not spreadsheet/table/admin/CRM by default, or this is an explicit documented administrative/diagnostic exception",
    "If table/list/master-detail is used, its necessity is explicitly justified",
    "Result feels warm, modern, lively, beautiful, and not visually cold or sterile",
    "Gentle playfulness / relationship personality deliberately applied or consciously not appropriate for this context",
    "Love-message / relationship microcopy opportunity deliberately considered",
    "Expanded/Web adapts the product instead of replacing it with a desktop management UI",
    "Motion / feedback behavior reviewed, including reduced motion",
    "Representative Compact visual evidence attached or linked",
    "Expanded visual evidence attached or linked when Web is affected",
    "Light/Dark reviewed where theme-sensitive",
    "Large text/reflow reviewed where relevant",
)


def _normalize(body: str | None) -> str:
    return body or ""


def _has_checked_line(body: str, text: str) -> bool:
    """Case-insensitive fixed-string search for a checked checkbox line."""
    return f"- [x] {text}".casefold() in body.casefold()


def verify_impact_decision(body: str | None, *, ui_changed: bool) -> list[str]:
    """Verify exactly one UI-impact decision is checked, consistent with changed paths.

    Returns a list of human-readable errors; empty means the check passes.
    """
    body = _normalize(body)
    errors: list[str] = []

    reviewed = IMPACT_REVIEWED.casefold() in body.casefold()
    no_impact = IMPACT_NO_IMPACT.casefold() in body.casefold()

    if reviewed == no_impact:
        errors.append(
            "The PR must select exactly one Product Design / UX impact decision. "
            f"Expected one of:\n  {IMPACT_REVIEWED}\n  {IMPACT_NO_IMPACT}"
        )
        return errors

    if ui_changed and not reviewed:
        errors.append(
            "Client UI files changed, so 'User-facing UI / UX impact reviewed' is mandatory."
        )

    return errors


def verify_mandatory_design_review(body: str | None) -> list[str]:
    """Verify the full mandatory Product Design / UX declaration set is present.

    Only called when changed paths are classified as user-facing client paths.
    """
    body = _normalize(body)
    errors: list[str] = []

    if REQUIRED_SECTION_HEADING not in body:
        errors.append(f"Section '{REQUIRED_SECTION_HEADING}' is missing.")

    for item in REQUIRED_DESIGN_REVIEW_ITEMS:
        if not _has_checked_line(body, item):
            errors.append(f"Missing mandatory Product Design / UX review item:\n  - [x] {item}")

    if REQUIRED_RATIONALE_HEADING not in body:
        errors.append("Product Design / UX review is missing its design rationale.")

    if REQUIRED_EVIDENCE_HEADING not in body:
        errors.append("Product Design / UX review is missing its visual evidence section.")

    return errors


def main() -> int:
    """CLI entrypoint. Reads PR_BODY and UI_CHANGED from the environment.

    UI_CHANGED must be the literal string "true" or "false" (matches the
    `changed` step output produced by classify_product_design_paths.py in the
    Product Design Review workflow).
    """
    import os

    body = os.environ.get("PR_BODY", "")
    ui_changed = os.environ.get("UI_CHANGED", "false").strip().lower() == "true"

    errors = verify_impact_decision(body, ui_changed=ui_changed)
    if errors:
        for error in errors:
            print(error)
        return 1

    print("Product Design / UX impact decision is consistent with changed paths.")

    if ui_changed:
        review_errors = verify_mandatory_design_review(body)
        if review_errors:
            for error in review_errors:
                print(error)
            return 1
        print("Mandatory partner-app design review is present.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
