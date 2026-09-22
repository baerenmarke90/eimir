"""EncryptingMediaStore: what the storage provider sees, and what fails closed."""

from __future__ import annotations

import io
import os
import tracemalloc
from datetime import timedelta
from pathlib import Path

import pytest

from eimir.media.base import MediaStore
from eimir.media.encrypted import MAGIC, EncryptingMediaStore
from eimir.media.local import LocalMediaStore
from eimir.media.presigned import supports_signed_upload
from eimir.security.errors import (
    DecryptionError,
    EncryptionConfigurationError,
    PlaintextRejectedError,
)
from eimir.security.keyring import EncryptionMode, KeyRing
from tests.support.encryption import key_ring, random_key

KEY = "spaces/s/attachments/a/original"
CHUNK = 4096  # smallest legal chunk keeps boundary tests cheap


@pytest.fixture
def raw(tmp_path: Path) -> LocalMediaStore:
    return LocalMediaStore(tmp_path / "media")


def _store(
    raw: MediaStore,
    ring: KeyRing | None = None,
    mode: EncryptionMode = EncryptionMode.REQUIRED,
) -> EncryptingMediaStore:
    return EncryptingMediaStore(raw, ring or key_ring("k1"), mode, chunk_size=CHUNK)


def _read(store: MediaStore, key: str = KEY) -> bytes:
    with store.open(key) as handle:
        return handle.read()


def _raw_bytes(raw: LocalMediaStore, key: str = KEY) -> bytes:
    with raw.open(key) as handle:
        return handle.read()


def _write_raw(raw: LocalMediaStore, data: bytes, key: str = KEY) -> None:
    raw.put(key, io.BytesIO(data), "application/octet-stream")


@pytest.mark.parametrize("size", [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 17])
def test_round_trip_across_chunk_boundaries(raw: LocalMediaStore, size: int) -> None:
    payload = os.urandom(size)
    store = _store(raw)
    stored = store.put(KEY, io.BytesIO(payload), "image/jpeg")
    assert stored.size == size
    assert _read(store) == payload


def test_raw_object_is_ciphertext_and_never_the_input(raw: LocalMediaStore) -> None:
    plaintext = b"\xff\xd8\xff\xe0 recognizable image bytes " * 400
    _store(raw).put(KEY, io.BytesIO(plaintext), "image/jpeg")
    stored = _raw_bytes(raw)
    assert stored != plaintext
    assert stored.startswith(MAGIC)
    assert b"recognizable image bytes" not in stored


def test_identical_uploads_produce_different_ciphertext(raw: LocalMediaStore) -> None:
    store = _store(raw)
    plaintext = os.urandom(2 * CHUNK)
    store.put("a", io.BytesIO(plaintext), "image/png")
    store.put("b", io.BytesIO(plaintext), "image/png")
    assert _raw_bytes(raw, "a")[40:] != _raw_bytes(raw, "b")[40:]


def test_small_reads_and_readinto_reassemble_the_stream(raw: LocalMediaStore) -> None:
    payload = os.urandom(3 * CHUNK + 5)
    store = _store(raw)
    store.put(KEY, io.BytesIO(payload), "image/png")
    pieces = []
    with store.open(KEY) as handle:
        while piece := handle.read(1000):
            pieces.append(piece)
    assert b"".join(pieces) == payload


def test_flipped_body_byte_fails_authentication(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(os.urandom(3 * CHUNK)), "image/png")
    data = bytearray(_raw_bytes(raw))
    data[-100] ^= 0x01
    _write_raw(raw, bytes(data))
    with pytest.raises(DecryptionError):
        _read(store)


def test_flipped_header_byte_fails(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(b"x" * 100), "image/png")
    data = bytearray(_raw_bytes(raw))
    data[30] ^= 0x01  # inside the wrapped data key
    _write_raw(raw, bytes(data))
    with pytest.raises(DecryptionError):
        _read(store)


def test_truncation_at_a_chunk_boundary_is_detected(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(os.urandom(3 * CHUNK)), "image/png")
    data = _raw_bytes(raw)
    _write_raw(raw, data[: len(data) - (CHUNK + 16)])
    with pytest.raises(DecryptionError):
        _read(store)


def test_appended_data_is_detected(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(os.urandom(CHUNK + 10)), "image/png")
    _write_raw(raw, _raw_bytes(raw) + os.urandom(64))
    with pytest.raises(DecryptionError):
        _read(store)


def test_chunk_reordering_is_detected(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(os.urandom(3 * CHUNK)), "image/png")
    data = _raw_bytes(raw)
    header = len(data) - 3 * (CHUNK + 16)
    first, second, third = (
        data[header + i * (CHUNK + 16) : header + (i + 1) * (CHUNK + 16)] for i in range(3)
    )
    _write_raw(raw, data[:header] + second + first + third)
    with pytest.raises(DecryptionError):
        _read(store)


def test_an_object_copied_to_another_key_does_not_decrypt(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(b"private"), "image/png")
    _write_raw(raw, _raw_bytes(raw), key="spaces/other/attachments/b/original")
    with pytest.raises(DecryptionError):
        _read(store, "spaces/other/attachments/b/original")


def test_wrong_and_missing_key_material_fail_closed(raw: LocalMediaStore) -> None:
    _store(raw).put(KEY, io.BytesIO(b"private"), "image/png")
    with pytest.raises(DecryptionError):
        _read(_store(raw, key_ring("k1")))  # same id, different key
    with pytest.raises(DecryptionError, match="not configured"):
        _read(_store(raw, key_ring("other")))


