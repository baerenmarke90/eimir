"""Selected-only Google transfer and response/credential boundaries."""

import json
from datetime import UTC, datetime, timedelta
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


@pytest.mark.parametrize(
    "config",
    [
        None,
        [],
        {},
        {"pollInterval": "NaNs", "timeoutIn": "10s"},
        {"pollInterval": "0s", "timeoutIn": "10s"},
        {"pollInterval": "5s", "timeoutIn": "-1s"},
        {"pollInterval": "5s", "timeoutIn": 5},
        {"pollInterval": "999999999999999999999s", "timeoutIn": "10s"},
    ],
)
def test_malformed_polling_cannot_become_an_early_poll_or_unbounded_timer(config):
    instant = datetime(2026, 11, 5, tzinfo=UTC)
    with pytest.raises(PhotoSourceError, match="PHOTO_SOURCE_RESPONSE_INVALID"):
        google.session_timing(
            {"pollingConfig": config}, at=instant, expires_at=instant + timedelta(minutes=10)
        )


def test_provider_expiry_can_only_shorten_local_and_previous_poll_deadlines():
    instant = datetime(2026, 11, 5, tzinfo=UTC)
    timing = google.session_timing(
        {
            "pollingConfig": {"pollInterval": "90.5s", "timeoutIn": "600s"},
            "expireTime": (instant + timedelta(seconds=120)).isoformat(),
        },
        at=instant,
        expires_at=instant + timedelta(minutes=10),
        poll_deadline=instant + timedelta(seconds=60),
    )
    assert timing.interval == timedelta(seconds=90.5)
    assert timing.expires_at == instant + timedelta(seconds=120)
    assert timing.poll_deadline == instant + timedelta(seconds=60)


@pytest.mark.parametrize(
    "expiry", ["tomorrow", "2026-11-05T00:00:00", "9999-12-31T23:00:00-12:00", False]
)
def test_provider_expiry_is_an_aware_timestamp(expiry):
    instant = datetime(2026, 11, 5, tzinfo=UTC)
    with pytest.raises(PhotoSourceError):
        google.session_timing(
            {"pollingConfig": {"pollInterval": "5s", "timeoutIn": "10s"}, "expireTime": expiry},
            at=instant,
            expires_at=instant + timedelta(minutes=10),
        )
