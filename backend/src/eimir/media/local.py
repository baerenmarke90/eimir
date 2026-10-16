"""Filesystem MediaStore for self-hosted deployments and development."""

from __future__ import annotations

import os
import shutil
import tempfile
from datetime import timedelta
from pathlib import Path
from typing import BinaryIO

from eimir.media.base import ByteSource, MediaStore, StoredObject


class LocalMediaStore(MediaStore):
    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, storage_key: str) -> Path:
        root = os.path.realpath(self._root)
        target = os.path.realpath(os.path.join(root, storage_key))
        # Normalize through realpath before checking containment so both parent
        # traversal and symlink escapes remain outside the trusted root.
        if target != root and not target.startswith(root + os.sep):
            raise ValueError("Storage key escapes the storage root.")
        return Path(target)

    def put(self, storage_key: str, data: ByteSource, content_type: str) -> StoredObject:
        target = self._path(storage_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Write next to the target and rename over it: a crash or a failing
        # source leaves the previous object untouched instead of a truncated
        # one. Re-encryption of an existing object depends on this.
        descriptor, temporary = tempfile.mkstemp(dir=target.parent, prefix=".eimir-tmp-")
        try:
            with os.fdopen(descriptor, "wb") as file:
                shutil.copyfileobj(data, file)
            os.replace(temporary, target)
        except BaseException:
            Path(temporary).unlink(missing_ok=True)
            raise
        return StoredObject(
            storage_key=storage_key,
            size=target.stat().st_size,
            content_type=content_type,
        )

    def open(self, storage_key: str) -> BinaryIO:
        return self._path(storage_key).open("rb")

    def delete(self, storage_key: str) -> None:
        self._path(storage_key).unlink(missing_ok=True)

    def exists(self, storage_key: str) -> bool:
        return self._path(storage_key).is_file()

    def create_read_url(self, storage_key: str, expires_in: timedelta) -> str | None:
        # A filesystem cannot create signed URLs. The application serves the
        # content through an authorized route.
        return None
