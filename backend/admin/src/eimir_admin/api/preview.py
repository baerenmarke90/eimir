"""The note preview of the support report list (#2327).

The list carries only the start of a note: enough to see what a report is about,
never the full text, which the detail reads one report at a time.
"""

from __future__ import annotations

NOTE_PREVIEW_MAX_CHARACTERS = 160
_ELLIPSIS = "…"


def note_preview(note: str | None) -> str | None:
    """The note's first 160 characters on one line, or ``None`` without a note.

    Whitespace runs (line breaks included) become one space; a cut note ends
    with an ellipsis. Characters are code points, so an emoji counts as one.
    """
    if note is None:
        return None
    flat = " ".join(note.split())
    if not flat:
        return None
    if len(flat) <= NOTE_PREVIEW_MAX_CHARACTERS:
        return flat
    return flat[:NOTE_PREVIEW_MAX_CHARACTERS] + _ELLIPSIS
