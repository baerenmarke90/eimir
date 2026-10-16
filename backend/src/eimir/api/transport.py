"""Transport boundaries for production HTTP requests."""

from __future__ import annotations

import re
from ipaddress import ip_address

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from eimir.api.errors import problem
from eimir.core.errors import ErrorCode

ORDINARY_REQUEST_MAX_BYTES = 8 * 1024 * 1024

_ATTACHMENT_CONTENT_PATH = re.compile(r"/api/v1/spaces/[^/]+/attachments/[^/]+/content\Z")
_TRANSFER_IMPORT_PATH = re.compile(r"/api/v1/spaces/[^/]+/transfer/imports\Z")


def _has_dedicated_stream_limit(scope: Scope) -> bool:
    """Leave only the two binary upload routes to their own streaming limits."""
    method = scope.get("method")
    path = scope.get("path", "")
    return bool(
        (method == "PUT" and _ATTACHMENT_CONTENT_PATH.fullmatch(path))
        or (method == "POST" and _TRANSFER_IMPORT_PATH.fullmatch(path))
    )


class _RequestBodyTooLargeError(Exception):
    """Stop forwarding a request body before a parser buffers an oversized chunk."""


class RequestBodyLimitMiddleware:
    """Bound ordinary request bodies before FastAPI buffers or validates them.

    Attachments and Transfer imports are intentionally exempt: their endpoints
    stream and enforce their separate 25 MiB / 512 MiB limits after authorization.
    The limit applies even when Content-Length is missing or understated.
    """

    def __init__(self, app: ASGIApp, max_size: int = ORDINARY_REQUEST_MAX_BYTES) -> None:
        self.app = app
        self.max_size = max_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or _has_dedicated_stream_limit(scope):
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_size:
                    await self._reject(scope, receive, send)
                    return
            except ValueError:
                # An invalid header is a transport concern; the receive limit
                # still protects this application if the server accepts it.
                pass

        received = 0
        response_started = False

        async def receive_limited() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_size:
                    raise _RequestBodyTooLargeError
            return message

        async def send_limited(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive_limited, send_limited)
        except _RequestBodyTooLargeError:
            if response_started:
                # ASGI cannot replace a response after its headers were sent.
                raise
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        response = problem(
            413,
            "payload_too_large",
            "Payload too large",
            "The request body exceeds the supported size limit.",
            ErrorCode.REQUEST_BODY_TOO_LARGE,
        )
        await response(scope, receive, send)


def _peer_is_loopback(scope: Scope) -> bool:
    """Return whether the ASGI client address is an actual loopback IP.

    Request authority/Host is caller-controlled and therefore cannot establish
    network locality. Uvicorn supplies ``scope['client']`` from the connection
    peer and only normalizes it from forwarded headers for explicitly trusted
    proxy addresses. This middleware deliberately parses neither Host nor
    forwarded headers itself.
    """
    client = scope.get("client")
    if not client:
        return False

    try:
        return ip_address(client[0]).is_loopback
    except ValueError:
        # A non-IP or otherwise malformed peer value is never evidence that the
        # connection is local. Fail closed to the HTTPS requirement.
        return False


class RequireHttpsForExternalHostsMiddleware:
    """Allow cleartext HTTP only for connections that are actually loopback.

    A TLS reverse proxy sets the scheme through forwarded headers. Uvicorn
    accepts those headers only from explicitly trusted proxy addresses, so a
    client cannot spoof HTTPS by supplying its own forwarded header.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope.get("scheme") != "https"
            and not _peer_is_loopback(scope)
        ):
            response = problem(
                400,
                "bad_request",
                "Bad request",
                "HTTPS is required for non-loopback access.",
                "HTTPS_REQUIRED",
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
