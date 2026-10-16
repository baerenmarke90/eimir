"""Shared MediaStore contract for Local and S3 backends."""

from __future__ import annotations

import io
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from eimir.core.ids import new_id
from eimir.media.base import MediaStore, build_account_storage_key, build_storage_key
from eimir.media.local import LocalMediaStore
from eimir.media.s3 import S3MediaStore


class MemoryS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = request.url.path
        if request.method == "PUT":
            self.objects[key] = request.content
            return httpx.Response(200)
        if request.method == "HEAD":
            return httpx.Response(200 if key in self.objects else 404)
        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(404)
            return httpx.Response(200, content=self.objects[key])
        if request.method == "DELETE":
            self.objects.pop(key, None)
            return httpx.Response(204)
        return httpx.Response(405)


@pytest.fixture(params=["local", "s3"])
def store(request: pytest.FixtureRequest, tmp_path: Path) -> MediaStore:
    if request.param == "local":
        return LocalMediaStore(tmp_path / "media")

    provider = MemoryS3()
    client = httpx.Client(transport=httpx.MockTransport(provider.handle))
    return S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-central-1",
        bucket="contract-private",
        access_key_id="AKIATEST",
        secret_access_key="test-secret",
        client=client,
        clock=lambda: datetime(2026, 8, 25, 17, 0, tzinfo=UTC),
    )


def test_put_open_exists_delete_have_the_same_semantics(store: MediaStore) -> None:
    key = build_storage_key(new_id(), new_id())
    stored = store.put(key, io.BytesIO(b"inhalt"), "image/jpeg")

    assert stored.storage_key == key
    assert stored.size == 6
    assert stored.content_type == "image/jpeg"
    assert store.exists(key)
    with store.open(key) as source:
        assert source.read() == b"inhalt"

    store.delete(key)
    assert not store.exists(key)


def test_delete_missing_object_is_idempotent(store: MediaStore) -> None:
    store.delete(build_storage_key(new_id(), new_id()))


def test_copy_moves_bytes_between_storage_homes_and_is_repeatable(store: MediaStore) -> None:
    """Relocation must converge on retry rather than reject an existing target."""
    account_id, attachment_id = new_id(), new_id()
    origin = build_storage_key(new_id(), attachment_id)
    target = build_account_storage_key(account_id, attachment_id)
    store.put(origin, io.BytesIO(b"inhalt"), "image/jpeg")

    copied = store.copy(origin, target, "image/jpeg")

    assert copied.storage_key == target
    assert store.exists(origin)
    with store.open(target) as source:
        assert source.read() == b"inhalt"

    store.copy(origin, target, "image/jpeg")
    with store.open(target) as source:
        assert source.read() == b"inhalt"


def test_operations_are_scoped_to_exact_storage_key(store: MediaStore) -> None:
    first = build_storage_key(new_id(), new_id())
    second = build_storage_key(new_id(), new_id())
    store.put(first, io.BytesIO(b"eins"), "image/jpeg")
    store.put(second, io.BytesIO(b"zwei"), "image/jpeg")

    store.delete(first)

    assert not store.exists(first)
    assert store.exists(second)
    with store.open(second) as source:
        assert source.read() == b"zwei"
