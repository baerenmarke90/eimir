"""Ordinary requests are bounded before FastAPI buffers their bodies."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from eimir.api.transport import RequestBodyLimitMiddleware
from eimir.main import create_app


def bounded_client(max_size: int = 8) -> TestClient:
    app = FastAPI()
    app.add_middleware(RequestBodyLimitMiddleware, max_size=max_size)

    @app.post("/api/v1/spaces/{space_id}/memories")
    async def create_memory(request: Request, space_id: str) -> dict[str, int]:
        del space_id
        return {"size": len(await request.body())}

    @app.put("/api/v1/spaces/{space_id}/attachments/{attachment_id}/content")
    async def upload(request: Request, space_id: str, attachment_id: str) -> dict[str, int]:
        del space_id, attachment_id
        return {"size": sum([len(chunk) async for chunk in request.stream()])}

    @app.post("/api/v1/spaces/{space_id}/transfer/imports")
    async def import_archive(request: Request, space_id: str) -> dict[str, int]:
        del space_id
        return {"size": sum([len(chunk) async for chunk in request.stream()])}

    return TestClient(app, raise_server_exceptions=False)


def assert_too_large(response_status: int, response_body: dict[str, object]) -> None:
    assert response_status == 413
    assert response_body == {
        "type": "payload_too_large",
        "title": "Payload too large",
        "status": 413,
        "detail": "The request body exceeds the supported size limit.",
        "code": "REQUEST_BODY_TOO_LARGE",
    }


def test_exact_boundary_and_declared_size_rejection() -> None:
    client = bounded_client()
    path = "/api/v1/spaces/space/memories"

    assert client.post(path, content=b"x" * 8).json() == {"size": 8}
    response = client.post(path, content=b"x" * 9)
    assert_too_large(response.status_code, response.json())


def test_stream_without_content_length_is_stopped_before_json_buffering() -> None:
    client = bounded_client()

    def chunks() -> Iterator[bytes]:
        yield b"x" * 5
        yield b"x" * 4

    response = client.post("/api/v1/spaces/space/memories", content=chunks())
    assert_too_large(response.status_code, response.json())


def test_understated_content_length_cannot_bypass_receive_limit() -> None:
    response = bounded_client().post(
        "/api/v1/spaces/space/memories",
        content=b"x" * 9,
        headers={"Content-Length": "1"},
    )
    assert_too_large(response.status_code, response.json())


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", "/api/v1/spaces/space/attachments/attachment/content"),
        ("POST", "/api/v1/spaces/space/transfer/imports"),
    ],
)
def test_existing_streaming_endpoints_retain_their_own_limits(method: str, path: str) -> None:
    response = bounded_client().request(method, path, content=b"x" * 9)
    assert response.status_code == 200
    assert response.json() == {"size": 9}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/spaces/space/attachments/attachment/content"),
        ("PUT", "/api/v1/spaces/space/transfer/imports"),
        ("PUT", "/api/v1/spaces/space/attachments/attachment/content/extra"),
    ],
)
def test_exemptions_require_exact_method_and_path(method: str, path: str) -> None:
    response = bounded_client().request(method, path, content=b"x" * 9)
    assert_too_large(response.status_code, response.json())


def test_real_app_rejects_oversized_json_before_auth_or_parsing() -> None:
    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.post(
        "/api/v1/auth/sign-in",
        content=b"{}",
        headers={"Content-Length": str(8 * 1024 * 1024 + 1)},
    )

    assert_too_large(response.status_code, response.json())
    assert response.headers["X-Request-ID"]
