"""One error format for every error.

A client that wants to display an error message needs exactly one path. This
is verified through a real app with real routes rather than against the
handler functions, because handler registration itself is part of what can go
wrong.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from eimir.api.errors import register_error_handlers
from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    UnauthenticatedError,
    ValidationError,
)

REQUIRED_FIELDS = {"type", "title", "status", "detail", "code"}


class Body(BaseModel):
    title: str


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/not-found")
    def _not_found() -> None:
        raise NotFoundError("Memory not found.", "MEMORY_NOT_FOUND")

    @app.get("/api/v1/domain-not-found")
    def _api_domain_not_found() -> None:
        raise NotFoundError("Space not found.", "SPACE_NOT_FOUND")

    @app.get("/forbidden")
    def _forbidden() -> None:
        raise ForbiddenError("Not allowed.", "SPACE_ACCESS_DENIED")

    @app.get("/unauthenticated")
    def _unauth() -> None:
        raise UnauthenticatedError("Sign in.", ErrorCode.AUTHENTICATION_REQUIRED)

    @app.get("/conflict")
    def _conflict() -> None:
        raise ConflictError("Changed meanwhile.", ErrorCode.VERSION_CONFLICT)

    @app.get("/invalid")
    def _invalid() -> None:
        raise ValidationError("The title must not be empty.", "MEMORY_TITLE_REQUIRED")

    @app.get("/boom")
    def _boom() -> None:
        raise RuntimeError("Connection to postgres://user:secret@host failed")

    @app.post("/body")
    def _body(body: Body) -> dict[str, str]:
        return {"title": body.title}

    return TestClient(app, raise_server_exceptions=False)


class TestFormat:
    @pytest.mark.parametrize(
        ("path", "status", "problem_type", "code"),
        [
            ("/not-found", 404, "not_found", "MEMORY_NOT_FOUND"),
            ("/forbidden", 403, "forbidden", "SPACE_ACCESS_DENIED"),
            ("/unauthenticated", 401, "unauthenticated", "AUTHENTICATION_REQUIRED"),
            ("/conflict", 409, "conflict", "VERSION_CONFLICT"),
            ("/invalid", 422, "validation_error", "MEMORY_TITLE_REQUIRED"),
        ],
    )
    def test_domain_errors(
        self,
        client: TestClient,
        path: str,
        status: int,
        problem_type: str,
        code: str,
    ) -> None:
        response = client.get(path)
        assert response.status_code == status
        body = response.json()
        assert set(body) == REQUIRED_FIELDS
        assert body["type"] == problem_type
        assert body["status"] == status
        assert body["code"] == code

    def test_unknown_route(self, client: TestClient) -> None:
        response = client.get("/does-not-exist")
        assert response.status_code == 404
        assert set(response.json()) == REQUIRED_FIELDS

    def test_invalid_body(self, client: TestClient) -> None:
        response = client.post("/body", json={})
        assert response.status_code == 422
        body = response.json()
        assert body["code"] == ErrorCode.VALIDATION_FAILED
        assert "title" in body["detail"]


class TestApiRouteMisses:
    def test_unknown_api_route_has_problem_details(self, client: TestClient) -> None:
        response = client.get("/api/v1/does-not-exist")
        assert response.status_code == 404
        assert response.json() == {
            "type": "not_found",
            "title": "Not found",
            "status": 404,
            "detail": "Not Found",
            "code": "HTTP_404",
        }

    def test_route_miss_with_extra_path_segment_has_problem_details(
        self, client: TestClient
    ) -> None:
        response = client.get("/api/v1/domain-not-found/unexpected-segment")
        assert response.status_code == 404
        assert set(response.json()) == REQUIRED_FIELDS
        assert response.json()["code"] == "HTTP_404"

    def test_domain_api_404_preserves_domain_code(self, client: TestClient) -> None:
        response = client.get("/api/v1/domain-not-found")
        assert response.status_code == 404
        assert set(response.json()) == REQUIRED_FIELDS
        assert response.json()["code"] == "SPACE_NOT_FOUND"
        assert response.json()["detail"] == "Space not found."


class TestNoInternalDetails:
    def test_unexpected_error_becomes_neutral_500(self, client: TestClient) -> None:
        response = client.get("/boom")
        assert response.status_code == 500
        assert response.json()["code"] == ErrorCode.INTERNAL

    def test_exception_text_does_not_reach_client(self, client: TestClient) -> None:
        """An exception message may contain credentials and paths."""
        raw_text = client.get("/boom").text
        for forbidden in ("secret", "postgres://", "RuntimeError", "Traceback"):
            assert forbidden not in raw_text

    def test_submitted_values_are_not_reflected(self, client: TestClient) -> None:
        """An invalid value may be sensitive; the field name is sufficient."""
        raw_text = client.post("/body", json={"title": 12345, "x": "secret-value"}).text
        assert "secret-value" not in raw_text
