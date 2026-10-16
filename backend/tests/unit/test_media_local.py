"""Filesystem-backed media storage.

The focus is on path handling: a storage key that escapes the root directory
would allow arbitrary server files to be read or written.
"""

from __future__ import annotations

import io
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest

from eimir.core.ids import new_id
from eimir.media.base import build_account_storage_key, build_storage_key
from eimir.media.local import LocalMediaStore


@pytest.fixture
def store(tmp_path: Path) -> LocalMediaStore:
    return LocalMediaStore(tmp_path / "media")


class TestStorageKey:
    def test_consists_only_of_uuids(self) -> None:
        space, attachment = new_id(), new_id()
        assert build_storage_key(space, attachment) == (
            f"spaces/{space}/attachments/{attachment}/original"
        )

    def test_contains_no_user_filename(self) -> None:
        """A filename from a request may contain path components."""
        key = build_storage_key(new_id(), new_id())
        assert ".." not in key
        assert key.count("/") == 4

    def test_rejects_escaping_variant(self) -> None:
        for malicious in ["../../etc/passwd", "a/b", ".."]:
            with pytest.raises(ValueError):
                build_storage_key(new_id(), new_id(), malicious)


class TestAccountStorageKey:
    def test_account_owned_media_lives_outside_every_space_prefix(self) -> None:
        """Account-global profile media must survive Space retention."""
        account, attachment = new_id(), new_id()
        key = build_account_storage_key(account, attachment)

        assert key == f"accounts/{account}/attachments/{attachment}/original"
        assert not key.startswith("spaces/")
        assert key.count("/") == 4

    def test_rejects_escaping_variant(self) -> None:
        for malicious in ["../../etc/passwd", "a/b", ".."]:
            with pytest.raises(ValueError):
                build_account_storage_key(new_id(), new_id(), malicious)


class TestStorage:
    def test_write_read_delete(self, store: LocalMediaStore) -> None:
        key = build_storage_key(new_id(), new_id())
        stored = store.put(key, io.BytesIO(b"inhalt"), "image/jpeg")

        assert stored.size == 6
        assert store.exists(key)
        with store.open(key) as file:
            assert file.read() == b"inhalt"

        store.delete(key)
        assert not store.exists(key)

    def test_deleting_missing_object_is_not_an_error(
        self,
        store: LocalMediaStore,
    ) -> None:
        store.delete(build_storage_key(new_id(), new_id()))

    def test_filesystem_cannot_create_signed_url(
        self,
        store: LocalMediaStore,
    ) -> None:
        """Returns None; the application serves the content itself."""
        key = build_storage_key(new_id(), new_id())
        assert store.create_read_url(key, timedelta(minutes=5)) is None


class TestPathEscape:
    @pytest.mark.parametrize(
        "malicious_key",
        [
            "../ausserhalb",
            "../../etc/passwd",
            "spaces/../../../etc/passwd",
            "a/b/../../../../tmp/gekapert",
        ],
    )
    def test_write_outside_root_is_rejected(
        self,
        store: LocalMediaStore,
        malicious_key: str,
    ) -> None:
        with pytest.raises(ValueError):
            store.put(malicious_key, io.BytesIO(b"x"), "text/plain")

    @pytest.mark.parametrize("malicious_key", ["../ausserhalb", "../../etc/passwd"])
    def test_read_outside_root_is_rejected(
        self,
        store: LocalMediaStore,
        malicious_key: str,
    ) -> None:
        with pytest.raises(ValueError):
            store.open(malicious_key)

    def test_delete_outside_root_is_rejected(self, store: LocalMediaStore) -> None:
        with pytest.raises(ValueError):
            store.delete("../../etc/passwd")

    def test_absolute_path_is_rejected(self, store: LocalMediaStore) -> None:
        """An absolute path would replace the root during path composition."""
        with pytest.raises(ValueError):
            store.put("/etc/gekapert", io.BytesIO(b"x"), "text/plain")

    def test_nothing_is_written_outside_root(self, tmp_path: Path) -> None:
        root = tmp_path / "media"
        store = LocalMediaStore(root)
        key = build_storage_key(UUID(int=1), UUID(int=2))
        store.put(key, io.BytesIO(b"x"), "text/plain")

        created = [path for path in tmp_path.rglob("*") if path.is_file()]
        assert created
        assert all(path.is_relative_to(root) for path in created)
