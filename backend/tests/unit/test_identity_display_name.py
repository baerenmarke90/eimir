"""Display-name rules for the authoritative Account identity."""

from __future__ import annotations

import pytest

from eimir.core.errors import ValidationError
from eimir.identity.service import (
    MAX_DISPLAY_NAME,
    AccountErrorCode,
    normalize_display_name,
)


def test_display_name_is_trimmed_and_preserves_unicode() -> None:
    assert normalize_display_name("  Jörg 李 👩‍❤️‍👩  ") == "Jörg 李 👩‍❤️‍👩"


@pytest.mark.parametrize("value", ["", "   ", "\u200b\u200d", "\x00\x01"])
def test_display_name_rejects_empty_or_control_only_values(value: str) -> None:
    with pytest.raises(ValidationError) as caught:
        normalize_display_name(value)

    assert caught.value.code == AccountErrorCode.DISPLAY_NAME_REQUIRED


def test_display_name_accepts_the_documented_length_limit() -> None:
    value = "ä" * MAX_DISPLAY_NAME
    assert normalize_display_name(value) == value


def test_display_name_rejects_values_above_the_length_limit() -> None:
    with pytest.raises(ValidationError) as caught:
        normalize_display_name("a" * (MAX_DISPLAY_NAME + 1))

    assert caught.value.code == AccountErrorCode.DISPLAY_NAME_TOO_LONG
