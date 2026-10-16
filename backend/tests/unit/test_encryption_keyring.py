"""Key ring: hierarchy, validation, and failure behavior."""

from __future__ import annotations

import base64

import pytest

from eimir.security.errors import DecryptionError, EncryptionConfigurationError
from eimir.security.keyring import EncryptionMode, KeyRing, build_key_ring, decode_key
from tests.support.encryption import encoded_key, key_ring, random_key


def test_wrap_round_trip_uses_a_fresh_nonce_each_time() -> None:
    ring = key_ring("k1")
    data_key = random_key()
    first_id, first = ring.wrap(data_key, b"ctx")
    _, second = ring.wrap(data_key, b"ctx")
    assert first_id == "k1"
    assert first != second
    assert ring.unwrap("k1", first, b"ctx") == data_key


def test_unwrap_rejects_a_different_context() -> None:
    ring = key_ring("k1")
    _, wrapped = ring.wrap(random_key(), b"object-a")
    with pytest.raises(DecryptionError):
        ring.unwrap("k1", wrapped, b"object-b")


def test_unwrap_rejects_a_different_key_with_the_same_id() -> None:
    _, wrapped = key_ring("k1").wrap(random_key(), b"ctx")
    with pytest.raises(DecryptionError):
        key_ring("k1").unwrap("k1", wrapped, b"ctx")


def test_unwrap_with_unknown_key_id_fails_closed() -> None:
    _, wrapped = key_ring("k1").wrap(random_key(), b"ctx")
    with pytest.raises(DecryptionError, match="not configured"):
        key_ring("other").unwrap("k1", wrapped, b"ctx")


def test_tampered_wrapped_key_fails() -> None:
    ring = key_ring("k1")
    _, wrapped = ring.wrap(random_key(), b"ctx")
    tampered = bytes([wrapped[0] ^ 1]) + wrapped[1:]
    with pytest.raises(DecryptionError):
        ring.unwrap("k1", tampered, b"ctx")


def test_old_keys_stay_readable_while_new_wraps_use_the_active_key() -> None:
    old_key = random_key()
    old = KeyRing({"2026-01": old_key}, "2026-01")
    data_key = random_key()
    _, wrapped = old.wrap(data_key, b"ctx")

    rotated = KeyRing({"2026-01": old_key, "2026-02": random_key()}, "2026-02")
    assert rotated.unwrap("2026-01", wrapped, b"ctx") == data_key
    assert rotated.wrap(data_key, b"ctx")[0] == "2026-02"


def test_repr_never_contains_key_material() -> None:
    key = random_key()
    ring = KeyRing({"k1": key}, "k1")
    assert base64.b64encode(key).decode() not in repr(ring)
    assert key.hex() not in repr(ring)


@pytest.mark.parametrize(
    "value",
    [
        "",
        "not base64!!",
        base64.b64encode(b"short").decode(),
        base64.b64encode(bytes(32)).decode(),  # all-zero placeholder
        base64.b64encode(b"A" * 32).decode(),  # repeated-byte placeholder
    ],
)
def test_invalid_or_placeholder_keys_are_rejected(value: str) -> None:
    with pytest.raises(EncryptionConfigurationError):
        decode_key(value)


def test_url_safe_and_unpadded_encodings_are_accepted() -> None:
    raw = random_key()
    assert decode_key(base64.urlsafe_b64encode(raw).decode().rstrip("=")) == raw
    assert decode_key(base64.b64encode(raw).decode()) == raw


def test_ring_rejects_unknown_active_key_and_shared_material() -> None:
    key = random_key()
    with pytest.raises(EncryptionConfigurationError):
        KeyRing({"a": key}, "missing")
    with pytest.raises(EncryptionConfigurationError):
        KeyRing({"a": key, "b": key}, "a")
    with pytest.raises(EncryptionConfigurationError):
        KeyRing({"bad id": random_key()}, "bad id")


def test_build_key_ring_requires_keys_and_an_active_id() -> None:
    with pytest.raises(EncryptionConfigurationError):
        build_key_ring({}, "k1")
    with pytest.raises(EncryptionConfigurationError):
        build_key_ring({"k1": encoded_key()}, None)


def test_mode_semantics() -> None:
    assert EncryptionMode.REQUIRED.encrypts_writes
    assert not EncryptionMode.REQUIRED.accepts_legacy_plaintext
    assert EncryptionMode.MIGRATING.encrypts_writes
    assert EncryptionMode.MIGRATING.accepts_legacy_plaintext
    assert not EncryptionMode.DISABLED.encrypts_writes
