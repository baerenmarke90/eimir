"""Bounded public-HTTPS transport shared by explicit photo-source adapters."""

from __future__ import annotations

import http.client
import ipaddress
import re
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from dataclasses import dataclass, field
from typing import cast
from urllib.parse import urlsplit

from pydantic import SecretStr

_HOSTNAME = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")
_READ_CHUNK_BYTES = 64 * 1024
_DNS_SECONDS = 5.0
# A timed-out system resolver cannot be killed safely. Bound its concurrency and
# reject new work while both workers remain occupied instead of growing a queue.
_DNS_WORKERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix="photo-source-dns")
_DNS_SLOTS = threading.BoundedSemaphore(2)


class PhotoSourceError(ValueError):
    """Fixed internal codes only; upstream exceptions and data are never quoted."""


@dataclass(frozen=True)
class SelectedPhoto:
    content: bytes = field(repr=False)
    mime_type: str
    filename: str


@dataclass(frozen=True)
class PhotoResponse:
    content: bytes = field(repr=False)
    mime_type: str


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise PhotoSourceError("PHOTO_SOURCE_TIMEOUT")
    return remaining


def _hostname(origin: str) -> str:
    try:
        parts = urlsplit(origin)
        hostname = parts.hostname
        valid = (
            hostname is not None
            and len(hostname) <= 253
            and "." in hostname
            and all(_HOSTNAME.fullmatch(label) for label in hostname.split("."))
            and origin == f"https://{hostname}"
        )
    except ValueError:
        valid = False
        hostname = None
    if not valid or hostname is None:
        raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
    return hostname


def _resolve_public_address(hostname: str, deadline: float) -> str:
    slots = _DNS_SLOTS
    if not slots.acquire(blocking=False):
        raise PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE")
    try:
        future = _DNS_WORKERS.submit(socket.getaddrinfo, hostname, 443, 0, socket.SOCK_STREAM)
    except RuntimeError:
        slots.release()
        raise PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE") from None
    future.add_done_callback(lambda _: slots.release())
    try:
        answers = future.result(timeout=min(_DNS_SECONDS, _remaining(deadline)))
    except TimeoutError:
        future.cancel()
        raise PhotoSourceError("PHOTO_SOURCE_TIMEOUT") from None
    except OSError:
        raise PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE") from None
    try:
        addresses = {ipaddress.ip_address(cast(str, answer[4][0])) for answer in answers}
    except ValueError:
        raise PhotoSourceError("PHOTO_SOURCE_TARGET_BLOCKED") from None
    if not addresses or any(not _is_public(address) for address in addresses):
        raise PhotoSourceError("PHOTO_SOURCE_TARGET_BLOCKED")
    return str(sorted(addresses, key=str)[0])


def _is_public(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if not address.is_global or address.is_multicast or address.is_reserved:
        return False
    if isinstance(address, ipaddress.IPv6Address):
        if (
            address.scope_id is not None
            or address.sixtofour is not None
            or address.teredo is not None
        ):
            return False
        if address.ipv4_mapped is not None:
            return _is_public(address.ipv4_mapped)
    return True


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, hostname: str, address: str, deadline: float) -> None:
        self._context = ssl.create_default_context()
        super().__init__(hostname, 443, timeout=_remaining(deadline), context=self._context)
        self._address = address
        self._deadline = deadline
        self._stream_socket: socket.socket | None = None

    def connect(self) -> None:
        family = socket.AF_INET6 if ":" in self._address else socket.AF_INET
        # Numeric socket.connect does not call getaddrinfo again. TLS still
        # authenticates the original configured hostname, never the selected IP.
        raw = socket.socket(family, socket.SOCK_STREAM)
        self._stream_socket = raw
        try:
            raw.settimeout(_remaining(self._deadline))
            target = (
                (self._address, 443, 0, 0) if family == socket.AF_INET6 else (self._address, 443)
            )
            raw.connect(target)
            secure = self._context.wrap_socket(
                raw, server_hostname=self.host, do_handshake_on_connect=False
            )
            self.sock = secure
            self._stream_socket = secure
            secure.settimeout(_remaining(self._deadline))
            secure.do_handshake()
        except Exception:
            self.abort()
            raw.close()
            raise

    def abort(self) -> None:
        # shutdown interrupts even a slow response-header read. HTTPResponse's
        # file wrapper may still own the descriptor after HTTPConnection.close.
        stream = self._stream_socket
        if stream is not None:
            with suppress(OSError):
                stream.shutdown(socket.SHUT_RDWR)
            stream.close()


