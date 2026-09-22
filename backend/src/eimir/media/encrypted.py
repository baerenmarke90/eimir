"""Application-controlled encryption of media objects (issue #797).

``EncryptingMediaStore`` wraps any ``MediaStore`` so that the bytes reaching the
storage provider are ciphertext, independent of what the provider offers. It is
provider-neutral: S3, the local filesystem, and any later adapter are wrapped
the same way.

Object layout (all integers big-endian)::

    "EIMIRENC" | fmt(1) | chunk_size(4) | kid_len(1) | kid | wk_len(2) | wk | chunk...

- ``wk`` is this object's random 256-bit data key, wrapped under a KEK and bound
  to the storage key. One data key per object; no key is shared between objects.
- The body is AES-256-GCM in independent chunks (STREAM construction). The nonce
  of chunk *i* is ``i`` (11 bytes) plus a final-chunk flag byte, so reordering,
  truncation and appended data all fail authentication. The chunk AAD binds the
  format parameters and the storage key, so an object moved to another key does
  not decrypt.
- Key metadata lives inside the object: deleting the object deletes its wrapped
  key, and a rotation re-wraps only the header (``rewrap``).

Memory: encryption and decryption are streaming with one chunk of lookahead.
Whether the whole object is buffered depends on the wrapped adapter (the S3
adapter already buffers a whole object per request; the filesystem adapter
streams).

Presigned upload and read URLs would let a client or CDN exchange plaintext with
the provider directly, so this store deliberately offers neither: uploads and
reads take the authorized application route, which is the trusted processing
boundary that can encrypt and decrypt. Not end-to-end encryption.
"""

from __future__ import annotations

import io
import struct
from datetime import timedelta
from typing import BinaryIO, Final

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from eimir.media.base import ByteSource, MediaStore, StoredObject
from eimir.security.errors import (
    DecryptionError,
    EncryptionConfigurationError,
    PlaintextRejectedError,
)
from eimir.security.keyring import DATA_KEY_LENGTH, EncryptionMode, KeyWrapper

MAGIC: Final = b"EIMIRENC"
FORMAT_VERSION: Final = 1
DEFAULT_CHUNK_SIZE: Final = 64 * 1024
_MIN_CHUNK_SIZE = 4 * 1024
_MAX_CHUNK_SIZE = 16 * 1024 * 1024
_TAG_LENGTH = 16
_STORED_CONTENT_TYPE = "application/octet-stream"
_WRAP_DOMAIN = b"eimir.media.wrap.v1\x00"
_AAD_DOMAIN = b"eimir.media.chunk.v1\x00"
_FIXED_HEADER = struct.Struct(">8sBIB")


def _chunk_nonce(index: int, final: bool) -> bytes:
    return index.to_bytes(11, "big") + (b"\x01" if final else b"\x00")


def _read_exact(source: ByteSource, size: int) -> bytes:
    parts: list[bytes] = []
    remaining = size
    while remaining > 0:
        piece = source.read(remaining)
        if not piece:
            break
        parts.append(piece)
        remaining -= len(piece)
    return b"".join(parts)


def _chunk_aad(chunk_size: int, storage_key: str) -> bytes:
    return _AAD_DOMAIN + struct.pack(">BI", FORMAT_VERSION, chunk_size) + storage_key.encode()


def _wrap_context(storage_key: str) -> bytes:
    return _WRAP_DOMAIN + storage_key.encode()


def _build_header(chunk_size: int, key_id: str, wrapped: bytes) -> bytes:
    kid = key_id.encode("ascii")
    return (
        _FIXED_HEADER.pack(MAGIC, FORMAT_VERSION, chunk_size, len(kid))
        + kid
        + struct.pack(">H", len(wrapped))
        + wrapped
    )


class _Header:
    def __init__(self, chunk_size: int, key_id: str, wrapped: bytes) -> None:
        self.chunk_size = chunk_size
        self.key_id = key_id
        self.wrapped = wrapped


def _parse_header(source: ByteSource, first: bytes = b"") -> _Header:
    """Read the header; ``first`` holds bytes already consumed from ``source``."""
    fixed = first + _read_exact(source, _FIXED_HEADER.size - len(first))
    if len(fixed) != _FIXED_HEADER.size:
        raise DecryptionError("Encrypted object header is truncated.")
    magic, version, chunk_size, kid_length = _FIXED_HEADER.unpack(fixed)
    if magic != MAGIC or version != FORMAT_VERSION:
        raise DecryptionError("Encrypted object uses an unsupported format.")
    if not _MIN_CHUNK_SIZE <= chunk_size <= _MAX_CHUNK_SIZE or kid_length == 0:
        raise DecryptionError("Encrypted object header is invalid.")
    kid = _read_exact(source, kid_length)
    length_raw = _read_exact(source, 2)
    if len(kid) != kid_length or len(length_raw) != 2:
        raise DecryptionError("Encrypted object header is truncated.")
    (wrapped_length,) = struct.unpack(">H", length_raw)
    wrapped = _read_exact(source, wrapped_length)
    if len(wrapped) != wrapped_length:
        raise DecryptionError("Encrypted object header is truncated.")
    try:
        return _Header(chunk_size, kid.decode("ascii"), wrapped)
    except UnicodeDecodeError:
        raise DecryptionError("Encrypted object header is invalid.") from None


