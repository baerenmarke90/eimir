"""Focused unit coverage for privacy-safe exception formatting (#680)."""

from __future__ import annotations

import json
import logging

from eimir.config import Environment, Settings
from eimir.observability import (
    ConsoleLogFormatter,
    JsonLogFormatter,
    RedactingFilter,
    configure_logging,
    safe_exception_summary,
    safe_traceback_text,
    sanitize_error_code,
)

_MARKER_A = "DIAGNOSTIC-CANARY-A-6F3C"
_MARKER_B = "DIAGNOSTIC-CANARY-B-7D4E"


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(self.format(record))


def _format_exception(formatter: logging.Formatter, marker: str = _MARKER_A) -> str:
    """Exercise the production filter + formatter path with an arbitrary marker."""
    logger = logging.getLogger("eimir.test.exception_pipeline")
    logger.setLevel(logging.ERROR)
    logger.propagate = False
    handler = _ListHandler()
    handler.addFilter(RedactingFilter())
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    try:
        try:
            raise RuntimeError(marker)
        except RuntimeError:
            logger.exception("job failed", extra={"job_id": "job-1", "kind": "demo"})
    finally:
        logger.removeHandler(handler)

    assert handler.records
    return handler.records[0]


def test_json_exception_pipeline_omits_runtime_message() -> None:
    formatted = _format_exception(JsonLogFormatter())
    assert _MARKER_A not in formatted

    data = json.loads(formatted)
    assert data["message"] == "job failed"
    assert "RuntimeError" in data["exception"]
    assert "Traceback (most recent call last):" in data["exception"]
    assert "test_observability_exception_pipeline.py" in data["exception"]
    assert "_format_exception" in data["exception"]


def test_console_exception_pipeline_omits_runtime_message() -> None:
    formatted = _format_exception(ConsoleLogFormatter())
    assert _MARKER_A not in formatted
    assert "RuntimeError" in formatted
    assert "job failed" in formatted


def test_chained_exception_omits_both_runtime_messages() -> None:
    logger = logging.getLogger("eimir.test.chained_exception_pipeline")
    logger.setLevel(logging.ERROR)
    logger.propagate = False
    handler = _ListHandler()
    handler.addFilter(RedactingFilter())
    handler.setFormatter(JsonLogFormatter())
    logger.addHandler(handler)
    try:
        try:
            try:
                raise ValueError(_MARKER_A)
            except ValueError as cause:
                raise RuntimeError(_MARKER_B) from cause
        except RuntimeError:
            logger.exception("job failed")
    finally:
        logger.removeHandler(handler)

    formatted = handler.records[0]
    assert _MARKER_A not in formatted
    assert _MARKER_B not in formatted
    data = json.loads(formatted)
    assert "ValueError" in data["exception"]
    assert "RuntimeError" in data["exception"]
    assert "direct cause" in data["exception"]


def test_safe_exception_summary_is_fail_closed_for_arbitrary_text() -> None:
    assert safe_exception_summary(RuntimeError(_MARKER_A)) == "RuntimeError"
    assert safe_exception_summary(ValueError("ordinary runtime prose")) == "ValueError"


def test_safe_exception_summary_preserves_explicit_compatibility_codes() -> None:
    assert safe_exception_summary(RuntimeError("ACCOUNT_UNAVAILABLE")) == (
        "RuntimeError: ACCOUNT_UNAVAILABLE"
    )
    assert safe_exception_summary(RuntimeError("ACCOUNT_DELETION_CONVERGENCE_FAILED")) == (
        "RuntimeError: ACCOUNT_DELETION_CONVERGENCE_FAILED"
    )


def test_safe_exception_summary_never_calls_custom_str() -> None:
    class ExplodingError(Exception):
        def __str__(self) -> str:
            raise AssertionError("must not be called")

    assert safe_exception_summary(ExplodingError(_MARKER_A)) == "ExplodingError"


def test_safe_traceback_omits_runtime_message_and_literal_source_line() -> None:
    try:
        raise RuntimeError(_MARKER_A)
    except RuntimeError as exc:
        rendered = safe_traceback_text((RuntimeError, exc, exc.__traceback__))

    assert _MARKER_A not in rendered
    assert "test_observability_exception_pipeline.py" in rendered
    assert "test_safe_traceback_omits_runtime_message_and_literal_source_line" in rendered
    assert "raise RuntimeError" not in rendered


def test_sanitize_error_code_keeps_only_bounded_code_shape() -> None:
    assert sanitize_error_code("provider_timeout") == "PROVIDER_TIMEOUT"
    assert sanitize_error_code("Connection refused by upstream") == "UNKNOWN"
    assert sanitize_error_code("not a code!", default="FALLBACK") == "FALLBACK"


class TestUvicornLoggingBoundary:
    def _production_settings(self) -> Settings:
        return Settings(
            environment=Environment.PRODUCTION,
            allowed_hosts=["app.example"],
            cursor_signing_key="a" * 32,
            public_base_url="https://app.example",
            mail_transport="smtp",
        )

    def _simulate_uvicorn_then_app_startup(self) -> None:
        import logging.config

        import uvicorn.config as uvicorn_config

        logging.config.dictConfig(uvicorn_config.LOGGING_CONFIG)
        configure_logging(self._production_settings())

    def teardown_method(self) -> None:
        for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
            logger = logging.getLogger(name)
            logger.handlers = []
            logger.propagate = True
        for handler in list(logging.getLogger().handlers):
            logging.getLogger().removeHandler(handler)

    def test_uvicorn_access_log_is_silenced(self, capsys) -> None:  # type: ignore[no-untyped-def]
        self._simulate_uvicorn_then_app_startup()

        logging.getLogger("uvicorn.access").info(
            '%s - "%s" %d',
            "127.0.0.1:12345",
            f"GET /api/v1/thing?probe={_MARKER_A} HTTP/1.1",
            200,
        )

        output = capsys.readouterr().out
        assert _MARKER_A not in output
        assert "GET /api/v1/thing" not in output

    def test_uvicorn_error_uses_sanitized_exception_formatter(self, capsys) -> None:  # type: ignore[no-untyped-def]
        self._simulate_uvicorn_then_app_startup()

        try:
            raise RuntimeError(_MARKER_A)
        except RuntimeError:
            logging.getLogger("uvicorn.error").exception("Exception in ASGI application")

        output = capsys.readouterr().out
        assert _MARKER_A not in output
        assert "RuntimeError" in output
        assert "Exception in ASGI application" in output

    def test_uvicorn_startup_banner_reaches_application_sink(self, capsys) -> None:  # type: ignore[no-untyped-def]
        self._simulate_uvicorn_then_app_startup()
        logging.getLogger("uvicorn").info("Uvicorn running on http://0.0.0.0:8000")
        assert "Uvicorn running" in capsys.readouterr().out
