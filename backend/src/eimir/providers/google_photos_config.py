"""Operator-owned Google Web OAuth configuration, independent of user accounts."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from dataclasses import dataclass, field
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from pydantic import SecretStr

from eimir.config import get_settings
from eimir.providers.photo_transport import PhotoSourceError
from eimir.security.keyring import EncryptionMode

if TYPE_CHECKING:
    from eimir.config import Settings

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
CALLBACK_PATH = "/api/v1/photo-sources/google/callback"
SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
_FILE_LIMIT = 32 * 1024


@dataclass(frozen=True)
class GooglePhotosClient:
    client_id: str = field(repr=False)
    client_secret: SecretStr = field(repr=False)
    redirect_uri: str

    @property
    def binding(self) -> str:
        """Protected transaction identity; neither a credential nor a public ID."""
        encoded = json.dumps(
            [self.client_id, self.client_secret.get_secret_value(), self.redirect_uri],
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(encoded).hexdigest()


def callback_uri(public_base_url: str) -> str:
    try:
        parsed = urlsplit(public_base_url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
            or not public_base_url.isascii()
            or "\\" in public_base_url
            or any(ord(char) < 33 or ord(char) == 127 for char in public_base_url)
        ):
            raise ValueError
        # Force validation of malformed and out-of-range ports.
        _ = parsed.port
    except ValueError:
        raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID") from None
    return public_base_url.rstrip("/") + CALLBACK_PATH


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def _web_client_file(path: str, redirect_uri: str) -> dict[str, object]:
    descriptor: int | None = None
    try:
        # A misconfigured FIFO/device must not block an application worker.
        descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = None
            raw = stream.read(_FILE_LIMIT + 1)
        if len(raw) > _FILE_LIMIT:
            raise ValueError
        root = json.loads(raw, object_pairs_hook=_unique_object)
        if (
            not isinstance(root, dict)
            or "installed" in root
            or not isinstance(root.get("web"), dict)
        ):
            raise ValueError
        web: dict[str, object] = root["web"]
        callbacks = web.get("redirect_uris")
        if not isinstance(callbacks, list) or redirect_uri not in callbacks:
            raise ValueError
        if (
            web.get("auth_uri", AUTH_URI) != AUTH_URI
            or web.get("token_uri", TOKEN_URI) != TOKEN_URI
        ):
            raise ValueError
        return web
    except (OSError, ValueError, TypeError, RecursionError):
        # Parser/OS errors may contain private paths or raw document values.
        raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)


def client_configuration(settings: Settings | None = None) -> GooglePhotosClient:
    settings = settings or get_settings()
    if settings.encryption_mode is not EncryptionMode.REQUIRED:
        raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
    redirect_uri = callback_uri(settings.public_base_url)
    path = settings.google_photos_web_client_file
    if path:
        if settings.google_photos_client_id or settings.google_photos_client_secret:
            raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
        web = _web_client_file(path, redirect_uri)
        identifier, secret = web.get("client_id"), web.get("client_secret")
    else:
        identifier = settings.google_photos_client_id
        secret = (
            settings.google_photos_client_secret.get_secret_value()
            if settings.google_photos_client_secret
            else None
        )
    if (
        not isinstance(identifier, str)
        or len(identifier) > 1024
        or re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", identifier) is None
        or not isinstance(secret, str)
        or not 1 <= len(secret) <= 4096
        or any(not 33 <= ord(char) <= 126 for char in secret)
    ):
        raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
    return GooglePhotosClient(identifier, SecretStr(secret), redirect_uri)
