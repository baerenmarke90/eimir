"""Official Google Photos Picker, limited to a single consented selection."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any
from urllib.parse import quote, urlencode, urlsplit

from pydantic import SecretStr

from eimir.attachments.limits import IMAGE_MAX_SIZE, supported_mime_types
from eimir.config import get_settings
from eimir.providers.photo_transport import PhotoSourceError, PhotoSourceHttp, SelectedPhoto

SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
CALLBACK_PATH = "/api/v1/photo-sources/google/callback"
_JSON_LIMIT = 128 * 1024

# This SDK otherwise emits raw token responses at DEBUG. Provider material is
# never diagnostic content, including when the operator enables debug logging.
logging.getLogger("requests_oauthlib.oauth2_session").setLevel(logging.CRITICAL + 1)


def _flow(*, state: str | None = None, verifier: str | None = None) -> Any:
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    settings = get_settings()
    secret = settings.google_photos_client_secret
    if not settings.google_photos_client_id or not secret:
        raise PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE")
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_photos_client_id,
                "client_secret": secret.get_secret_value(),
                "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=[SCOPE],
        state=state,
        code_verifier=verifier,
        autogenerate_code_verifier=verifier is None,
    )
    flow.redirect_uri = settings.public_base_url.rstrip("/") + CALLBACK_PATH
    flow.oauth2session.trust_env = False
    return flow


def authorization() -> tuple[str, str, str]:
    flow = _flow()
    url, state = flow.authorization_url(access_type="online", prompt="select_account")
    return str(url), str(state), str(flow.code_verifier)


def exchange(code: str, state: str, verifier: str) -> str:
    flow = _flow(state=state, verifier=verifier)
    deadline = time.monotonic() + 25

    def bounded(response: Any, **_: Any) -> Any:
        content = bytearray()
        try:
            for chunk in response.iter_content(chunk_size=4096):
                content.extend(chunk)
                if len(content) > 64 * 1024 or time.monotonic() > deadline:
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
            response._content = bytes(content)
            response._content_consumed = True
            return response
        finally:
            response.close()

    flow.oauth2session.hooks["response"] = [bounded]
    try:
        flow.fetch_token(code=code, timeout=(5, 5), allow_redirects=False, stream=True)
        token = flow.credentials.token
    except Exception:
        # OAuth exceptions can quote codes, tokens and provider response text.
        raise PhotoSourceError("PHOTO_SOURCE_AUTHORIZATION_FAILED") from None
    finally:
        flow.oauth2session.close()
    if not isinstance(token, str) or not token:
        raise PhotoSourceError("PHOTO_SOURCE_AUTHORIZATION_FAILED")
    return token


def picker_uri(value: object) -> str:
    try:
        parsed = urlsplit(value) if isinstance(value, str) else None
        if (
            parsed is None
            or parsed.scheme != "https"
            or parsed.hostname != "photos.google.com"
            or parsed.port is not None
            or parsed.username
            or parsed.password
            or parsed.fragment
            or "\\" in str(value)
            or any(ord(c) < 33 for c in str(value))
        ):
            raise ValueError
    except ValueError:
        raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID") from None
    return str(value)


class GooglePhotoPicker:
    def __init__(self, token: str) -> None:
        self._transport = PhotoSourceHttp(
            "https://photospicker.googleapis.com", {"Authorization": SecretStr(f"Bearer {token}")}
        )
        self._token = SecretStr(token)

    def _json(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        raw = self._transport.request(
            method,
            path,
            limit=_JSON_LIMIT,
            mime_types={"application/json"},
            deadline=time.monotonic() + 30,
            body=json.dumps(body).encode() if body is not None else None,
            statuses=frozenset({200, 204}),
        )
        try:
            value = json.loads(raw) if raw else {}
        except (ValueError, RecursionError):
            raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID") from None
        if not isinstance(value, dict):
            raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
        return value

    def create(self, count: int) -> dict[str, Any]:
        value = self._json("POST", "/v1/sessions", {"pickingConfig": {"maxItemCount": str(count)}})
        picker_uri(value.get("pickerUri"))
        if not isinstance(value.get("id"), str) or len(value["id"]) > 1024:
            raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
        return value

    def poll(self, identifier: str) -> dict[str, Any]:
        return self._json("GET", "/v1/sessions/" + quote(identifier, safe=""))

    def items(self, identifier: str, maximum: int) -> list[tuple[str, str, str]]:
        result: list[tuple[str, str, str]] = []
        page: str | None = None
        for _ in range(3):
            query = {"sessionId": identifier, "pageSize": "100"}
            if page:
                query["pageToken"] = page
            value = self._json("GET", "/v1/mediaItems?" + urlencode(query))
            items = value.get("mediaItems", [])
            if not isinstance(items, list) or len(items) > maximum:
                raise PhotoSourceError("PHOTO_SOURCE_SELECTION_INVALID")
            for item in items:
                if not isinstance(item, dict) or item.get("type") != "PHOTO":
                    raise PhotoSourceError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
                media = item.get("mediaFile")
                if (
                    not isinstance(media, dict)
                    or media.get("mimeType") not in supported_mime_types()
                ):
                    raise PhotoSourceError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
                source_id, url = item.get("id"), media.get("baseUrl")
                if not isinstance(source_id, str) or not isinstance(url, str) or len(url) > 8192:
                    raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
                self._media_url(url)
                result.append((source_id, media["mimeType"], url))
            if len(result) > maximum:
                raise PhotoSourceError("PHOTO_SOURCE_SELECTION_INVALID")
            page = value.get("nextPageToken")
            if not page:
                return result
            if not isinstance(page, str) or len(page) > 4096:
                break
        raise PhotoSourceError("PHOTO_SOURCE_SELECTION_INVALID")

    @staticmethod
    def _media_url(value: str) -> tuple[str, str]:
        if not value.isascii() or not re.fullmatch(
            r"https://lh[0-9]+\.googleusercontent\.com/[^?#\s\\]+", value
        ):
            raise PhotoSourceError("PHOTO_SOURCE_RESPONSE_INVALID")
        parsed = urlsplit(value)
        return f"https://{parsed.hostname}", parsed.path

    def read(self, value: str, mime: str) -> SelectedPhoto:
        origin, path = self._media_url(value)
        content = PhotoSourceHttp(
            origin, {"Authorization": SecretStr("Bearer " + self._token.get_secret_value())}
        ).request(
            "GET",
            path + "=d",
            limit=IMAGE_MAX_SIZE,
            mime_types={mime, "application/octet-stream"},
            deadline=time.monotonic() + 30,
        )
        extension = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/heic": "heic",
            "image/heif": "heif",
        }.get(mime)
        if extension is None:
            raise PhotoSourceError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
        return SelectedPhoto(content, mime, "imported-photo." + extension)

    def delete(self, identifier: str) -> None:
        self._json("DELETE", "/v1/sessions/" + quote(identifier, safe=""))
