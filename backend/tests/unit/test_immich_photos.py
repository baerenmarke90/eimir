"""Selected-only Immich reads, real HTTP parsing and pinned public HTTPS sockets."""

from __future__ import annotations

import io
import json
import socket
import ssl
import threading
import time
from concurrent.futures import Future
from typing import Any
from unittest.mock import Mock

import pytest
from pydantic import SecretStr

from eimir.providers import immich_photos as photos

ORIGIN = "https://photos.example.org"
ASSET = "5f2e03cf-ce5a-4b96-bb04-c944d203224b"
KEY = "private-provider-test-key"


def metadata(**changes: object) -> bytes:
    return json.dumps(
        {
            "id": ASSET,
            "type": "IMAGE",
            "originalMimeType": "image/jpeg",
            "isOffline": False,
            "isTrashed": False,
            "originalFileName": "private-family-name.jpg",
            "originalPath": "/private/library/photo.jpg",
            **changes,
        }
    ).encode()


def http_response(
    body: bytes,
    *,
    mime: str = "application/json",
    status: int = 200,
    headers: dict[str, str] | None = None,
    length: bool = True,
) -> bytes:
    values = {"Content-Type": mime, **({"Content-Length": str(len(body))} if length else {})}
    values.update(headers or {})
    return (
        f"HTTP/1.1 {status} Test\r\n"
        + "".join(f"{key}: {value}\r\n" for key, value in values.items())
        + "\r\n"
    ).encode() + body


class FakeSocket:
    def __init__(self, response: bytes) -> None:
        self.response = response
        self.sent = bytearray()
        self.target: object = None
        self.timeout: float | None = None
        self.closed = False
        self.stopped = threading.Event()

    def settimeout(self, value: float) -> None:
        self.timeout = value

    def connect(self, target: object) -> None:
        self.target = target

    def sendall(self, value: bytes) -> None:
        self.sent.extend(value)

    def makefile(self, *_: object) -> io.BytesIO:
        return io.BytesIO(self.response)

    def do_handshake(self) -> None:
        pass

    def shutdown(self, _: object) -> None:
        self.stopped.set()

    def close(self) -> None:
        self.closed = True


def setup_transport(
    monkeypatch: pytest.MonkeyPatch, responses: list[bytes]
) -> tuple[list[FakeSocket], Mock, Mock, Mock]:
    sockets = [FakeSocket(value) for value in responses]
    factory = Mock(side_effect=sockets)
    lookup = Mock(return_value=[(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("8.8.8.8", 443))])
    context = Mock()
    context.wrap_socket.side_effect = lambda stream, **_: stream
    monkeypatch.setattr(photos.socket, "socket", factory)
    monkeypatch.setattr(photos.socket, "getaddrinfo", lookup)
    monkeypatch.setattr(photos.ssl, "create_default_context", Mock(return_value=context))
    return sockets, factory, lookup, context


def reader() -> photos.ImmichSelectedPhotoReader:
    return photos.ImmichSelectedPhotoReader(ORIGIN, SecretStr(KEY))


