"""Internal selected-photo transport; deliberately not registered or configured.

An API key grants operations, not per-photo consent. A future caller must own the
Account/Space connection, selection and production gates before using this reader.
Only public HTTPS instances are supported; no library browsing or sync is provided.
"""

from __future__ import annotations

import http.client
import ipaddress
import json
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
from uuid import UUID

from pydantic import SecretStr

from eimir.attachments.limits import IMAGE_MAX_SIZE, supported_mime_types

_HOSTNAME = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")
_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}
_MAX_JSON_BYTES = 256 * 1024
_READ_CHUNK_BYTES = 64 * 1024
_TOTAL_SECONDS = 30.0
_DNS_SECONDS = 5.0
# A timed-out system resolver cannot be killed safely. Bound its concurrency and
# reject new work while both workers remain occupied instead of growing a queue.
_DNS_WORKERS = ThreadPoolExecutor(max_workers=2, thread_name_prefix="immich-dns")
_DNS_SLOTS = threading.BoundedSemaphore(2)


class ImmichPhotoError(ValueError):
    """Fixed internal codes only; upstream exceptions and data are never quoted."""


@dataclass(frozen=True)
class SelectedPhoto:
    content: bytes = field(repr=False)
    mime_type: str
    filename: str


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ImmichPhotoError("PHOTO_SOURCE_TIMEOUT")
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
        raise ImmichPhotoError("PHOTO_SOURCE_CONFIGURATION_INVALID")
    return hostname


def _resolve_public_address(hostname: str, deadline: float) -> str:
    slots = _DNS_SLOTS
    if not slots.acquire(blocking=False):
        raise ImmichPhotoError("PHOTO_SOURCE_UNAVAILABLE")
    try:
        future = _DNS_WORKERS.submit(socket.getaddrinfo, hostname, 443, 0, socket.SOCK_STREAM)
    except RuntimeError:
        slots.release()
        raise ImmichPhotoError("PHOTO_SOURCE_UNAVAILABLE") from None
    future.add_done_callback(lambda _: slots.release())
    try:
        answers = future.result(timeout=min(_DNS_SECONDS, _remaining(deadline)))
    except TimeoutError:
        future.cancel()
        raise ImmichPhotoError("PHOTO_SOURCE_TIMEOUT") from None
    except OSError:
        raise ImmichPhotoError("PHOTO_SOURCE_UNAVAILABLE") from None
    try:
        addresses = {ipaddress.ip_address(cast(str, answer[4][0])) for answer in answers}
    except ValueError:
        raise ImmichPhotoError("PHOTO_SOURCE_TARGET_BLOCKED") from None
    if not addresses or any(not _is_public(address) for address in addresses):
        raise ImmichPhotoError("PHOTO_SOURCE_TARGET_BLOCKED")
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


class ImmichSelectedPhotoReader:
    """One explicitly selected image at a time; volatile credentials and bytes."""

    def __init__(self, origin: str, api_key: SecretStr) -> None:
        self._hostname = _hostname(origin)
        value = api_key.get_secret_value()
        if not 1 <= len(value) <= 1024 or any(not 33 <= ord(char) <= 126 for char in value):
            raise ImmichPhotoError("PHOTO_SOURCE_CONFIGURATION_INVALID")
        self._api_key = api_key

    def __repr__(self) -> str:
        return "ImmichSelectedPhotoReader()"

    def _get(self, path: str, *, limit: int, mime_types: set[str], deadline: float) -> bytes:
        address = _resolve_public_address(self._hostname, deadline)
        connection = _PinnedHTTPSConnection(self._hostname, address, deadline)
        watchdog = threading.Timer(_remaining(deadline), connection.abort)
        watchdog.daemon = True
        watchdog.start()
        try:
            connection.request(
                "GET",
                path,
                headers={
                    "x-api-key": self._api_key.get_secret_value(),
                    "Accept": ", ".join(sorted(mime_types)),
                    "Accept-Encoding": "identity",
                },
            )
            with connection.getresponse() as response:
                _remaining(deadline)
                if response.status != 200:
                    raise ImmichPhotoError("PHOTO_SOURCE_REJECTED")
                encoding = response.getheader("Content-Encoding", "identity").lower().strip()
                mime = response.getheader("Content-Type", "").split(";", 1)[0].lower().strip()
                if encoding != "identity" or mime not in mime_types:
                    raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
                length = response.getheader("Content-Length")
                transfer = response.getheader("Transfer-Encoding")
                if transfer is not None and (transfer.lower() != "chunked" or length is not None):
                    raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
                if length is not None and (
                    not length.isascii() or not length.isdecimal() or len(length) > 12
                ):
                    raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
                if length is not None and int(length) > limit:
                    raise ImmichPhotoError("PHOTO_SOURCE_TOO_LARGE")
                content = bytearray()
                while True:
                    _remaining(deadline)
                    chunk = response.read1(min(_READ_CHUNK_BYTES, limit + 1 - len(content)))
                    if not chunk:
                        break
                    content.extend(chunk)
                    if len(content) > limit:
                        raise ImmichPhotoError("PHOTO_SOURCE_TOO_LARGE")
                _remaining(deadline)
                if not content or (length is not None and len(content) != int(length)):
                    raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
                return bytes(content)
        except ImmichPhotoError:
            raise
        except (OSError, http.client.HTTPException):
            if time.monotonic() >= deadline:
                raise ImmichPhotoError("PHOTO_SOURCE_TIMEOUT") from None
            raise ImmichPhotoError("PHOTO_SOURCE_UNAVAILABLE") from None
        finally:
            watchdog.cancel()
            connection.abort()
            connection.close()

    def read_selected_photo(self, selected_id: str) -> SelectedPhoto:
        try:
            if str(UUID(selected_id)) != selected_id:
                raise ValueError
        except (ValueError, AttributeError, TypeError):
            raise ImmichPhotoError("PHOTO_SOURCE_SELECTION_INVALID") from None
        deadline = time.monotonic() + _TOTAL_SECONDS
        path = f"/api/assets/{selected_id}"
        raw = self._get(
            path, limit=_MAX_JSON_BYTES, mime_types={"application/json"}, deadline=deadline
        )
        try:
            metadata = json.loads(raw)
        except (ValueError, RecursionError):
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID") from None
        if not isinstance(metadata, dict) or metadata.get("id") != selected_id:
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
        mime = metadata.get("originalMimeType")
        if (
            metadata.get("type") != "IMAGE"
            or metadata.get("isOffline") is not False
            or metadata.get("isTrashed") is not False
            or not isinstance(mime, str)
            or mime not in _EXTENSIONS
            or mime not in supported_mime_types()
        ):
            raise ImmichPhotoError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
        content = self._get(
            path + "/original",
            limit=IMAGE_MAX_SIZE,
            mime_types={mime, "application/octet-stream"},
            deadline=deadline,
        )
        # Foreign filenames, paths and metadata deliberately do not cross this
        # boundary. eimir.'s normal attachment pipeline must still inspect bytes.
        return SelectedPhoto(content, mime, f"imported-photo.{_EXTENSIONS[mime]}")
