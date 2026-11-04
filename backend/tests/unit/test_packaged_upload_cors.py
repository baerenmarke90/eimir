"""The streaming exception never opens ordinary API routes or other origins."""

from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient

from eimir.api.transport import PackagedUploadCorsMiddleware

PATH = "/api/v1/spaces/space/attachments/clip/content"


def test_packaged_binary_cors_is_narrow_and_keeps_exact_file_bytes() -> None:
    app = FastAPI()
    app.add_middleware(PackagedUploadCorsMiddleware)
    received = bytearray()

    @app.put(PATH)
    async def upload(request: Request) -> Response:
        async for chunk in request.stream():
            received.extend(chunk)
        return Response(status_code=204)

    with TestClient(app) as client:
        headers = {
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        }
        assert (
            client.options(PATH, headers=headers).headers["access-control-allow-origin"]
            == "https://localhost"
        )
        body = bytes(range(256)) * 8192
        response = client.put(PATH, content=body, headers={"Origin": "https://localhost"})
        assert response.status_code == 204
        assert received == body
        assert "access-control-allow-credentials" not in response.headers
        assert (
            client.options(
                PATH, headers={**headers, "Origin": "https://untrusted.example"}
            ).status_code
            == 400
        )
        ordinary = client.options("/api/v1/account/device-context", headers=headers)
        assert "access-control-allow-origin" not in ordinary.headers
        assert (
            client.options(
                PATH, headers={**headers, "Access-Control-Request-Method": "POST"}
            ).status_code
            == 400
        )