def test_reads_only_selected_id_with_header_secret_and_actual_pinned_socket(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sockets, factory, lookup, context = setup_transport(
        monkeypatch,
        [http_response(metadata()), http_response(b"selected-image", mime="image/jpeg")],
    )
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
    photo = reader().read_selected_photo(ASSET)
    assert photo.content == b"selected-image"
    assert photo.mime_type == "image/jpeg"
    assert photo.filename == "imported-photo.jpg"
    assert "selected-image" not in repr(photo)
    assert KEY not in repr(reader())
    assert "photos.example.org" not in repr(reader())
    assert lookup.call_count == 2  # Fresh DNS validation for each new connection.
    assert all(
        call.args == ("photos.example.org", 443, 0, socket.SOCK_STREAM)
        for call in lookup.call_args_list
    )
    assert factory.call_count == 2
    for index, stream in enumerate(sockets):
        assert stream.target == ("8.8.8.8", 443)
        assert stream.closed
        assert stream.timeout is not None and 0 < stream.timeout <= photos._TOTAL_SECONDS
        request = bytes(stream.sent)
        path = f"/api/assets/{ASSET}" + ("/original" if index else "")
        assert request.startswith(f"GET {path} HTTP/1.1\r\n".encode())
        assert b"Host: photos.example.org\r\n" in request
        assert f"x-api-key: {KEY}\r\n".encode() in request
        assert b"Accept-Encoding: identity\r\n" in request
        assert b"?" not in request
        assert b"private-family-name" not in request
        assert b"/private/library" not in request
    assert all(
        call.kwargs == {"server_hostname": "photos.example.org", "do_handshake_on_connect": False}
        for call in context.wrap_socket.call_args_list
    )


@pytest.mark.parametrize(
    "origin",
    [
        "http://photos.example.org",
        "https://photos.example.org/",
        "https://photos.example.org/api",
        "https://photos.example.org:443",
        "https://user@photos.example.org",
        "https://photos.example.org?key=private",
        "https://photos.example.org#private",
        "https://PHOTOS.example.org",
        "https://photos.example.org.",
        "https://localhost",
        "https://photos.example.org\\evil",
        "https://photos.example.org\n",
        "https://%70hotos.example.org",
        "https://[::1]",
        "https://-bad.example.org",
    ],
)
def test_requires_exact_administrator_https_origin(origin: str) -> None:
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_CONFIGURATION_INVALID"):
        photos.ImmichSelectedPhotoReader(origin, SecretStr(KEY))


@pytest.mark.parametrize("key", ["", "bad\r\nHost: evil", "has space", "é", "x" * 1025])
def test_credentials_cannot_inject_headers(key: str) -> None:
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_CONFIGURATION_INVALID"):
        photos.ImmichSelectedPhotoReader(ORIGIN, SecretStr(key))


@pytest.mark.parametrize(
    "selected",
    [
        ASSET.upper(),
        "../secret",
        "",
        ASSET + "/original",
        "https://evil.test/photo",
        ASSET + "?apiKey=secret",
    ],
)
def test_invalid_selection_never_resolves_or_connects(
    monkeypatch: pytest.MonkeyPatch, selected: str
) -> None:
    _, factory, lookup, _ = setup_transport(monkeypatch, [])
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_SELECTION_INVALID"):
        reader().read_selected_photo(selected)
    lookup.assert_not_called()
    factory.assert_not_called()


@pytest.mark.parametrize(
    "addresses",
    [
        [],
        ["127.0.0.1"],
        ["10.0.0.1"],
        ["169.254.169.254"],
        ["100.64.0.1"],
        ["192.0.2.1"],
        ["::1"],
        ["fe80::1"],
        ["fc00::1"],
        ["ff02::1"],
        ["::ffff:127.0.0.1"],
        ["::ffff:224.0.0.1"],
        ["64:ff9b::7f00:1"],
        ["2002:7f00:1::"],
        ["2001::1"],
        ["2606:4700::1111%eth0"],
        ["8.8.8.8", "10.0.0.1"],
        ["8.8.8.8", "::ffff:169.254.169.254"],
        ["invalid-address"],
    ],
)
def test_rejects_every_nonpublic_or_mixed_dns_answer_before_authentication(
    monkeypatch: pytest.MonkeyPatch, addresses: list[str]
) -> None:
    _, factory, lookup, _ = setup_transport(monkeypatch, [])
    lookup.return_value = [
        (socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 0, "", (ip, 443))
        for ip in addresses
    ]
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TARGET_BLOCKED"):
        reader().read_selected_photo(ASSET)
    factory.assert_not_called()


def test_rebinding_between_metadata_and_download_is_blocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sockets, factory, lookup, _ = setup_transport(monkeypatch, [http_response(metadata())])
    public = lookup.return_value
    lookup.side_effect = [public, [(socket.AF_INET, socket.SOCK_STREAM, 0, "", ("10.0.0.1", 443))]]
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TARGET_BLOCKED"):
        reader().read_selected_photo(ASSET)
    assert factory.call_count == 1
    assert all(b"/original" not in stream.sent for stream in sockets)


def test_ipv6_uses_numeric_socket_and_original_tls_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sockets, factory, lookup, _ = setup_transport(
        monkeypatch,
        [http_response(metadata()), http_response(b"image", mime="application/octet-stream")],
    )
    lookup.return_value = [
        (socket.AF_INET6, socket.SOCK_STREAM, 0, "", ("2606:4700::1111", 443, 0, 0))
    ]
    assert reader().read_selected_photo(ASSET).content == b"image"
    assert all(
        call.args == (socket.AF_INET6, socket.SOCK_STREAM) for call in factory.call_args_list
    )
    assert all(stream.target == ("2606:4700::1111", 443, 0, 0) for stream in sockets)


@pytest.mark.parametrize("status", [301, 302, 307, 308, 401, 403, 404, 429, 500])
def test_redirects_and_remote_failures_never_forward_credentials(
    monkeypatch: pytest.MonkeyPatch, status: int
) -> None:
    _, factory, lookup, _ = setup_transport(
        monkeypatch,
        [
            http_response(
                b"private upstream diagnostic",
                status=status,
                headers={"Location": "https://10.0.0.1/private?token=hidden"},
            )
        ],
    )
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_REJECTED") as failure:
        reader().read_selected_photo(ASSET)
    assert str(failure.value) == "PHOTO_SOURCE_REJECTED"
    assert factory.call_count == lookup.call_count == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"id": "other"},
        {"type": "VIDEO"},
        {"originalMimeType": "image/tiff"},
        {"originalMimeType": None},
        {"isOffline": True},
        {"isOffline": "false"},
        {"isTrashed": True},
        {"isTrashed": None},
    ],
)
def test_unavailable_and_unsupported_metadata_never_downloads_original(
    monkeypatch: pytest.MonkeyPatch, changes: dict[str, object]
) -> None:
    _, factory, _, _ = setup_transport(monkeypatch, [http_response(metadata(**changes))])
    with pytest.raises(photos.ImmichPhotoError):
        reader().read_selected_photo(ASSET)
    assert factory.call_count == 1


