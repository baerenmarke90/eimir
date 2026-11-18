"""Text-only link previews never execute or follow untrusted page metadata."""

import socket
import time
from unittest.mock import Mock

import pytest

from eimir.providers import link_preview as preview
from eimir.providers import photo_transport


def test_extracts_bounded_open_graph_text_without_following_images_or_canonical(monkeypatch):
    transport = Mock()
    transport.request.return_value = b"""<html><head><title>Fallback</title>
      <meta property="og:title" content="A park &amp; a picnic">
      <meta property="og:description" content="Bring a blanket.">
      <meta property="og:image" content="http://127.0.0.1/private">
      <link rel="canonical" href="http://localhost/secret">
      </head><body><meta property="og:title" content="Ignored">
      <script>fetch('https://tracker.example')</script></body></html>"""
    factory = Mock(return_value=transport)
    monkeypatch.setattr(preview, "PhotoSourceHttp", factory)
    result = preview.resolve_link_metadata("https://example.org/park?q=picnic#photos")
    assert result == preview.LinkMetadata("A park & a picnic", "Bring a blanket.")
    factory.assert_called_once_with("https://example.org", {})
    transport.request.assert_called_once()
    args, kwargs = transport.request.call_args
    assert args == ("GET", "/park?q=picnic")
    assert kwargs["limit"] == 512 * 1024
    assert 0 < kwargs["deadline"] - time.monotonic() <= 6


def test_falls_back_to_title_and_description_and_keeps_markup_inert(monkeypatch):
    transport = Mock()
    transport.request.return_value = (
        b'<title> An\n afternoon </title><meta name="description" '
        b'content="&lt;img src=x onerror=alert(1)&gt;">'
    )
    monkeypatch.setattr(preview, "PhotoSourceHttp", Mock(return_value=transport))
    result = preview.resolve_link_metadata("https://example.org/caf\u00e9")
    assert result == preview.LinkMetadata("An afternoon", "<img src=x onerror=alert(1)>")
    assert transport.request.call_args.args == ("GET", "/caf%C3%A9")


@pytest.mark.parametrize(
    "url",
    [
        "http://example.org/",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://user:password@example.org/",
        "https://example.org:8443/",
        "https://example.org/\nHeader:value",
        "https://example.org/" + "a" * 2048,
        "https://localhost/",
        "https://[::1]/",
    ],
)
def test_invalid_or_unsupported_targets_make_no_request(monkeypatch, url):
    request = Mock()
    monkeypatch.setattr(preview.PhotoSourceHttp, "request", request)
    assert preview.resolve_link_metadata(url) is None
    request.assert_not_called()


@pytest.mark.parametrize("addresses", [["127.0.0.1"], ["169.254.169.254"], ["8.8.8.8", "10.0.0.1"]])
def test_preview_reuses_private_and_mixed_dns_rejection_before_connect(monkeypatch, addresses):
    monkeypatch.setattr(
        photo_transport.socket,
        "getaddrinfo",
        lambda *args: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)) for address in addresses
        ],
    )
    connection = Mock()
    monkeypatch.setattr(photo_transport, "_PinnedHTTPSConnection", connection)
    assert preview.resolve_link_metadata("https://example.org/") is None
    connection.assert_not_called()


@pytest.mark.parametrize(
    "code",
    [
        "PHOTO_SOURCE_REJECTED",
        "PHOTO_SOURCE_TOO_LARGE",
        "PHOTO_SOURCE_TIMEOUT",
        "PHOTO_SOURCE_RESPONSE_INVALID",
    ],
)
def test_redirects_non_html_oversize_and_timeouts_leave_a_usable_link_fallback(monkeypatch, code):
    transport = Mock()
    transport.request.side_effect = photo_transport.PhotoSourceError(code)
    monkeypatch.setattr(preview, "PhotoSourceHttp", Mock(return_value=transport))
    assert preview.resolve_link_metadata("https://example.org/") is None


def test_metadata_uses_bounded_plain_text_without_control_characters():
    parser = preview._MetadataParser()
    parser.feed(
        "<title>" + "x" * 250 + '</title><meta name="description" content="' + "y" * 500 + '">'
    )
    result = parser.result()
    assert len(result.title) == 200
    assert len(result.description) == 360
    assert preview._text("a\u202eb\n c\x00", 50) == "ab c"


def test_empty_or_body_only_pages_offer_no_metadata(monkeypatch):
    transport = Mock()
    transport.request.return_value = (
        b'<body><script>alert(1)</script><meta name="description" content="Ignored">'
    )
    monkeypatch.setattr(preview, "PhotoSourceHttp", Mock(return_value=transport))
    assert preview.resolve_link_metadata("https://example.org/") is None
