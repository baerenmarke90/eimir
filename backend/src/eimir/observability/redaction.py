"""Redaction and scrubbing for logs, telemetry, and error diagnostics.

Ensures that tokens, cookies, authorization headers, presigned URLs, email
link tokens, OWNER_ONLY / ProtectedPayload contents, and precise location
data never enter log sinks (CLEAN-ROOM-MASTER-SPEC §57).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

REDACTED = "[REDACTED]"

SENSITIVE_FIELD_NAMES: frozenset[str] = frozenset(
    {
        "password",
        "secret",
        "client_secret",
        "bootstrap_token",
        "cursor_signing_key",
        "s3_secret_access_key",
        "s3_session_token",
        "token",
        "access_token",
        "refresh_token",
        "session_token",
        "private_key",
        "credentials",
        "cookie",
        "authorization",
        # Clean-Room §57 sensitive content
        "body",
        "text",
        "note",
        "answers",
        "gift_idea",
        "latitude",
        "longitude",
        "location",
        "coordinates",
        "q",
        "query",
        "search",
    }
)

SENSITIVE_HEADER_NAMES: frozenset[str] = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "x-bootstrap-token",
        "x-cursor-key",
        "x-api-key",
    }
)

SENSITIVE_QUERY_PARAMS: frozenset[str] = frozenset(
    {
        "token",
        "secret",
        "signature",
        "key",
        "code",
        "access_token",
        "refresh_token",
        "x-amz-signature",
        "x-amz-security-token",
        "x-amz-credential",
        "sig",
        "q",
        "query",
        "search",
    }
)

_BEARER_PATTERN = re.compile(r"(?i)\b(bearer\s+)([A-Za-z0-9_\-\.~+/]+=*)")
_PASSWORD_KV_PATTERN = re.compile(
    r"(?i)\b(password|secret|token|bootstrap_token|cursor_signing_key)\s*[:=]\s*['\"]?([^'\",\s]+)['\"]?"
)


def scrub_url(url_string: str) -> str:
    """Scrub sensitive query parameters from a URL."""
    try:
        parts = urlsplit(url_string)
        if not parts.query:
            return url_string
        query_pairs = parse_qsl(parts.query, keep_blank_values=True)
        cleaned_pairs: list[tuple[str, str]] = []
        for key, value in query_pairs:
            if key.lower() in SENSITIVE_QUERY_PARAMS:
                cleaned_pairs.append((key, REDACTED))
            else:
                cleaned_pairs.append((key, value))
        cleaned_query = urlencode(cleaned_pairs, safe="[]")
        return urlunsplit((parts.scheme, parts.netloc, parts.path, cleaned_query, parts.fragment))
    except Exception:
        return REDACTED


def scrub_message(message: str) -> str:
    """Scrub common secret patterns from unstructured log text."""
    if not message:
        return message
    cleaned = _BEARER_PATTERN.sub(r"\1" + REDACTED, message)
    cleaned = _PASSWORD_KV_PATTERN.sub(r"\1=" + REDACTED, cleaned)
    return cleaned


def scrub_data(data: Any, depth: int = 0) -> Any:
    """Recursively scrub sensitive keys and patterns from arbitrary Python data."""
    if depth > 10:
        return data

    if isinstance(data, str):
        if "://" in data:
            return scrub_url(scrub_message(data))
        return scrub_message(data)

    if hasattr(data, "query") and hasattr(data, "scheme"):
        return scrub_url(str(data))

    if isinstance(data, Mapping):
        scrubbed: dict[str, Any] = {}
        for key, value in data.items():
            key_str = str(key)
            if key_str.lower() in SENSITIVE_FIELD_NAMES:
                scrubbed[key_str] = REDACTED
            else:
                scrubbed[key_str] = scrub_data(value, depth + 1)
        return scrubbed

    if isinstance(data, Sequence) and not isinstance(data, (str, bytes, bytearray)):
        return [scrub_data(item, depth + 1) for item in data]

    return data


def scrub_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Return a dictionary of HTTP headers with sensitive headers redacted."""
    result: dict[str, str] = {}
    for name, value in headers.items():
        if name.lower() in SENSITIVE_HEADER_NAMES:
            result[name] = REDACTED
        else:
            result[name] = value
    return result


class RedactingFilter(logging.Filter):
    """Logging filter that scrubs sensitive fields and message contents."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = scrub_message(record.msg)

        if record.args:
            if isinstance(record.args, Mapping):
                record.args = scrub_data(dict(record.args))
            elif isinstance(record.args, tuple):
                record.args = tuple(scrub_data(arg) for arg in record.args)
            elif isinstance(record.args, list):
                record.args = [scrub_data(arg) for arg in record.args]

        return True