@pytest.mark.parametrize("body", [b"[]", b"null", b"not json", b'"private"', b"\xff"])
def test_invalid_json_is_sanitized(monkeypatch: pytest.MonkeyPatch, body: bytes) -> None:
    setup_transport(monkeypatch, [http_response(body)])
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_RESPONSE_INVALID"):
        reader().read_selected_photo(ASSET)


@pytest.mark.parametrize(
    "headers",
    [
        {"Content-Encoding": "gzip"},
        {"Content-Encoding": "br"},
        {"Content-Type": "text/html"},
        {"Content-Length": "-1"},
        {"Content-Length": "not-a-length"},
        {"Content-Length": "9999999999999999999999999999"},
        {"Transfer-Encoding": "gzip"},
        {"Transfer-Encoding": "chunked"},  # Ambiguous alongside Content-Length.
    ],
)
def test_response_encoding_mime_and_lengths_fail_closed(
    monkeypatch: pytest.MonkeyPatch, headers: dict[str, str]
) -> None:
    setup_transport(monkeypatch, [http_response(metadata(), headers=headers)])
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_RESPONSE_INVALID"):
        reader().read_selected_photo(ASSET)


@pytest.mark.parametrize("declared", [True, False])
def test_json_and_original_byte_limits_bound_declared_and_actual_reads(
    monkeypatch: pytest.MonkeyPatch, declared: bool
) -> None:
    monkeypatch.setattr(photos, "_MAX_JSON_BYTES", 2)
    setup_transport(monkeypatch, [http_response(b"xxx", length=declared)])
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TOO_LARGE"):
        reader().read_selected_photo(ASSET)
    monkeypatch.setattr(photos, "_MAX_JSON_BYTES", 256 * 1024)
    monkeypatch.setattr(photos, "IMAGE_MAX_SIZE", 2)
    setup_transport(
        monkeypatch,
        [http_response(metadata()), http_response(b"xxx", mime="image/jpeg", length=declared)],
    )
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TOO_LARGE"):
        reader().read_selected_photo(ASSET)


