"""The required terms version must be the version of the canonical document."""

from __future__ import annotations

import re
from pathlib import Path

from eimir.legal.terms import TERMS_OF_USE_VERSION

DOCUMENT = Path(__file__).resolve().parents[3] / "legal" / "de" / "terms-of-use.md"


def front_matter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    assert match is not None, "The terms of use have no front matter"
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, _, value = line.partition(":")
        values[key.strip()] = value.strip()
    return values


def test_required_version_is_the_canonical_document_version() -> None:
    metadata = front_matter(DOCUMENT.read_text(encoding="utf-8"))

    assert metadata["document"] == "terms-of-use"
    assert metadata["version"] == TERMS_OF_USE_VERSION
