"""HTTP media ranges preserve byte integrity and close all stream ownership."""

import io

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Route
from starlette.testclient import TestClient

from eimir.attachments.content import content_response


@pytest.mark.parametrize(
    ("selected", "status", "body", "content_range"),
    [
        (None, 200, b"0123456789", None),
        ("bytes=2-5", 206, b"2345", "bytes 2-5/10"),
        ("bytes=8-", 206, b"89", "bytes 8-9/10"),
        ("bytes=-3", 206, b"789", "bytes 7-9/10"),
        ("bytes=-100", 206, b"0123456789", "bytes 0-9/10"),
        ("bytes=8-100", 206, b"89", "bytes 8-9/10"),
        ("bytes=10-", 416, b"", "bytes */10"),
        ("bytes=5-2", 416, b"", "bytes */10"),
        ("bytes=-0", 416, b"", "bytes */10"),
        ("bytes=0-1,5-6", 416, b"", "bytes */10"),
        ("bytes=-", 416, b"", "bytes */10"),
        ("bytes=" + "9" * 256 + "-", 416, b"", "bytes */10"),
    ],
)
def test_single_range_delivery_and_closed_source(
    selected: str | None, status: int, body: bytes, content_range: str | None
) -> None:
    source = io.BytesIO(b"0123456789")

    async def read(request: Request):  # type: ignore[no-untyped-def]
        return content_response(
            source,
            media_type="video/mp4",
            filename="attachment",
            range_header=request.headers.get("range"),
        )

    with TestClient(Starlette(routes=[Route("/content", read)])) as client:
        result = client.get("/content", headers={"Range": selected} if selected else {})
    assert result.status_code == status
    assert result.content == body
    assert result.headers.get("content-range") == content_range
    assert result.headers["cache-control"] == "private, no-store"
    assert result.headers["referrer-policy"] == "no-referrer"
    assert source.closed


def test_first_byte_failure_does_not_start_a_success_response() -> None:
    class Damaged(io.BytesIO):
        def read(self, count: int = -1, /) -> bytes:
            raise OSError("Unauthenticated media block.")

    source = Damaged(b"1234")
    with pytest.raises(OSError, match="Unauthenticated"):
        content_response(source, media_type="video/mp4", filename="attachment")
    assert source.closed
