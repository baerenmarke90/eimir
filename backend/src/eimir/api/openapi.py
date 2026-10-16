"""OpenAPI adjustments for the actual eimir. HTTP contract.

FastAPI automatically adds a 422 response with ``HTTPValidationError`` to
routes that have path/body parameters. At runtime, eimir. exclusively
returns ``ProblemDetails``. Some automatically added 422 responses are also
unreachable for IDs intentionally accepted as ``str``: malformed IDs become
semantic 404 responses for privacy reasons.

Actual 422 paths are documented explicitly on the route with
``ProblemDetails``. Only remaining FastAPI defaults are removed here.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

_HTTP_VALIDATION_REF = "#/components/schemas/HTTPValidationError"
_VALIDATION_ERROR_REF = "#/components/schemas/ValidationError"


def _response_schema_ref(response: dict[str, Any]) -> str | None:
    schema = response.get("content", {}).get("application/json", {}).get("schema", {})
    ref = schema.get("$ref")
    return ref if isinstance(ref, str) else None


def _paths_reference(schema: dict[str, Any], ref: str) -> bool:
    """Return whether any operation still references a schema."""
    stack: list[Any] = [schema.get("paths", {})]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            if current.get("$ref") == ref:
                return True
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    return False


def _remove_implicit_fastapi_validation(schema: dict[str, Any]) -> None:
    paths = schema.get("paths", {})
    if isinstance(paths, dict):
        for path_item in paths.values():
            if not isinstance(path_item, dict):
                continue
            for operation in path_item.values():
                if not isinstance(operation, dict):
                    continue
                responses = operation.get("responses")
                if not isinstance(responses, dict):
                    continue
                implicit = responses.get("422")
                if (
                    isinstance(implicit, dict)
                    and _response_schema_ref(implicit) == _HTTP_VALIDATION_REF
                ):
                    del responses["422"]

    schemas = schema.get("components", {}).get("schemas", {})
    if isinstance(schemas, dict):
        if not _paths_reference(schema, _HTTP_VALIDATION_REF):
            schemas.pop("HTTPValidationError", None)
        if not _paths_reference(schema, _VALIDATION_ERROR_REF):
            schemas.pop("ValidationError", None)


class EimirFastAPI(FastAPI):
    """FastAPI with eimir.'s normalized production error contract."""

    def openapi(self) -> dict[str, Any]:
        schema = super().openapi()
        _remove_implicit_fastapi_validation(schema)
        return schema