class _EncryptingSource:
    """``ByteSource`` yielding the encrypted form of ``source``."""

    def __init__(
        self, source: ByteSource, cipher: AESGCM, header: bytes, chunk_size: int, aad: bytes
    ) -> None:
        self._source = source
        self._cipher = cipher
        self._chunk_size = chunk_size
        self._aad = aad
        self._out = bytearray(header)
        self._index = 0
        self._finished = False
        self.plaintext_size = 0
        self._current = _read_exact(source, chunk_size)

    def _advance(self) -> None:
        following = _read_exact(self._source, self._chunk_size)
        final = not following
        self._out += self._cipher.encrypt(
            _chunk_nonce(self._index, final), self._current, self._aad
        )
        self.plaintext_size += len(self._current)
        self._current = following
        self._index += 1
        self._finished = final

    def read(self, size: int = -1, /) -> bytes:
        while not self._finished and (size < 0 or len(self._out) < size):
            self._advance()
        if size < 0 or size >= len(self._out):
            result = bytes(self._out)
            self._out.clear()
        else:
            result = bytes(self._out[:size])
            del self._out[:size]
        return result


class _DecryptingRaw(io.RawIOBase):
    """Seekable, chunk-at-a-time decrypting view of an encrypted object.

    Random access is possible because every chunk sits at a fixed offset and its
    nonce is derived from its index; only the final chunk (known from the object
    size) carries the final flag. Consumers such as ``zipfile`` need ``seek``.
    Memory use is one decrypted chunk.
    """

    def __init__(self, source: BinaryIO, cipher: AESGCM, chunk_size: int, aad: bytes) -> None:
        super().__init__()
        if not source.seekable():
            raise EncryptionConfigurationError("Encrypted media requires a seekable object.")
        self._source = source
        self._cipher = cipher
        self._aad = aad
        self._chunk_size = chunk_size
        self._stride = chunk_size + _TAG_LENGTH
        self._start = source.tell()
        body = source.seek(0, io.SEEK_END) - self._start
        self._chunks = -(-body // self._stride)
        last = body - (self._chunks - 1) * self._stride
        if body < _TAG_LENGTH or last < _TAG_LENGTH:
            raise DecryptionError("Encrypted object is truncated.")
        self._size = body - _TAG_LENGTH * self._chunks
        self._position = 0
        self._cached_index = -1
        self._cached = b""

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            target = offset
        elif whence == io.SEEK_CUR:
            target = self._position + offset
        elif whence == io.SEEK_END:
            target = self._size + offset
        else:
            raise ValueError("Invalid whence.")
        if target < 0:
            raise ValueError("Negative seek position.")
        self._position = target
        return target

    def _chunk(self, index: int) -> bytes:
        if index != self._cached_index:
            self._source.seek(self._start + index * self._stride)
            encrypted = _read_exact(self._source, self._stride)
            try:
                self._cached = self._cipher.decrypt(
                    _chunk_nonce(index, index == self._chunks - 1), encrypted, self._aad
                )
            except InvalidTag:
                raise DecryptionError("Encrypted object failed authentication.") from None
            self._cached_index = index
        return self._cached

    def readinto(self, target: bytearray | memoryview) -> int:  # type: ignore[override]
        view = memoryview(target).cast("B")
        if self._position >= self._size or not len(view):
            return 0
        index, within = divmod(self._position, self._chunk_size)
        chunk = self._chunk(index)
        count = min(len(view), len(chunk) - within)
        view[:count] = chunk[within : within + count]
        self._position += count
        return count

    def close(self) -> None:
        try:
            self._source.close()
        finally:
            super().close()


class EncryptingMediaStore(MediaStore):
    """``MediaStore`` whose persisted bytes are always authenticated ciphertext."""

    def __init__(
        self,
        inner: MediaStore,
        wrapper: KeyWrapper,
        mode: EncryptionMode,
        *,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
    ) -> None:
        if not mode.encrypts_writes:
            raise EncryptionConfigurationError(
                "EncryptingMediaStore requires an encrypting mode; use the plain store instead."
            )
        if not _MIN_CHUNK_SIZE <= chunk_size <= _MAX_CHUNK_SIZE:
            raise EncryptionConfigurationError("Media chunk size is out of range.")
        self._inner = inner
        self._wrapper = wrapper
        self._mode = mode
        self._chunk_size = chunk_size

    def put(self, storage_key: str, data: ByteSource, content_type: str) -> StoredObject:
        # The declared type stays application metadata; the provider only ever
        # sees an opaque blob.
        # A fresh random key per object; never derived from the storage key or
        # the content, so an identical upload never yields identical ciphertext.
        data_key = AESGCM.generate_key(bit_length=DATA_KEY_LENGTH * 8)
        key_id, wrapped = self._wrapper.wrap(data_key, _wrap_context(storage_key))
        source = _EncryptingSource(
            data,
            AESGCM(data_key),
            _build_header(self._chunk_size, key_id, wrapped),
            self._chunk_size,
            _chunk_aad(self._chunk_size, storage_key),
        )
        stored = self._inner.put(storage_key, source, _STORED_CONTENT_TYPE)
        return StoredObject(
            storage_key=stored.storage_key,
            size=source.plaintext_size,
            content_type=content_type,
        )

    def open(self, storage_key: str) -> BinaryIO:
        raw = self._inner.open(storage_key)
        try:
            prefix = _read_exact(raw, len(MAGIC))
            if prefix != MAGIC:
                if not self._mode.accepts_legacy_plaintext:
                    raise PlaintextRejectedError(
                        "A plaintext media object was found while encryption is required."
                    )
                raw.seek(0)
                return raw
            header = _parse_header(raw, prefix)
            data_key = self._wrapper.unwrap(
                header.key_id, header.wrapped, _wrap_context(storage_key)
            )
            decrypting = _DecryptingRaw(
                raw,
                AESGCM(data_key),
                header.chunk_size,
                _chunk_aad(header.chunk_size, storage_key),
            )
            return io.BufferedReader(decrypting, buffer_size=header.chunk_size)
        except BaseException:
            raw.close()
            raise

    def delete(self, storage_key: str) -> None:
        self._inner.delete(storage_key)

    def exists(self, storage_key: str) -> bool:
        return self._inner.exists(storage_key)

    def create_read_url(self, storage_key: str, expires_in: timedelta) -> str | None:
        # A provider URL would serve ciphertext to the client. The application
        # route decrypts after authorization instead.
        return None

    # Lifecycle operations used by the migration tooling, not by request paths.

    def is_encrypted(self, storage_key: str) -> bool:
        with self._inner.open(storage_key) as raw:
            return _read_exact(raw, len(MAGIC)) == MAGIC

    def encrypt_legacy(self, storage_key: str) -> bool:
        """Encrypt a legacy plaintext object in place; ``False`` if already encrypted.

        The replacement is a single atomic object write of the complete
        ciphertext, so a crash leaves either the untouched plaintext object or
        the finished ciphertext object, never a mixture. Re-running is a no-op
        for objects that are already encrypted.
        """
        with self._inner.open(storage_key) as raw:
            if _read_exact(raw, len(MAGIC)) == MAGIC:
                return False
            raw.seek(0)
            self.put(storage_key, raw, "application/octet-stream")
        return True

    def rewrap(self, storage_key: str) -> bool:
        """Re-wrap the object's data key under the active KEK; ``False`` if current."""
        with self._inner.open(storage_key) as raw:
            header = _parse_header(raw)
            if header.key_id == self._wrapper.active_key_id:
                return False
            data_key = self._wrapper.unwrap(
                header.key_id, header.wrapped, _wrap_context(storage_key)
            )
            key_id, wrapped = self._wrapper.wrap(data_key, _wrap_context(storage_key))
            new_header = _build_header(header.chunk_size, key_id, wrapped)
            self._inner.put(storage_key, _PrefixedSource(new_header, raw), _STORED_CONTENT_TYPE)
        return True

    def stored_key_id(self, storage_key: str) -> str | None:
        """KEK id of an encrypted object, ``None`` for a legacy plaintext object."""
        with self._inner.open(storage_key) as raw:
            prefix = _read_exact(raw, len(MAGIC))
            if prefix != MAGIC:
                return None
            return _parse_header(raw, prefix).key_id


class _PrefixedSource:
    def __init__(self, prefix: bytes, source: ByteSource) -> None:
        self._prefix = prefix
        self._source = source

    def read(self, size: int = -1, /) -> bytes:
        if size == 0:
            return b""
        if self._prefix:
            if size < 0 or size >= len(self._prefix):
                head, self._prefix = self._prefix, b""
                if size < 0:
                    return head + self._source.read()
                return head
            head, self._prefix = self._prefix[:size], self._prefix[size:]
            return head
        return self._source.read(size)


__all__ = ["DEFAULT_CHUNK_SIZE", "MAGIC", "EncryptingMediaStore"]
