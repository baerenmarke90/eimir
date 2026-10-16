"""JSON envelope for ``ProtectedPayload`` columns.

Stored form of an encrypted payload (a JSONB object)::

    {"_enc": 2, "kid": "<key id>", "wk": "<wrapped data key>",
     "n": "<AEAD nonce>", "ct": "<ciphertext + tag>"}

- ``_enc`` is the scheme number and equals the row's ``crypto_version`` column.
- ``kid`` names the KEK that wrapped this record's data key. It is deliberately
  plaintext so key usage and rotation progress are observable without any key.
- ``wk`` is a fresh random data key wrapped under that KEK. Every write creates a
  new data key, so the AEAD nonce is never reused under one key and rotation is a
  re-wrap that leaves ``n``/``ct`` untouched.
- ``ct`` is AES-256-GCM over the canonical JSON of the payload, authenticated
  with the payload's crypto context (``ProtectedPayload.crypto_context``), so a
  ciphertext cannot be replayed into a column of a different payload type.

Not bound: the row identity. A database writer can still swap two ciphertexts of
the SAME payload type between rows. The type decorator that calls this module
cannot see the row; binding the row is a documented follow-up.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from typing import Any, Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.security.errors import (
    DecryptionError,
    EncryptionConfigurationError,
    PlaintextRejectedError,
)
from eimir.security.keyring import DATA_KEY_LENGTH, EncryptionMode, KeyWrapper

MARKER: Final = "_enc"
_NONCE_LENGTH = 12
_PAYLOAD_DOMAIN = b"eimir.payload.v2\x00"
_WRAP_DOMAIN = b"eimir.payload.wrap.v2\x00"
_ENVELOPE_KEYS = frozenset({MARKER, "kid", "wk", "n", "ct"})


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: object) -> bytes:
    if not isinstance(value, str):
        raise DecryptionError("Encrypted payload is malformed.")
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except (binascii.Error, ValueError):
        raise DecryptionError("Encrypted payload is malformed.") from None


def is_encrypted(stored: object) -> bool:
    return isinstance(stored, dict) and MARKER in stored


def stored_crypto_version(stored: object) -> int:
    """Return the scheme a stored value is in, without any key."""
    if is_encrypted(stored):
        marker = stored[MARKER]  # type: ignore[index]
        return marker if isinstance(marker, int) and not isinstance(marker, bool) else -1
    return CRYPTO_VERSION_PLAINTEXT


def stored_key_id(stored: object) -> str | None:
    """Return the KEK id of an encrypted value, or ``None`` for plaintext."""
    if not isinstance(stored, dict) or MARKER not in stored:
        return None
    key_id = stored.get("kid")
    return key_id if isinstance(key_id, str) else None


class PayloadProtector:
    """Applies the active ``EncryptionMode`` to payload dictionaries."""

    def __init__(self, mode: EncryptionMode, wrapper: KeyWrapper | None) -> None:
        if mode.encrypts_writes and wrapper is None:
            raise EncryptionConfigurationError(
                "Encryption is enabled but no key material is configured."
            )
        self._mode = mode
        self._wrapper = wrapper

    @property
    def mode(self) -> EncryptionMode:
        return self._mode

    @property
    def write_crypto_version(self) -> int:
        """The ``crypto_version`` every new write is stored under."""
        if self._mode.encrypts_writes:
            return CRYPTO_VERSION_SERVER_AEAD
        return CRYPTO_VERSION_PLAINTEXT

    @property
    def active_key_id(self) -> str | None:
        return self._wrapper.active_key_id if self._wrapper is not None else None

    def protect(self, plain: dict[str, Any], *, context: str) -> dict[str, Any]:
        """Return the persisted form of a payload."""
        if not self._mode.encrypts_writes:
            return plain
        wrapper = self._require_wrapper()
        data_key = AESGCM.generate_key(bit_length=DATA_KEY_LENGTH * 8)
        nonce = os.urandom(_NONCE_LENGTH)
        canonical = json.dumps(
            plain, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8")
        ciphertext = AESGCM(data_key).encrypt(nonce, canonical, self._aad(context))
        key_id, wrapped = wrapper.wrap(data_key, self._wrap_context(context))
        return {
            MARKER: CRYPTO_VERSION_SERVER_AEAD,
            "kid": key_id,
            "wk": _b64(wrapped),
            "n": _b64(nonce),
            "ct": _b64(ciphertext),
        }

    def reveal(self, stored: dict[str, Any], *, context: str) -> dict[str, Any]:
        """Return the plaintext payload dictionary or fail closed."""
        if not is_encrypted(stored):
            if not self._mode.accepts_legacy_plaintext:
                raise PlaintextRejectedError(
                    "Plaintext protected content was found while encryption is required."
                )
            return stored
        if not self._mode.encrypts_writes:
            raise DecryptionError("Encrypted content was found while encryption is disabled.")
        data_key = self._unwrap(stored, context)
        try:
            canonical = AESGCM(data_key).decrypt(
                _unb64(stored.get("n")), _unb64(stored.get("ct")), self._aad(context)
            )
        except InvalidTag:
            raise DecryptionError("Encrypted payload failed authentication.") from None
        try:
            plain = json.loads(canonical)
        except ValueError:
            raise DecryptionError("Encrypted payload is malformed.") from None
        if not isinstance(plain, dict):
            raise DecryptionError("Encrypted payload is malformed.")
        return plain

    def rewrap(self, stored: dict[str, Any], *, context: str) -> dict[str, Any] | None:
        """Re-wrap the data key under the active KEK; ``None`` if already current.

        The payload ciphertext is not touched, so this never handles plaintext
        content and is cheap enough to run over the whole table.
        """
        wrapper = self._require_wrapper()
        if not is_encrypted(stored):
            raise PlaintextRejectedError("Only encrypted content can be re-wrapped.")
        if stored_key_id(stored) == wrapper.active_key_id:
            return None
        data_key = self._unwrap(stored, context)
        key_id, wrapped = wrapper.wrap(data_key, self._wrap_context(context))
        return {**stored, "kid": key_id, "wk": _b64(wrapped)}

    def _unwrap(self, stored: dict[str, Any], context: str) -> bytes:
        if set(stored) != _ENVELOPE_KEYS or stored[MARKER] != CRYPTO_VERSION_SERVER_AEAD:
            raise DecryptionError("Encrypted payload uses an unsupported format.")
        key_id = stored.get("kid")
        if not isinstance(key_id, str):
            raise DecryptionError("Encrypted payload is malformed.")
        return self._require_wrapper().unwrap(
            key_id, _unb64(stored.get("wk")), self._wrap_context(context)
        )

    def _require_wrapper(self) -> KeyWrapper:
        if self._wrapper is None:
            raise EncryptionConfigurationError("No key material is configured.")
        return self._wrapper

    @staticmethod
    def _aad(context: str) -> bytes:
        return _PAYLOAD_DOMAIN + context.encode("utf-8")

    @staticmethod
    def _wrap_context(context: str) -> bytes:
        return _WRAP_DOMAIN + context.encode("utf-8")
