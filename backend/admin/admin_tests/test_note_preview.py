"""The note preview of the support report list (#2327, design section 5.1).

The list shows the start of a report's note so the operator can triage without
opening every report; the full note stays in the detail.
"""

from __future__ import annotations

import pytest

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api.preview import NOTE_PREVIEW_MAX_CHARACTERS, note_preview


def test_the_limit_is_160_characters() -> None:
    assert NOTE_PREVIEW_MAX_CHARACTERS == 160


def test_note_preview_of_no_note_is_none() -> None:
    assert note_preview(None) is None


def test_note_preview_blank_is_none() -> None:
    assert note_preview(" \n\t ") is None


def test_note_preview_collapses_whitespace() -> None:
    assert note_preview("  a\n\n  b\tc ") == "a b c"


def test_note_preview_keeps_a_note_of_exactly_the_limit() -> None:
    assert note_preview("x" * 160) == "x" * 160


def test_note_preview_cuts_a_longer_note_with_an_ellipsis() -> None:
    assert note_preview("x" * 161) == "x" * 160 + "…"


def test_note_preview_counts_an_emoji_as_one_character() -> None:
    assert note_preview("😀" * 161) == "😀" * 160 + "…"
