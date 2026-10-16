"""Regression coverage for fail-closed unexpected-exception diagnostics."""

from __future__ import annotations

import sys

from eimir.observability import safe_exception_summary, safe_traceback_text


def test_machine_code_shaped_runtime_text_is_not_implicitly_trusted() -> None:
    assert safe_exception_summary(RuntimeError("SUPER-SECRET-TOKEN")) == "RuntimeError"
    assert safe_exception_summary(RuntimeError("SECRET123")) == "RuntimeError"
    assert safe_exception_summary(RuntimeError("PRIVATE_CONTENT")) == "RuntimeError"


def test_traceback_omits_exception_message_and_literal_source_line() -> None:
    try:
        raise RuntimeError("SOURCE_LINE_PRIVATE_CANARY")
    except RuntimeError:
        rendered = safe_traceback_text(sys.exc_info())

    assert "SOURCE_LINE_PRIVATE_CANARY" not in rendered
    assert "test_observability_exception_safety.py" in rendered
    assert "test_traceback_omits_exception_message_and_literal_source_line" in rendered
    assert "raise RuntimeError" not in rendered