def test_garbage_that_only_looks_like_an_object_is_rejected(raw: LocalMediaStore) -> None:
    store = _store(raw)
    _write_raw(raw, MAGIC + b"\x01" + b"\x00" * 8)
    with pytest.raises(DecryptionError):
        _read(store)


def test_required_mode_rejects_a_plaintext_object(raw: LocalMediaStore) -> None:
    _write_raw(raw, b"legacy plaintext image")
    with pytest.raises(PlaintextRejectedError):
        _read(_store(raw, mode=EncryptionMode.REQUIRED))


def test_migrating_mode_reads_legacy_plaintext(raw: LocalMediaStore) -> None:
    _write_raw(raw, b"legacy plaintext image")
    assert _read(_store(raw, mode=EncryptionMode.MIGRATING)) == b"legacy plaintext image"


def test_legacy_object_is_encrypted_in_place_and_idempotently(raw: LocalMediaStore) -> None:
    payload = os.urandom(2 * CHUNK + 3)
    _write_raw(raw, payload)
    store = _store(raw, mode=EncryptionMode.MIGRATING)

    assert store.encrypt_legacy(KEY) is True
    assert _raw_bytes(raw).startswith(MAGIC)
    assert payload not in _raw_bytes(raw)
    assert _read(store) == payload
    assert store.encrypt_legacy(KEY) is False  # already migrated: not encrypted twice
    assert _read(store) == payload


def test_failed_reencryption_leaves_the_original_object_intact(raw: LocalMediaStore) -> None:
    class Exploding:
        def read(self, size: int = -1, /) -> bytes:
            raise OSError("source failed")

    original = b"still the original"
    _write_raw(raw, original)
    with pytest.raises(OSError):
        _store(raw).put(KEY, Exploding(), "image/png")
    assert _raw_bytes(raw) == original
    leftovers = [p.name for p in Path(raw._root).rglob(".eimir-tmp-*")]
    assert leftovers == []


def test_rewrap_moves_the_object_to_the_active_key_without_touching_the_body(
    raw: LocalMediaStore,
) -> None:
    old_key, new_key = random_key(), random_key()
    payload = os.urandom(3 * CHUNK)
    old = _store(raw, KeyRing({"old": old_key}, "old"))
    old.put(KEY, io.BytesIO(payload), "image/png")
    before = _raw_bytes(raw)

    rotated = _store(raw, KeyRing({"old": old_key, "new": new_key}, "new"))
    assert rotated.stored_key_id(KEY) == "old"
    assert rotated.rewrap(KEY) is True
    assert rotated.stored_key_id(KEY) == "new"
    assert rotated.rewrap(KEY) is False
    assert _read(rotated) == payload
    body = 3 * (CHUNK + 16)
    assert _raw_bytes(raw)[-body:] == before[-body:]

    # Revoking the old key afterwards keeps the re-wrapped object readable.
    assert _read(_store(raw, KeyRing({"new": new_key}, "new"))) == payload


def test_provider_side_urls_are_not_offered(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(b"x"), "image/png")
    assert store.create_read_url(KEY, timedelta(minutes=5)) is None
    assert not supports_signed_upload(store)


def test_delete_removes_the_object_and_its_key_metadata(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(b"x"), "image/png")
    store.delete(KEY)
    assert not store.exists(KEY)
    assert not raw.exists(KEY)
    store.delete(KEY)  # missing objects are not an error


def test_copy_reencrypts_under_the_target_key(raw: LocalMediaStore) -> None:
    store = _store(raw)
    store.put(KEY, io.BytesIO(b"copy me"), "image/png")
    store.copy(KEY, "target/key", "image/png")
    assert _read(store, "target/key") == b"copy me"
    assert _raw_bytes(raw, "target/key") != _raw_bytes(raw)


def test_disabled_mode_cannot_build_an_encrypting_store(raw: LocalMediaStore) -> None:
    with pytest.raises(EncryptionConfigurationError):
        EncryptingMediaStore(raw, key_ring("k1"), EncryptionMode.DISABLED)


def test_large_object_is_processed_in_bounded_memory(raw: LocalMediaStore) -> None:
    size = 32 * 1024 * 1024

    class Zeros:
        def __init__(self) -> None:
            self.left = size

        def read(self, count: int = -1, /) -> bytes:
            take = min(self.left, count if count >= 0 else self.left)
            self.left -= take
            return b"\x07" * take

    store = EncryptingMediaStore(raw, key_ring("k1"), EncryptionMode.REQUIRED)
    tracemalloc.start()
    try:
        stored = store.put(KEY, Zeros(), "video/mp4")
        with store.open(KEY) as handle:
            total = 0
            while chunk := handle.read(1 << 20):
                total += len(chunk)
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert stored.size == total == size
    assert peak < 8 * 1024 * 1024


def test_decrypted_stream_is_seekable_for_random_access_consumers(raw: LocalMediaStore) -> None:
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("a.txt", "alpha" * 3000)
        archive.writestr("b.txt", os.urandom(3 * CHUNK))
    payload = buffer.getvalue()
    store = _store(raw)
    store.put(KEY, io.BytesIO(payload), "application/zip")

    with store.open(KEY) as handle, zipfile.ZipFile(handle) as archive:
        assert archive.read("a.txt") == b"alpha" * 3000
        assert len(archive.read("b.txt")) == 3 * CHUNK

    with store.open(KEY) as handle:
        handle.seek(CHUNK + 7)
        assert handle.read(50) == payload[CHUNK + 7 : CHUNK + 57]
        handle.seek(-10, io.SEEK_END)
        assert handle.read() == payload[-10:]
