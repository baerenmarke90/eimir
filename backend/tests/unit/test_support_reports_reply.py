"""Validation of an operator reply, before any database access (#2189)."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from eimir.core.errors import ErrorCode, ValidationError
from eimir.support_reports import service
from eimir.support_reports.payload import REPLY_MAX_CHARACTERS

EMOJI = "\U0001f49b"


def _send(text: str) -> Any:
    # The session is never reached: validation comes first.
    return service.send_reply(
        None,  # type: ignore[arg-type]
        report_id=uuid4(),
        text=text,
        operator_id=None,
    )


def test_reply_over_500_is_rejected_before_anything_is_stored() -> None:
    with pytest.raises(ValidationError) as error:
        _send("x" * (REPLY_MAX_CHARACTERS + 1))
    assert error.value.code == ErrorCode.VALIDATION_FAILED
    with pytest.raises(ValidationError):
        _send(EMOJI * (REPLY_MAX_CHARACTERS + 1))


@pytest.mark.parametrize("text", ["", "   ", "\n\t "])
def test_blank_reply_is_rejected(text: str) -> None:
    with pytest.raises(ValidationError):
        _send(text)


def test_limit_counts_characters_not_bytes() -> None:
    assert service._reply_text(EMOJI * REPLY_MAX_CHARACTERS) == EMOJI * REPLY_MAX_CHARACTERS
    assert service._reply_text("  hello \n") == "hello"
