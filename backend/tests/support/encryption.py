"""Key material for encryption tests.

Keys are generated per call from the OS random source. No key value is written
in the repository, so there is no test key that could be mistaken for, or copied
into, a production configuration.
"""

from __future__ import annotations

import base64
import os

from eimir.security.keyring import KeyRing


def random_key() -> bytes:
    return os.urandom(32)


def encoded_key() -> str:
    return base64.b64encode(random_key()).decode("ascii")


def key_ring(*key_ids: str, active: str | None = None) -> KeyRing:
    ids = key_ids or ("k1",)
    return KeyRing({key_id: random_key() for key_id in ids}, active or ids[-1])


def ring_with(keys: dict[str, bytes], active: str) -> KeyRing:
    return KeyRing(keys, active)


_ENCRYPTION_ENV = (
    "EIMIR_ENCRYPTION_AT_REST",
    "EIMIR_ENCRYPTION_KEYS",
    "EIMIR_ENCRYPTION_ACTIVE_KEY_ID",
    "SBS_ENCRYPTION_AT_REST",
    "SBS_ENCRYPTION_KEYS",
    "SBS_ENCRYPTION_ACTIVE_KEY_ID",
)


def reset_encryption_caches() -> None:
    from eimir.config import get_settings
    from eimir.media import get_media_store

    get_settings.cache_clear()
    get_media_store.cache_clear()


class EncryptionConfigurator:
    """Applies an encryption configuration to the process environment for one test."""

    def __init__(self, monkeypatch: object) -> None:
        self._monkeypatch = monkeypatch

    def apply(
        self,
        mode: str,
        *,
        keys: dict[str, str] | None = None,
        active: str | None = None,
    ) -> dict[str, str]:
        """Set ``mode`` and (for encrypting modes) fresh random keys; returns the keys."""
        import json

        monkeypatch = self._monkeypatch
        for name in _ENCRYPTION_ENV:
            monkeypatch.delenv(name, raising=False)  # type: ignore[attr-defined]
        monkeypatch.setenv("EIMIR_ENCRYPTION_AT_REST", mode)  # type: ignore[attr-defined]
        used: dict[str, str] = {}
        if mode != "disabled":
            used = keys if keys is not None else {"k1": encoded_key()}
            monkeypatch.setenv("EIMIR_ENCRYPTION_KEYS", json.dumps(used))  # type: ignore[attr-defined]
            monkeypatch.setenv(  # type: ignore[attr-defined]
                "EIMIR_ENCRYPTION_ACTIVE_KEY_ID", active or list(used)[-1]
            )
        reset_encryption_caches()
        return used
