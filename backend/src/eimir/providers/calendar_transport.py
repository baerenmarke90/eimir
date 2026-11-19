"""Bounded HTTPS transport for user-configured calendar servers (#1895).

A CalDAV server address is chosen by the user, so every request is an SSRF
boundary. The transport resolves the hostname once, rejects non-public
addresses unless the operator explicitly allowlisted that hostname on a
Self-Hosted deployment, connects to the resolved address and still verifies
TLS against the configured hostname (DNS-rebinding guard). It never follows
redirects itself, ignores proxy environment variables, bounds every response
and maps all failures to fixed codes without quoting upstream data.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import threading
import time
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from dataclasses import dataclass, field
from typing import cast
from urllib.parse import urlsplit

from eimir.providers.photo_transport import _HOSTNAME, _is_public, _retry_after

_READ_CHUNK_BYTES = 64 * 1024
_DNS_SECONDS = 5.0
_DNS_WORKERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix="calendar-dns")
_DNS_SLOTS = threading.BoundedSemaphore(2)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class CalendarTransportError(ValueError):
    """Fixed internal codes only; upstream exceptions and data are never quoted."""


class CalendarRateLimitedError(CalendarTransportError):
    def __init__(self, retry_after: float) -> None:
        super().__init__("CALENDAR_RATE_LIMITED")
        self.retry_after = retry_after


@dataclass(frozen=True)
class Origin:
    hostname: str
    port: int

    def url(self, path: str = "/") -> str:
        suffix = "" if self.port == 443 else f":{self.port}"
        return f"https://{self.hostname}{suffix}{path}"


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    content: bytes = field(repr=False)


def parse_https_url(value: str) -> tuple[Origin, str]:
    """Split a user-supplied HTTPS URL into a validated origin and path."""
    try:
        parts = urlsplit(value.strip())
        hostname = (parts.hostname or "").lower()
        port = parts.port or 443
    except ValueError:
        raise CalendarTransportError("CALENDAR_ADDRESS_INVALID") from None
    if (
        parts.scheme != "https"
        or parts.username is not None
        or parts.password is not None
        or parts.fragment
        or not hostname
        or len(hostname) > 253
        or not 1 <= port <= 65535
    ):
        raise CalendarTransportError("CALENDAR_ADDRESS_INVALID")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        # Literal addresses skip DNS and therefore the hostname-bound TLS check.
        raise CalendarTransportError("CALENDAR_ADDRESS_INVALID")
    if "." not in hostname or not all(_HOSTNAME.fullmatch(label) for label in hostname.split(".")):
        raise CalendarTransportError("CALENDAR_ADDRESS_INVALID")
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    return Origin(hostname, port), path


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise CalendarTransportError("CALENDAR_TIMEOUT")
    return remaining


def _resolve(origin: Origin, deadline: float, private_hosts: frozenset[str]) -> str:
    if not _DNS_SLOTS.acquire(blocking=False):
        raise CalendarTransportError("CALENDAR_UNREACHABLE")
    try:
        future = _DNS_WORKERS.submit(
            socket.getaddrinfo, origin.hostname, origin.port, 0, socket.SOCK_STREAM
        )
    except RuntimeError:
        _DNS_SLOTS.release()
        raise CalendarTransportError("CALENDAR_UNREACHABLE") from None
    future.add_done_callback(lambda _: _DNS_SLOTS.release())
    try:
        answers = future.result(timeout=min(_DNS_SECONDS, _remaining(deadline)))
    except TimeoutError:
        future.cancel()
        raise CalendarTransportError("CALENDAR_TIMEOUT") from None
    except OSError:
        raise CalendarTransportError("CALENDAR_UNREACHABLE") from None
    try:
        addresses = {ipaddress.ip_address(cast(str, answer[4][0])) for answer in answers}
    except ValueError:
        raise CalendarTransportError("CALENDAR_TARGET_BLOCKED") from None
    if not addresses:
        raise CalendarTransportError("CALENDAR_UNREACHABLE")
    allowed_private = origin.hostname in private_hosts
    for address in addresses:
        if _is_public(address):
            continue
        # The Self-Hosted operator allowlist admits private LAN servers, never
        # loopback, link-local or unspecified addresses of this host itself.
        # Private and shared ranges (e.g. a VPN overlay) stay possible for it.
        if not (
            allowed_private
            and not address.is_multicast
            and not address.is_loopback
            and not address.is_link_local
            and not address.is_unspecified
        ):
            raise CalendarTransportError("CALENDAR_TARGET_BLOCKED")
    return str(sorted(addresses, key=str)[0])


class _PinnedConnection(http.client.HTTPSConnection):
    def __init__(self, origin: Origin, address: str, deadline: float) -> None:
        self._context = ssl.create_default_context()
        super().__init__(
            origin.hostname, origin.port, timeout=_remaining(deadline), context=self._context
        )
        self._address = address
        self._deadline = deadline
        self._stream: socket.socket | None = None

    def connect(self) -> None:
        family = socket.AF_INET6 if ":" in self._address else socket.AF_INET
        raw = socket.socket(family, socket.SOCK_STREAM)
        self._stream = raw
        try:
            raw.settimeout(_remaining(self._deadline))
            target = (
                (self._address, self.port, 0, 0)
                if family == socket.AF_INET6
                else (self._address, self.port)
            )
            raw.connect(target)
            secure = self._context.wrap_socket(
                raw, server_hostname=self.host, do_handshake_on_connect=False
            )
            self.sock = secure
            self._stream = secure
            secure.settimeout(_remaining(self._deadline))
            secure.do_handshake()
        except ssl.SSLError:
            self.abort()
            raise CalendarTransportError("CALENDAR_TLS_INVALID") from None
        except Exception:
            self.abort()
            raw.close()
            raise

    def abort(self) -> None:
        stream = self._stream
        if stream is not None:
            with suppress(OSError):
                stream.shutdown(socket.SHUT_RDWR)
            stream.close()


class CalendarHttp:
    """One user-configured calendar origin with fixed authentication."""

    def __init__(
        self,
        origin: Origin,
        authorization: str,
        *,
        private_hosts: frozenset[str] = frozenset(),
    ) -> None:
        if not authorization.isascii() or "\r" in authorization or "\n" in authorization:
            raise CalendarTransportError("CALENDAR_CONFIGURATION_INVALID")
        self.origin = origin
        self._authorization = authorization
        self._private_hosts = private_hosts

    def __repr__(self) -> str:
        return f"CalendarHttp({self.origin.hostname})"

    def request(
        self,
        method: str,
        path: str,
        *,
        deadline: float,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
        limit: int = MAX_RESPONSE_BYTES,
    ) -> HttpResponse:
        if not path.startswith("/") or any(c in path for c in "\r\n "):
            raise CalendarTransportError("CALENDAR_ADDRESS_INVALID")
        address = _resolve(self.origin, deadline, self._private_hosts)
        connection = _PinnedConnection(self.origin, address, deadline)
        watchdog = threading.Timer(_remaining(deadline), connection.abort)
        watchdog.daemon = True
        watchdog.start()
        try:
            connection.request(
                method,
                path,
                body=body,
                headers={
                    **(headers or {}),
                    "Authorization": self._authorization,
                    "Accept-Encoding": "identity",
                    "User-Agent": "eimir-calendar/1",
                },
            )
            with connection.getresponse() as response:
                _remaining(deadline)
                if response.status == 429 or response.status == 503:
                    retry = response.getheader("Retry-After")
                    if response.status == 429 or retry is not None:
                        raise CalendarRateLimitedError(_retry_after(retry))
                encoding = response.getheader("Content-Encoding", "identity").lower().strip()
                if encoding != "identity":
                    raise CalendarTransportError("CALENDAR_RESPONSE_INVALID")
                length = response.getheader("Content-Length")
                if length is not None and (
                    not length.isascii() or not length.isdecimal() or int(length) > limit
                ):
                    raise CalendarTransportError("CALENDAR_RESPONSE_INVALID")
                content = bytearray()
                while True:
                    _remaining(deadline)
                    chunk = response.read1(min(_READ_CHUNK_BYTES, limit + 1 - len(content)))
                    if not chunk:
                        break
                    content.extend(chunk)
                    if len(content) > limit:
                        raise CalendarTransportError("CALENDAR_RESPONSE_INVALID")
                return HttpResponse(
                    response.status,
                    {key.lower(): value for key, value in response.getheaders()},
                    bytes(content),
                )
        except CalendarTransportError:
            raise
        except (OSError, http.client.HTTPException):
            if time.monotonic() >= deadline:
                raise CalendarTransportError("CALENDAR_TIMEOUT") from None
            raise CalendarTransportError("CALENDAR_UNREACHABLE") from None
        finally:
            watchdog.cancel()
            connection.abort()
            connection.close()