@pytest.mark.parametrize(
    "body,headers",
    [
        (b"", {}),
        (b"short", {"Content-Length": "12"}),
        (b"image", {"Content-Type": "image/png"}),
        (b"compressed", {"Content-Encoding": "gzip"}),
    ],
)
def test_empty_truncated_wrong_mime_and_encoded_images_are_rejected(
    monkeypatch: pytest.MonkeyPatch, body: bytes, headers: dict[str, str]
) -> None:
    setup_transport(
        monkeypatch,
        [http_response(metadata()), http_response(body, mime="image/jpeg", headers=headers)],
    )
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_RESPONSE_INVALID"):
        reader().read_selected_photo(ASSET)


def test_network_tls_and_dns_errors_do_not_expose_provider_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for error in (OSError("private-url?token=secret"), ssl.SSLError("private certificate detail")):
        _, factory, _, _ = setup_transport(monkeypatch, [])
        factory.side_effect = error
        with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_UNAVAILABLE") as failure:
            reader().read_selected_photo(ASSET)
        assert str(failure.value) == "PHOTO_SOURCE_UNAVAILABLE"
    _, _, lookup, _ = setup_transport(monkeypatch, [])
    lookup.side_effect = socket.gaierror("private-instance-name")
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_UNAVAILABLE"):
        reader().read_selected_photo(ASSET)


def test_dns_wait_is_bounded_without_unbounded_resolver_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    future: Future[Any] = Future()
    monkeypatch.setattr(photos, "_DNS_SECONDS", 0.001)
    monkeypatch.setattr(photos, "_DNS_WORKERS", Mock(submit=Mock(return_value=future)))
    monkeypatch.setattr(photos, "_DNS_SLOTS", threading.BoundedSemaphore(1))
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TIMEOUT"):
        photos._resolve_public_address("photos.example.org", time.monotonic() + 1)
    assert future.cancelled()
    slots = threading.BoundedSemaphore(1)
    slots.acquire()
    monkeypatch.setattr(photos, "_DNS_SLOTS", slots)
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_UNAVAILABLE"):
        photos._resolve_public_address("photos.example.org", time.monotonic() + 1)


def test_watchdog_interrupts_stalled_headers_with_absolute_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sockets, _, _, _ = setup_transport(monkeypatch, [http_response(metadata())])
    stream = sockets[0]

    class StalledHeaders(io.BytesIO):
        def readline(self, size: int = -1) -> bytes:
            assert stream.stopped.wait(timeout=1), "absolute timeout did not shut down the socket"
            return b""

    stream.makefile = lambda *_: StalledHeaders()  # type: ignore[method-assign]
    monkeypatch.setattr(photos, "_TOTAL_SECONDS", 0.02)
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TIMEOUT"):
        reader().read_selected_photo(ASSET)
    assert stream.closed


def test_total_deadline_also_covers_body_trickle(monkeypatch: pytest.MonkeyPatch) -> None:
    setup_transport(monkeypatch, [http_response(metadata())])
    original_read = photos.http.client.HTTPResponse.read1

    def slow_read(self: Any, size: int = -1) -> bytes:
        time.sleep(0.025)
        return original_read(self, size)

    monkeypatch.setattr(photos.http.client.HTTPResponse, "read1", slow_read)
    monkeypatch.setattr(photos, "_TOTAL_SECONDS", 0.01)
    with pytest.raises(photos.ImmichPhotoError, match="PHOTO_SOURCE_TIMEOUT"):
        reader().read_selected_photo(ASSET)
