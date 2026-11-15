"""Resource and integrity guarantees for large-media storage adapters."""

from __future__ import annotations

import hashlib
import io
import tracemalloc

import httpx
import pytest

from eimir.media.s3 import S3MediaStore
from eimir.media.streams import BoundedSource, ByteLimitExceededError
from tests.support.s3_reads import object_read


def store_with(transport: httpx.BaseTransport) -> S3MediaStore:
    return S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-test-1",
        bucket="private",
        access_key_id="test-access",
        secret_access_key="test-secret",
        client=httpx.Client(transport=transport),
    )


def test_boundary_checks_unknown_length_sources_before_publication() -> None:
    limited = BoundedSource(io.BytesIO(b"12345"), 4)
    assert limited.read(3) == b"123"
    with pytest.raises(ByteLimitExceededError):
        limited.read(1000)


def test_exact_limit_and_end_of_stream() -> None:
    limited = BoundedSource(io.BytesIO(b"1234"), 4)
    assert limited.read() == b"1234"
    assert limited.read(64) == b""


def test_s3_seeks_only_fetch_bounded_ranges_and_detect_mid_read_replacement() -> None:
    objects = {"/private/video": b"a" * (3 * 1024 * 1024)}
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return object_read(request, objects)

    store = store_with(httpx.MockTransport(handle))
    with store.open("video") as source:
        assert [r.method for r in requests] == ["HEAD"]
        source.seek(-8, io.SEEK_END)
        assert source.read(8) == b"a" * 8
        assert requests[-1].headers["range"] == "bytes=2097152-3145727"
        objects["/private/video"] = b"b" * (3 * 1024 * 1024)
        source.seek(0)
        with pytest.raises(OSError, match="invalid or changed"):
            source.read(8)


@pytest.mark.parametrize("failure", ["ignored", "truncated", "oversized", "wrong_total"])
def test_untrusted_provider_ranges_fail_closed(failure: str) -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            return httpx.Response(200, headers={"content-length": "4", "etag": '"stable"'})
        headers = {"content-length": "4", "content-range": "bytes 0-3/4"}
        if failure == "wrong_total":
            headers["content-range"] = "bytes 0-3/8"
        body = b"123" if failure == "truncated" else b"12345" if failure == "oversized" else b"1234"
        return httpx.Response(200 if failure == "ignored" else 206, headers=headers, content=body)

    with store_with(httpx.MockTransport(handle)).open("video") as source, pytest.raises(OSError):
        source.read(1)


def test_s3_upload_peak_memory_does_not_scale_with_object_size() -> None:
    size = 32 * 1024 * 1024

    class GeneratedSource:
        remaining = size

        def read(self, count: int = -1, /) -> bytes:
            assert 0 < count <= 64 * 1024
            chunk = b"v" * min(count, self.remaining)
            self.remaining -= len(chunk)
            return chunk

    class StreamingProvider(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            digest = hashlib.sha256()
            received = 0
            for chunk in request.stream:
                assert len(chunk) <= 64 * 1024
                received += len(chunk)
                digest.update(chunk)
            assert received == size
            assert request.headers["content-length"] == str(size)
            assert request.headers["x-amz-content-sha256"] == digest.hexdigest()
            return httpx.Response(200)

    store = store_with(StreamingProvider())
    tracemalloc.start()
    try:
        result = store.put("video", GeneratedSource(), "video/mp4")
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert result.size == size
    assert peak < 4 * 1024 * 1024
