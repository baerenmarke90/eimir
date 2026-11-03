"""Authorized, bounded delivery shared by bearer and video-grant reads."""

from __future__ import annotations

import io
import re
from collections.abc import Iterator
from typing import BinaryIO

from starlette.background import BackgroundTask
from starlette.responses import Response, StreamingResponse

CHUNK_SIZE = 64 * 1024
_RANGE = re.compile(r"bytes=(\d*)-(\d*)\Z", re.ASCII)


def _bounds(value: str | None, size: int) -> tuple[int, int] | None:
    if value is None:
        return (0, size - 1)
    match = _RANGE.fullmatch(value) if len(value) <= 128 else None
    if match is None or size == 0:
        return None
    left, right = match.groups()
    if not left:
        if not right or int(right) <= 0:
            return None
        return max(0, size - int(right)), size - 1
    start = int(left)
    end = int(right) if right else size - 1
    if start >= size or end < start:
        return None
    return start, min(end, size - 1)


def content_response(
    source: BinaryIO,
    *,
    media_type: str,
    filename: str,
    range_header: str | None = None,
) -> Response:
    """Consume an already-authorized seekable source; always close its ownership."""
    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
    }
    try:
        size = source.seek(0, io.SEEK_END)
        selected = _bounds(range_header, size)
        if selected is None:
            source.close()
            return Response(
                status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"}
            )
        start, end = selected
        length = end - start + 1
        source.seek(start)
        first = source.read(min(length, CHUNK_SIZE))
        if length and not first:
            raise OSError("Media content is truncated.")
    except BaseException:
        source.close()
        raise

    def chunks() -> Iterator[bytes]:
        try:
            remaining = length
            chunk = first
            while remaining:
                if not chunk or len(chunk) > remaining:
                    raise OSError("Media content is truncated or oversized.")
                yield chunk
                remaining -= len(chunk)
                if remaining:
                    chunk = source.read(min(remaining, CHUNK_SIZE))
        finally:
            source.close()

    headers["Content-Length"] = str(length)
    if range_header is not None:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(
        chunks(),
        status_code=206 if range_header is not None else 200,
        media_type=media_type,
        headers=headers,
        background=BackgroundTask(source.close),
    )
