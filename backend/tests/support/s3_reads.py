"""The same S3 HEAD/range contract for in-memory provider fixtures."""

import hashlib
from collections.abc import Mapping

import httpx


def object_read(request: httpx.Request, objects: Mapping[str, bytes]) -> httpx.Response:
    if request.url.path not in objects:
        return httpx.Response(404)
    content = objects[request.url.path]
    etag = '"' + hashlib.sha256(content).hexdigest() + '"'
    headers = {"Content-Length": str(len(content)), "ETag": etag}
    if request.method == "HEAD":
        return httpx.Response(200, headers=headers)
    if request.headers.get("if-match", etag) != etag:
        return httpx.Response(412)
    selected = request.headers.get("range")
    if selected:
        start, end = map(int, selected.removeprefix("bytes=").split("-"))
        body = content[start : end + 1]
        headers["Content-Length"] = str(len(body))
        headers["Content-Range"] = f"bytes {start}-{end}/{len(content)}"
        return httpx.Response(206, headers=headers, content=body)
    return httpx.Response(200, headers=headers, content=content)
