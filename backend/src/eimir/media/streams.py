"""Bounded byte sources shared by attachment transfer and media processing."""

from __future__ import annotations

from eimir.media.base import ByteSource

CHUNK_SIZE = 64 * 1024


class ByteLimitExceededError(ValueError):
    """An untrusted source exceeded its authoritative byte limit."""


class BoundedSource:
    """Enforce the limit while an adapter consumes bytes, including unknown lengths."""

    def __init__(self, source: ByteSource, limit: int) -> None:
        self.source = source
        self.limit = limit
        self.received = 0

    def read(self, size: int = -1, /) -> bytes:
        remaining = self.limit - self.received
        requested = remaining + 1 if size < 0 else min(size, remaining + 1)
        chunk = self.source.read(requested)
        self.received += len(chunk)
        if self.received > self.limit:
            raise ByteLimitExceededError("Media byte limit exceeded.")
        return chunk
