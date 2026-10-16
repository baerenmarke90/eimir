"""MediaStore interface.

Self-hosted deployments store files on the filesystem, while cloud deployments
use object storage. The application core knows neither implementation.

Two rules apply to every implementation:

- A storage key is NEVER derived from a user-provided filename. A filename
  from a request may contain path components.
- Media is not public. Reads happen through an authorized route or a
  short-lived signed URL.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import timedelta
from typing import BinaryIO, Protocol
from uuid import UUID


class ByteSource(Protocol):
    """The minimal surface required for storage.

    Deliberately not `BinaryIO`: that protocol requires many methods while
    this boundary uses only one. A caller wrapping a bounded or counting
    stream would otherwise need to emulate a full file interface or cast it,
    and such a cast here would incorrectly claim the boundary does not matter.
    """

    def read(self, size: int = -1, /) -> bytes: ...


@dataclass(frozen=True)
class StoredObject:
    storage_key: str
    size: int
    content_type: str


def _validate_variant(variant: str) -> str:
    if "/" in variant or ".." in variant:
        raise ValueError("Invalid variant.")
    return variant


def build_storage_key(space_id: UUID, attachment_id: UUID, variant: str = "original") -> str:
    """Build the storage location of Space-owned media.

        spaces/{spaceUuid}/attachments/{attachmentUuid}/original

    The path is derived exclusively from UUIDs. The original filename remains
    metadata and never becomes part of the path.
    """
    return f"spaces/{space_id}/attachments/{attachment_id}/{_validate_variant(variant)}"


def build_account_storage_key(
    account_id: UUID, attachment_id: UUID, variant: str = "original"
) -> str:
    """Build the storage location of Account-owned media.

        accounts/{accountUuid}/attachments/{attachmentUuid}/original

    Account-global profile media outlives any single Space, so it cannot live
    under a Space prefix whose whole subtree disappears with Space retention.
    The prefix names the owning Account instead; the same UUID-only path rules
    apply.

    A storage location is not an authorization statement. Reads keep running
    through the owning domain rule, which is why this prefix never appears in a
    URL or in a capability.
    """
    return f"accounts/{account_id}/attachments/{attachment_id}/{_validate_variant(variant)}"


class MediaStore(ABC):
    """Storage interface for attachments."""

    @abstractmethod
    def put(self, storage_key: str, data: ByteSource, content_type: str) -> StoredObject:
        """Store a byte stream."""

    @abstractmethod
    def open(self, storage_key: str) -> BinaryIO:
        """Open an object for reading."""

    @abstractmethod
    def delete(self, storage_key: str) -> None:
        """Delete an object. An already missing object is not an error."""

    @abstractmethod
    def exists(self, storage_key: str) -> bool: ...

    def copy(self, source_key: str, target_key: str, content_type: str) -> StoredObject:
        """Copy one object to a second key inside the same store.

        Concrete rather than abstract, and deliberately built from the existing
        ``open``/``put`` pair: every adapter then supports relocation without a
        second provider-specific code path, while a store with a native
        server-side copy can still override this.

        Overwriting an existing target is intended. Relocation has to stay
        idempotent under retry, so a partial earlier attempt is replaced instead
        of being treated as a conflict.
        """
        with self.open(source_key) as source:
            return self.put(target_key, source, content_type)

    @abstractmethod
    def create_read_url(self, storage_key: str, expires_in: timedelta) -> str | None:
        """Create a short-lived read URL when the backend supports one.

        Return None otherwise, in which case the application must serve the
        content itself. A filesystem cannot create signed URLs.
        """
