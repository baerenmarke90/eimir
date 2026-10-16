"""ASGI middlewares for Request-ID propagation and access logging."""

from __future__ import annotations

import logging
import re
import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from eimir.core.ids import new_id
from eimir.observability.context import (
    set_correlation_id,
    set_request_id,
)

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-\.]{1,64}$")
_ACCESS_LOG = logging.getLogger("eimir.access")


def _is_valid_request_id(value: str) -> bool:
    return bool(_REQUEST_ID_PATTERN.match(value))


class RequestIdMiddleware:
    """Extract or generate Request-ID and Correlation-ID, and attach to response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        incoming_id = headers.get("x-request-id") or headers.get("x-correlation-id")

        if incoming_id and _is_valid_request_id(incoming_id):
            request_id = incoming_id
        else:
            request_id = str(new_id())

        set_request_id(request_id)
        set_correlation_id(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            set_request_id(None)
            set_correlation_id(None)


class RequestLoggingMiddleware:
    """Log HTTP access metadata (method, path, status, latency) without sensitive payload."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start_time = time.monotonic()
        status_code = 500
        path = scope.get("path", "")
        method = scope.get("method", "")

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.monotonic() - start_time) * 1000, 2)
            _ACCESS_LOG.info(
                "%s %s -> %d (%.2fms)",
                method,
                path,
                status_code,
                duration_ms,
                extra={
                    "http_method": method,
                    "http_path": path,
                    "http_status": status_code,
                    "duration_ms": duration_ms,
                },
            )
