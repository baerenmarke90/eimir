"""In-memory S3-compatible provider recording exactly what it was asked to store."""

from __future__ import annotations

import httpx


class PrivateS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.content_types: dict[str, str] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = request.url.path
        if request.method == "PUT":
            self.objects[key] = request.content
            self.content_types[key] = request.headers.get("content-type", "")
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
