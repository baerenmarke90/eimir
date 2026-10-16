"""Optional client-transport capability of a MediaStore."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol, runtime_checkable

from eimir.media.base import MediaStore


@dataclass(frozen=True)
class SignedUpload:
    """A short-lived upload capability bound to exactly one object."""

    url: str
    required_headers: dict[str, str]


@runtime_checkable
class SignedUploadMediaStore(Protocol):
    """MediaStore with direct, server-signed client uploads."""

    def create_upload_url(
        self,
        storage_key: str,
        content_type: str,
        expires_in: timedelta,
    ) -> SignedUpload: ...


def supports_signed_upload(store: MediaStore) -> bool:
    return isinstance(store, SignedUploadMediaStore)


def create_signed_upload(
    store: MediaStore,
    storage_key: str,
    content_type: str,
    expires_in: timedelta,
) -> SignedUpload | None:
    if not isinstance(store, SignedUploadMediaStore):
        return None
    return store.create_upload_url(storage_key, content_type, expires_in)
