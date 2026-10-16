"""Log formatters and logging configuration.

Supports structured JSON formatting for production/cloud and human-readable
text formatting for local development and tests, with automatic context
enrichment (request_id, correlation_id, actor_id, space_id) and redaction.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from eimir.config import LogFormat, MailTransport, Settings
from eimir.observability.context import (
    get_account_id,
    get_correlation_id,
    get_request_id,
    get_space_id,
)
from eimir.observability.diagnostics import safe_traceback_text
from eimir.observability.redaction import RedactingFilter, scrub_data

_STANDARD_LOG_RECORD_ATTRIBUTES: frozenset[str] = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "thread",
        "threadName",
        "taskName",
    }
)


class _SanitizingFormatter(logging.Formatter):
    """Base for every formatter this application registers.

    `logging.Formatter.format()` renders an exception by calling
    `self.formatException(record.exc_info)`; overriding that one method here
    is the seam where the traceback boundary applies to every formatter that
    inherits it, JSON and console alike, instead of duplicating the override
    (or, worse, forgetting it) in each one. `RedactingFilter` runs earlier and
    covers `record.msg`/`record.args`; this is the other half of the same
    contract, for content that only exists once formatting happens.

    `format()` also discards any pre-existing `record.exc_text` first.
    `exc_text` is a mutable cache on the `LogRecord` itself, filled in by
    whichever formatter renders the exception first; the stdlib base class
    only calls `formatException()` `if not record.exc_text`. If some other
    handler on the same record (a second, misconfigured logging setup; a test
    double) already populated it with the ordinary unsanitized rendering,
    this formatter would otherwise silently reuse that cached text instead of
    ever calling the override below. Sanitized output must always be
    recomputed from `exc_info`, never trusted from a cache this class did not
    itself produce.
    """

    def format(self, record: logging.LogRecord) -> str:
        if record.exc_info:
            record.exc_text = None
        return super().format(record)

    def formatException(  # noqa: N802 -- overrides logging.Formatter's own name
        self,
        ei: tuple[type[BaseException] | None, BaseException | None, object | None],
    ) -> str:
        return safe_traceback_text(ei)  # type: ignore[arg-type]


class JsonLogFormatter(_SanitizingFormatter):
    """Formats log records as single-line JSON with context enrichment."""

    def format(self, record: logging.LogRecord) -> str:
        record_message = record.getMessage()

        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record_message,
        }

        request_id = getattr(record, "request_id", None) or get_request_id()
        if request_id:
            entry["request_id"] = request_id

        correlation_id = getattr(record, "correlation_id", None) or get_correlation_id()
        if correlation_id:
            entry["correlation_id"] = correlation_id

        account_id = getattr(record, "account_id", None) or get_account_id()
        if account_id:
            entry["account_id"] = account_id

        space_id = getattr(record, "space_id", None) or get_space_id()
        if space_id:
            entry["space_id"] = space_id

        extra_fields: dict[str, Any] = {}
        for key, value in record.__dict__.items():
            if (
                key not in _STANDARD_LOG_RECORD_ATTRIBUTES
                and key not in entry
                and not key.startswith("_")
            ):
                extra_fields[key] = value

        if extra_fields:
            entry["extra"] = scrub_data(extra_fields)

        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(entry, default=str)


class ConsoleLogFormatter(_SanitizingFormatter):
    """Human-readable text formatter for local development and test runs."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s %(levelname)s %(name)s%(context_tag)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    def format(self, record: logging.LogRecord) -> str:
        req_id = getattr(record, "request_id", None) or get_request_id()
        corr_id = getattr(record, "correlation_id", None) or get_correlation_id()

        tags: list[str] = []
        if req_id:
            tags.append(f"req={req_id}")
        if corr_id and corr_id != req_id:
            tags.append(f"corr={corr_id}")

        if tags:
            record.context_tag = " [" + " ".join(tags) + "]"
        else:
            record.context_tag = ""

        return super().format(record)


def _neutralize_uvicorn_logging() -> None:
    """Stop Uvicorn's own logging from bypassing the redaction boundary above.

    The production entrypoint is the bare ``uvicorn`` CLI, which resolves to
    ``Server.serve() -> Config.load()`` importing ``eimir.main:app`` —
    triggering this module's ``configure_logging()`` — only *after*
    ``Config.__init__`` has already run Uvicorn's own
    ``logging.config.dictConfig(...)``. Left alone, that leaves two
    independent, unredacted paths that this function's own handler above
    never sees, because both carry ``propagate=False``:

    - ``uvicorn.access`` logs the full raw request line, query string
      included, through Uvicorn's own formatter and handler.
      ``RequestLoggingMiddleware`` already logs a safe, path-only line for
      every request, so Uvicorn's copy is silenced outright rather than
      redacted: nothing here can tell a sensitive query parameter apart from
      an ordinary one embedded inside one opaque request-line string.
    - ``uvicorn`` and its child ``uvicorn.error`` (ASGI/protocol-level
      failures the application's own exception handlers never see) log
      through Uvicorn's own unredacted handler and stop there. Both are
      pointed at the root logger's handler instead.
    """
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers = []
    access_logger.propagate = False

    for logger_name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True


def configure_logging(settings: Settings) -> None:
    """Configure log sinks, with one explicit local mail-delivery exception.

    Normal application records always pass through ``RedactingFilter``. The
    development ``LOG`` mail adapter is different: its message body is itself
    the configured delivery medium, so its one-time authentication link must
    remain usable. Only that adapter's module logger receives an unredacted,
    non-propagating handler, and only while ``MailTransport.LOG`` is active in a
    non-public runtime. SMTP, disabled mail, Production, and Demo all fall back
    to the ordinary redacted root sink.
    """
    root_logger = logging.getLogger()

    try:
        level = getattr(logging, settings.log_level.upper(), logging.INFO)
    except Exception:
        level = logging.INFO

    root_logger.setLevel(level)

    # Silence noisy HTTP client and connection pool loggers
    for noisy in ("httpx", "httpx2", "httpcore", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # Remove existing handlers to prevent duplicate output
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    if settings.effective_log_format == LogFormat.JSON:
        formatter: logging.Formatter = JsonLogFormatter()
    else:
        formatter = ConsoleLogFormatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.addFilter(RedactingFilter())
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    _neutralize_uvicorn_logging()

    # ``eimir.mail.log`` is the implementation of EIMIR_MAIL_TRANSPORT=log.
    # Its body is intentionally the local delivery channel for one-time auth
    # links. Keep the bypass attached to this exact logger instead of teaching
    # the global redaction filter how to skip records.
    mail_delivery_logger = logging.getLogger("eimir.mail.log")
    for mail_handler in list(mail_delivery_logger.handlers):
        mail_delivery_logger.removeHandler(mail_handler)
    mail_delivery_logger.setLevel(logging.NOTSET)
    mail_delivery_logger.propagate = True

    if settings.mail_transport is MailTransport.LOG and not settings.is_production:
        mail_handler = logging.StreamHandler(sys.stdout)
        mail_handler.setLevel(level)
        mail_handler.setFormatter(formatter)
        mail_delivery_logger.addHandler(mail_handler)
        mail_delivery_logger.propagate = False
