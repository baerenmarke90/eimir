"""Media storage.

Configuration selects the active adapter, not the domain. The domain sees
only `MediaStore`.
"""

from __future__ import annotations

from functools import lru_cache

from eimir.config import MediaStoreBackend, Settings, get_settings
from eimir.media.base import (
    ByteSource,
    MediaStore,
    StoredObject,
    build_account_storage_key,
    build_storage_key,
)
from eimir.media.encrypted import EncryptingMediaStore
from eimir.media.local import LocalMediaStore
from eimir.media.presigned import (
    SignedUpload,
    create_signed_upload,
    supports_signed_upload,
)
from eimir.media.s3 import S3MediaStore
from eimir.security.runtime import get_key_ring

__all__ = [
    "ByteSource",
    "EncryptingMediaStore",
    "LocalMediaStore",
    "MediaStore",
    "S3MediaStore",
    "SignedUpload",
    "StoredObject",
    "build_account_storage_key",
    "build_plain_media_store",
    "build_storage_key",
    "create_signed_upload",
    "get_media_store",
    "supports_signed_upload",
]


def _s3_store(settings: Settings) -> MediaStore:
    if settings.s3_access_key_id is None or settings.s3_secret_access_key is None:
        # Settings already validates this. The defensive check keeps the
        # factory type-safe and failure-safe when used in isolation.
        raise RuntimeError("S3 media credentials are missing.")
    return S3MediaStore(
        endpoint=settings.s3_endpoint,
        region=settings.s3_region,
        bucket=settings.s3_bucket,
        access_key_id=settings.s3_access_key_id.get_secret_value(),
        secret_access_key=settings.s3_secret_access_key.get_secret_value(),
        session_token=(
            settings.s3_session_token.get_secret_value()
            if settings.s3_session_token is not None
            else None
        ),
    )


def _with_encryption(store: MediaStore, settings: Settings) -> MediaStore:
    """Wrap the adapter so provider-visible bytes are ciphertext (issue #797).

    With encryption disabled the adapter is returned unchanged and keeps its
    presigned transport. With encryption on, the wrapper removes presigned
    upload and read so plaintext never bypasses the application.
    """
    mode = settings.encryption_mode
    if not mode.encrypts_writes:
        return store
    ring = get_key_ring()
    if ring is None:
        raise RuntimeError("Encryption is enabled but no key ring is available.")
    return EncryptingMediaStore(store, ring, mode)


def build_plain_media_store(settings: Settings) -> MediaStore:
    """The adapter without encryption, for migration tooling that must see raw objects."""
    if settings.media_store is MediaStoreBackend.LOCAL:
        return LocalMediaStore(settings.media_root)
    return _s3_store(settings)


@lru_cache(maxsize=1)
def get_media_store() -> MediaStore:
    """Return configured storage without exposing S3 knowledge to domain code."""
    settings = get_settings()
    return _with_encryption(build_plain_media_store(settings), settings)
