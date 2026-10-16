"""Problem-details style API error output.

Every error uses one response format. A client that needs to display an error
therefore has exactly one parsing path.

    {
      "type": "validation_error",
      "title": "Invalid request",
      "status": 422,
      "detail": "The title must not be empty.",
      "code": "MEMORY_TITLE_REQUIRED"
    }
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from eimir.api.schema import ApiModel
from eimir.core.errors import DomainError, ErrorCode

log = logging.getLogger(__name__)

_API_V1_PREFIX = "/api/v1"


class ProblemDetails(ApiModel):
    """Body of every API error response.

    The same model produces the runtime response and describes it in the
    OpenAPI contract. Maintaining those separately would eventually make the
    contract describe an error shape that the runtime does not return.
    """

    type: str
    title: str
    status: int
    detail: str
    code: str


_STATUS_TYPES: dict[int, tuple[str, str]] = {
    400: ("bad_request", "Bad request"),
    401: ("unauthenticated", "Authentication required"),
    403: ("forbidden", "Not allowed"),
    404: ("not_found", "Not found"),
    405: ("method_not_allowed", "Method not allowed"),
    409: ("conflict", "Conflict"),
    422: ("validation_error", "Invalid request"),
    429: ("rate_limited", "Too many requests"),
}

_PROBLEM_RESPONSE_DESCRIPTIONS: dict[int, str] = {
    400: "The request is syntactically valid but cannot be processed in this form.",
    401: "Authentication is missing, invalid, or the session has expired.",
    403: "The caller is authenticated but is not authorized for this operation.",
    404: "The resource does not exist or is not visible to the caller.",
    405: "The HTTP method is not supported for this resource.",
    409: "The request conflicts with the current state of the resource.",
    413: "The content exceeds the server-side size limit.",
    415: "The media type is not on the allowlist.",
    422: "Request parameters or domain inputs are invalid.",
    429: "Too many attempts occurred within the allowed time window.",
    503: "A capability required for this operation is not configured on this instance.",
}


def problem_responses(
    *status_codes: int,
    descriptions: Mapping[int, str] | None = None,
) -> dict[int | str, dict[str, Any]]:
    """Build reusable OpenAPI responses for known ``ProblemDetails`` errors.

    A route lists only errors that its production path can actually produce.
    This keeps the contract complete without inventing possible errors. An
    explicit 422 also replaces FastAPI's default ``HTTPValidationError`` with
    the actual runtime model.
    """
    overrides = descriptions or {}
    responses: dict[int | str, dict[str, Any]] = {}
    for status_code in status_codes:
        standard = _PROBLEM_RESPONSE_DESCRIPTIONS.get(status_code)
        if standard is None:
            raise ValueError(f"No ProblemDetails OpenAPI description for HTTP {status_code}.")
        responses[status_code] = {
            "model": ProblemDetails,
            "description": overrides.get(status_code, standard),
        }
    return responses


def problem(status: int, type_: str, title: str, detail: str, code: str) -> JSONResponse:
    body = ProblemDetails(type=type_, title=title, status=status, detail=detail, code=code)
    return JSONResponse(status_code=status, content=body.model_dump())


def _is_api_v1_path(path: str) -> bool:
    """Return whether a path is an actual API-v1 path for route-miss handling."""
    return path == _API_V1_PREFIX or path.startswith(f"{_API_V1_PREFIX}/")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError) -> JSONResponse:
        response = problem(exc.status, exc.type, exc.title, exc.detail, exc.code)
        if exc.retry_after_seconds is not None:
            # Standard HTTP signal (RFC 9110 §10.2.3), not a body-shape change:
            # a defensive fallback for a client that still raced past its own
            # server-authoritative cooldown state.
            response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Field paths are useful to the caller; submitted values are
        # intentionally not reflected because they may be sensitive.
        fields = ", ".join(
            ".".join(str(part) for part in error.get("loc", ())[1:]) for error in exc.errors()
        )
        detail = f"Invalid fields: {fields}" if fields else "Invalid request body."
        return problem(
            422,
            "validation_error",
            "Invalid request",
            detail,
            ErrorCode.VALIDATION_FAILED,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # A router miss never reaches a domain route and therefore cannot
        # produce a NotFoundError with a domain code. For /api/v1, normalize
        # the framework 404 explicitly as ProblemDetails. Domain 404 errors
        # continue to pass through _domain.
        if exc.status_code == 404 and _is_api_v1_path(request.url.path):
            return problem(404, "not_found", "Not found", str(exc.detail), "HTTP_404")

        # Preserve the existing behavior for all other framework errors and
        # for paths outside /api/v1.
        type_, title = _STATUS_TYPES.get(exc.status_code, ("error", "Error"))
        return problem(
            exc.status_code,
            type_,
            title,
            str(exc.detail),
            f"HTTP_{exc.status_code}",
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # The underlying cause belongs in the log, not the response: exception
        # messages can contain paths, queries, or user content.
        log.exception("unhandled error", extra={"path": request.url.path, "method": request.method})
        return problem(
            500,
            "internal_error",
            "Internal error",
            "An unexpected error occurred.",
            ErrorCode.INTERNAL,
        )
