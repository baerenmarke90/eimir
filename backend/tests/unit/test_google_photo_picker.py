"""Selected-only Google transfer and response/credential boundaries."""

import json
from unittest.mock import Mock

import pytest

from eimir.providers import google_photos as google
from eimir.providers.photo_transport import PhotoSourceError


@pytest.mark.parametrize(
    "uri",
    [
        "http://photos.google.com/x",
        "https://photos.google.com.evil/x",
        "https://user@photos.google.com/x",
        "https://photos.google.com:443/x",
        "https://photos.google.com/x#token",
        "https://photos.google.com/\\evil",
        "https://photos.google.com/x\n",
    ],
)
def test_picker_uri_never_redirects_to_untrusted_target(uri: str) -> None:
    with pytest.raises(PhotoSourceError):
        google.picker_uri(uri)


@pytest.mark.parametrize(
    "url",
    [
        "https://lh3.googleusercontent.com.evil/a",
        "https://lh3.googleusercontent.com/a?token=secret",
        "https://127.0.0.1/a",
        "https://lh3.googleusercontent.com:443/a",
        "https://lh3.googleusercontent.com/a#x",
    ],
)
def test_google_media_urls_reject_credential_forwarding_targets(url: str) -> None:
    with pytest.raises(PhotoSourceError):
        google.GooglePhotoPicker._media_url(url)


def test_selected_supported_photos_use_fixed_api_and_hide_credentials(monkeypatch) -> None:
    transport = Mock()
    transport.request.return_value = json.dumps(
        {
            "mediaItems": [
                {
                    "id": "picked",
                    "type": "PHOTO",
                    "mediaFile": {
                        "mimeType": "image/jpeg",
                        "baseUrl": "https://lh3.googleusercontent.com/selected",
                    },
                }
            ]
        }
    ).encode()
    constructor = Mock(return_value=transport)
    monkeypatch.setattr(google, "PhotoSourceHttp", constructor)
    picker = google.GooglePhotoPicker("synthetic-private-token")
    assert picker.items("private/session", 2) == [
        ("picked", "image/jpeg", "https://lh3.googleusercontent.com/selected")
    ]
    assert transport.request.call_args.args[:2] == (
        "GET",
        "/v1/mediaItems?sessionId=private%2Fsession&pageSize=100",
    )
    assert "synthetic-private-token" not in repr(constructor.call_args)
    transport.request.return_value = b'{"mediaItems":[{"id":"video","type":"VIDEO"}]}'
    with pytest.raises(PhotoSourceError, match="PHOTO_SOURCE_IMAGE_UNAVAILABLE"):
        picker.items("private/session", 2)


def test_page_budget_cannot_expand(monkeypatch) -> None:
    transport = Mock()
    transport.request.return_value = b'{"mediaItems":[],"nextPageToken":"more"}'
    monkeypatch.setattr(google, "PhotoSourceHttp", Mock(return_value=transport))
    with pytest.raises(PhotoSourceError):
        google.GooglePhotoPicker("synthetic-token").items("session", 1)
    assert transport.request.call_count == 3


def test_original_read_is_bounded_and_does_not_return_foreign_filename(monkeypatch) -> None:
    transport = Mock()
    transport.request.return_value = b"synthetic-image"
    monkeypatch.setattr(google, "PhotoSourceHttp", Mock(return_value=transport))
    result = google.GooglePhotoPicker("private-token").read(
        "https://lh3.googleusercontent.com/selected", "image/jpeg"
    )
    assert result.filename == "imported-photo.jpg"
    assert "synthetic-image" not in repr(result)
    assert transport.request.call_args.args == ("GET", "/selected=d")
    assert transport.request.call_args.kwargs["limit"] == 25 * 1024 * 1024
