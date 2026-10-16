"""Process-wide encryption objects derived from ``Settings``.

The cache is keyed on the identity of the ``Settings`` instance, so clearing
``get_settings`` (as tests and settings reloads do) also drops every derived key
object. Nothing here reads key material from anywhere but ``Settings``.
"""

from __future__ import annotations

import threading

from eimir.config import Settings, get_settings
from eimir.security.keyring import EncryptionMode, KeyRing, build_key_ring
from eimir.security.payload_envelope import PayloadProtector

_lock = threading.Lock()
_cache: tuple[Settings, KeyRing | None, PayloadProtector] | None = None


def key_ring_from_settings(settings: Settings) -> KeyRing | None:
    if not settings.encryption_mode.encrypts_writes:
        return None
    return build_key_ring(
        {key_id: secret.get_secret_value() for key_id, secret in settings.encryption_keys.items()},
        settings.encryption_active_key_id,
    )


def _resolve() -> tuple[KeyRing | None, PayloadProtector]:
    global _cache
    settings = get_settings()
    cached = _cache
    if cached is not None and cached[0] is settings:
        return cached[1], cached[2]
    with _lock:
        cached = _cache
        if cached is not None and cached[0] is settings:
            return cached[1], cached[2]
        ring = key_ring_from_settings(settings)
        protector = PayloadProtector(settings.encryption_mode, ring)
        _cache = (settings, ring, protector)
        return ring, protector


def get_key_ring() -> KeyRing | None:
    """The configured key ring, or ``None`` when encryption is disabled."""
    return _resolve()[0]


def get_payload_protector() -> PayloadProtector:
    return _resolve()[1]


def get_encryption_mode() -> EncryptionMode:
    return get_settings().encryption_mode
