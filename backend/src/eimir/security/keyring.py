"""Key-encryption keys and the small wrap/unwrap contract built on them.

Hierarchy::

    key-encryption key (KEK, operator supplied, versioned by key id)
        -> wraps a random per-record / per-object data key (DEK)
            -> encrypts one protected payload or one media object

Consumers depend on ``KeyWrapper`` only. A managed KMS can implement the same
two operations later without any change to the payload or media formats: the
KEK then never enters this process.

``KeyRing`` is the built-in implementation. It holds KEKs supplied through the
environment or a secret store; the repository and the image contain none, and no
default key exists in code.
"""

from __future__ import annotations

import base64
import binascii
import os
import re
from collections.abc import Mapping
from enum import StrEnum
from typing import Protocol

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from eimir.security.errors import DecryptionError, EncryptionConfigurationError

KEY_LENGTH = 32
DATA_KEY_LENGTH = 32
_NONCE_LENGTH = 12
_KEY_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,31}")
_WRAP_DOMAIN = b"eimir.keywrap.v1\x00"


class EncryptionMode(StrEnum):
    """What the running process does with protected content.

    ``REQUIRED``   keys mandatory; every write is encrypted; plaintext found in
                   the database or object store is rejected (fail closed).
    ``MIGRATING``  keys mandatory; every write is encrypted; legacy plaintext is
                   still readable so an existing installation can be converted.
                   This is an explicit, observable transition state, never a
                   default in production.
    ``DISABLED``   no encryption; writes are plaintext; ciphertext is rejected
                   instead of being returned as if it were content.
    """

    REQUIRED = "required"
    MIGRATING = "migrating"
    DISABLED = "disabled"

    @property
    def encrypts_writes(self) -> bool:
        return self is not EncryptionMode.DISABLED

    @property
    def accepts_legacy_plaintext(self) -> bool:
        return self is not EncryptionMode.REQUIRED


class KeyWrapper(Protocol):
    """The whole key-management surface the formats depend on."""

    @property
    def active_key_id(self) -> str: ...

    @property
    def key_ids(self) -> frozenset[str]: ...

    def wrap(self, data_key: bytes, context: bytes) -> tuple[str, bytes]:
        """Wrap ``data_key`` under the active KEK; return ``(key_id, wrapped)``."""
        ...

    def unwrap(self, key_id: str, wrapped: bytes, context: bytes) -> bytes:
        """Recover a data key; raise ``DecryptionError`` if it cannot be authenticated."""
        ...


def validate_key_id(value: str) -> str:
    if _KEY_ID.fullmatch(value) is None:
        raise EncryptionConfigurationError(
            "Encryption key ids must be 1-32 characters of letters, digits, '.', '_' or '-'."
        )
    return value


def decode_key(value: str) -> bytes:
    """Decode one base64 (standard or URL-safe) 256-bit key."""
    normalized = value.strip().replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    try:
        key = base64.b64decode(normalized, validate=True)
    except (binascii.Error, ValueError):
        raise EncryptionConfigurationError("An encryption key is not valid base64.") from None
    if len(key) != KEY_LENGTH:
        raise EncryptionConfigurationError("An encryption key must be exactly 32 bytes.")
    if len(set(key)) == 1:
        # An all-identical key is a template placeholder, not generated key material.
        raise EncryptionConfigurationError("An encryption key looks like a placeholder value.")
    return key


class KeyRing:
    """Versioned KEKs held in process memory.

    Old key ids stay in the ring so data written before a rotation remains
    readable; new wraps always use the active key. Removing an id from the ring
    makes everything still wrapped under it unreadable, which is the revocation
    mechanism and must only happen after re-wrapping (see the rotation runbook).
    """

    def __init__(self, keys: Mapping[str, bytes], active_key_id: str) -> None:
        if not keys:
            raise EncryptionConfigurationError("At least one encryption key is required.")
        self._ciphers: dict[str, AESGCM] = {}
        for key_id, key in keys.items():
            validate_key_id(key_id)
            if len(key) != KEY_LENGTH:
                raise EncryptionConfigurationError("An encryption key must be exactly 32 bytes.")
            self._ciphers[key_id] = AESGCM(key)
        if active_key_id not in self._ciphers:
            raise EncryptionConfigurationError("The active encryption key id is not in the ring.")
        # Two ids for the same material would defeat rotation bookkeeping.
        if len({bytes(key) for key in keys.values()}) != len(keys):
            raise EncryptionConfigurationError("Encryption key ids must not share key material.")
        self._active = active_key_id

    def __repr__(self) -> str:
        return f"KeyRing(key_ids={sorted(self._ciphers)}, active={self._active!r})"

    @property
    def active_key_id(self) -> str:
        return self._active

    @property
    def key_ids(self) -> frozenset[str]:
        return frozenset(self._ciphers)

    @staticmethod
    def _aad(key_id: str, context: bytes) -> bytes:
        return _WRAP_DOMAIN + key_id.encode("ascii") + b"\x00" + context

    def wrap(self, data_key: bytes, context: bytes) -> tuple[str, bytes]:
        key_id = self._active
        nonce = os.urandom(_NONCE_LENGTH)
        wrapped = self._ciphers[key_id].encrypt(nonce, data_key, self._aad(key_id, context))
        return key_id, nonce + wrapped

    def unwrap(self, key_id: str, wrapped: bytes, context: bytes) -> bytes:
        cipher = self._ciphers.get(key_id)
        if cipher is None:
            raise DecryptionError("The encryption key for this content is not configured.")
        if len(wrapped) <= _NONCE_LENGTH:
            raise DecryptionError("Wrapped data key is malformed.")
        try:
            return cipher.decrypt(
                wrapped[:_NONCE_LENGTH], wrapped[_NONCE_LENGTH:], self._aad(key_id, context)
            )
        except InvalidTag:
            raise DecryptionError("Wrapped data key failed authentication.") from None


def build_key_ring(keys: Mapping[str, str], active_key_id: str | None) -> KeyRing:
    """Build a ring from ``{key_id: base64 key}`` as supplied by settings."""
    if not keys:
        raise EncryptionConfigurationError("EIMIR_ENCRYPTION_KEYS is empty.")
    if active_key_id is None:
        raise EncryptionConfigurationError("EIMIR_ENCRYPTION_ACTIVE_KEY_ID is required.")
    return KeyRing({key_id: decode_key(value) for key_id, value in keys.items()}, active_key_id)