class PhotoSourceHttp:
    """Fixed-path adapter transport; callers choose no client-supplied endpoint."""

    def __init__(self, origin: str, headers: dict[str, SecretStr]) -> None:
        self._hostname = _hostname(origin)
        for value in headers.values():
            secret = value.get_secret_value()
            if not 1 <= len(secret) <= 8192 or any(not 32 <= ord(c) <= 126 for c in secret):
                raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
        self._headers = headers

    def __repr__(self) -> str:
        return "PhotoSourceHttp()"

    def request(
        self,
        method: str,
        path: str,
        *,
        limit: int,
        mime_types: set[str],
        deadline: float,
        body: bytes | None = None,
        statuses: frozenset[int] = frozenset({200}),
    ) -> bytes:
        return self.response(
            method,
            path,
            limit=limit,
            mime_types=mime_types,
            deadline=deadline,
            body=body,
            statuses=statuses,
        ).content

    def response(
        self,
        method: str,
        path: str,
        *,
        limit: int,
        mime_types: set[str],
        deadline: float,
        body: bytes | None = None,
        statuses: frozenset[int] = frozenset({200}),
    ) -> PhotoResponse:
        address = _resolve_public_address(self._hostname, deadline)
        connection = _PinnedHTTPSConnection(self._hostname, address, deadline)
        watchdog = threading.Timer(_remaining(deadline), connection.abort)
        watchdog.daemon = True
        watchdog.start()
        try:
            connection.request(
                method,
                path,
                body=body,
                headers={
                    **{key: value.get_secret_value() for key, value in self._headers.items()},
                    **({"Content-Type": "application/json"} if body is not None else {}),
                    "Accept": ", ".join(sorted(mime_types)),
                    "Accept-Encoding": "identity",
                },
            )
            with connection.getresponse() as response:
                _remaining(deadline)
                if response.status not in statuses:
                    raise PhotoSourceError("PHOTO_SOURCE_REJECTED")
                if response.status == 204:
                    return PhotoResponse(b"", "")
                encoding = response.getheader("Content-Encoding", "identity").lower().strip()
                mime = response.getheader("Content-Type", "").split(";", 1)[0].lower().strip()
                if encoding != "identity" or mime not in mime_types:
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
                length = response.getheader("Content-Length")
                transfer = response.getheader("Transfer-Encoding")
                if transfer is not None and (transfer.lower() != "chunked" or length is not None):
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
                if length is not None and (
                    not length.isascii() or not length.isdecimal() or len(length) > 12
                ):
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
                if length is not None and int(length) > limit:
                    raise PhotoSourceError("PHOTO_SOURCE_TOO_LARGE")
                content = bytearray()
                while True:
                    _remaining(deadline)
                    chunk = response.read1(min(_READ_CHUNK_BYTES, limit + 1 - len(content)))
                    if not chunk:
                        break
                    content.extend(chunk)
                    if len(content) > limit:
                        raise PhotoSourceError("PHOTO_SOURCE_TOO_LARGE")
                _remaining(deadline)
                if not content or (length is not None and len(content) != int(length)):
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
                return PhotoResponse(bytes(content), mime)
        except PhotoSourceError:
            raise
        except (OSError, http.client.HTTPException):
            if time.monotonic() >= deadline:
                raise PhotoSourceError("PHOTO_SOURCE_TIMEOUT") from None
            raise PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE") from None
        finally:
            watchdog.cancel()
            connection.abort()
            connection.close()
