"""Immich's account-owned, explicit still-photo selection adapter."""

from __future__ import annotations

import json
import time
from typing import Any
from uuid import UUID

from pydantic import SecretStr

from eimir.attachments.limits import IMAGE_MAX_SIZE, supported_mime_types
from eimir.providers.photo_transport import PhotoSourceError as ImmichPhotoError
from eimir.providers.photo_transport import PhotoSourceHttp
from eimir.providers.photo_transport import SelectedPhoto as SelectedPhoto

_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}
_MAX_JSON_BYTES = 256 * 1024
_TOTAL_SECONDS = 30.0


class ImmichSelectedPhotoReader:
    """One explicitly selected image at a time; volatile credentials and bytes."""

    def __init__(self, origin: str, api_key: SecretStr) -> None:
        self._transport = PhotoSourceHttp(origin, {"x-api-key": api_key})
        value = api_key.get_secret_value()
        if not 1 <= len(value) <= 1024 or any(not 33 <= ord(char) <= 126 for char in value):
            raise ImmichPhotoError("PHOTO_SOURCE_CONFIGURATION_INVALID")
        self._api_key = api_key

    def __repr__(self) -> str:
        return "ImmichSelectedPhotoReader()"

    def _get(self, path: str, *, limit: int, mime_types: set[str], deadline: float) -> bytes:
        return self._transport.request(
            "GET", path, limit=limit, mime_types=mime_types, deadline=deadline
        )

    def read_selected_photo(
        self, selected_id: str, *, expected_owner: str | None = None
    ) -> SelectedPhoto:
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
        if expected_owner is not None and metadata.get("ownerId") != expected_owner:
            raise ImmichPhotoError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
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

    def verify_account(self, expected_owner: str, *, deadline: float | None = None) -> None:
        raw = self._get(
            "/api/users/me",
            limit=_MAX_JSON_BYTES,
            mime_types={"application/json"},
            deadline=deadline if deadline is not None else time.monotonic() + _TOTAL_SECONDS,
        )
        if self._json(raw).get("id") != expected_owner:
            raise ImmichPhotoError("PHOTO_SOURCE_ACCOUNT_MISMATCH")

    def account_id(self) -> UUID:
        value = self._json(
            self._get(
                "/api/users/me",
                limit=_MAX_JSON_BYTES,
                mime_types={"application/json"},
                deadline=time.monotonic() + _TOTAL_SECONDS,
            )
        )
        try:
            identifier = value.get("id")
            if not isinstance(identifier, str):
                raise ValueError
            account = UUID(identifier)
            if str(account) != identifier:
                raise ValueError
            return account
        except ValueError:
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID") from None

    @staticmethod
    def _json(raw: bytes) -> dict[str, Any]:
        try:
            value = json.loads(raw)
        except (ValueError, RecursionError):
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID") from None
        if not isinstance(value, dict):
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
        return value

    def list_photos(
        self, expected_owner: str, page: int
    ) -> tuple[list[tuple[str, str]], int | None]:
        if not 1 <= page <= 20:
            raise ImmichPhotoError("PHOTO_SOURCE_SELECTION_INVALID")
        deadline = time.monotonic() + _TOTAL_SECONDS
        self.verify_account(expected_owner, deadline=deadline)
        raw = self._transport.request(
            "POST",
            "/api/search/metadata",
            limit=_MAX_JSON_BYTES,
            mime_types={"application/json"},
            deadline=deadline,
            body=json.dumps(
                {
                    "type": "IMAGE",
                    "visibility": "timeline",
                    "size": 30,
                    "page": page,
                    "order": "desc",
                }
            ).encode(),
        )
        assets = self._json(raw).get("assets")
        if not isinstance(assets, dict) or not isinstance(assets.get("items"), list):
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
        if len(assets["items"]) > 30:
            raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
        items: list[tuple[str, str]] = []
        for item in assets["items"]:
            if not isinstance(item, dict):
                raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID")
            identifier, mime = item.get("id"), item.get("originalMimeType")
            if item.get("ownerId") != expected_owner:
                continue  # A partner/shared library is never an account's own selection.
            if (
                item.get("type") != "IMAGE"
                or item.get("isTrashed") is not False
                or item.get("isOffline") is not False
                or not isinstance(mime, str)
                or mime not in _EXTENSIONS
            ):
                continue
            try:
                if not isinstance(identifier, str) or str(UUID(identifier)) != identifier:
                    raise ValueError
            except ValueError:
                raise ImmichPhotoError("PHOTO_SOURCE_RESPONSE_INVALID") from None
            items.append((identifier, mime))
        following = assets.get("nextPage")
        next_page = page + 1 if following == str(page + 1) and page < 20 else None
        return items, next_page

    def thumbnail(self, selected_id: str, expected_owner: str) -> SelectedPhoto:
        # Check owner before fetching a selected image's thumbnail; no metadata URL is used.
        deadline = time.monotonic() + _TOTAL_SECONDS
        metadata = self._json(
            self._get(
                f"/api/assets/{UUID(selected_id)}",
                limit=_MAX_JSON_BYTES,
                mime_types={"application/json"},
                deadline=deadline,
            )
        )
        if metadata.get("ownerId") != expected_owner or metadata.get("id") != selected_id:
            raise ImmichPhotoError("PHOTO_SOURCE_IMAGE_UNAVAILABLE")
        response = self._transport.response(
            "GET",
            f"/api/assets/{selected_id}/thumbnail?size=thumbnail",
            limit=2 * 1024 * 1024,
            mime_types={"image/jpeg", "image/webp"},
            deadline=deadline,
        )

        extension = "webp" if response.mime_type == "image/webp" else "jpg"
        return SelectedPhoto(response.content, response.mime_type, "preview." + extension)
