"""The OpenAPI contract describes the actual v1 API error paths."""

from __future__ import annotations

from typing import Any

from eimir.main import create_app

PROBLEM_DETAILS_REF = "#/components/schemas/ProblemDetails"
READINESS_REF = "#/components/schemas/Readiness"

EXPECTED_PROBLEM_RESPONSES: dict[tuple[str, str], set[int]] = {
    ("/api/v1/auth/register", "post"): {403, 409, 422, 429},
    ("/api/v1/auth/sign-in", "post"): {401, 403, 422, 429},
    ("/api/v1/auth/refresh", "post"): {401, 422, 429},
    ("/api/v1/auth/sign-out", "post"): {401},
    ("/api/v1/auth/password", "post"): {401, 403, 422},
    ("/api/v1/auth/me", "get"): {401},
    # 503: instances without a mail transport (EIMIR_MAIL_TRANSPORT=none) cannot
    # offer this operation. The error occurs while resolving the mail dependency.
    ("/api/v1/auth/magic-link/request", "post"): {422, 429, 503},
    ("/api/v1/auth/magic-link/consume", "post"): {422},
    # 403: no self-service signup on this deployment, or registration disabled
    # when the proof would create an Account. 503: no mail transport (request)
    # or maintenance (consume).
    ("/api/v1/auth/signup/request", "post"): {403, 422, 429, 503},
    ("/api/v1/auth/signup/consume", "post"): {403, 422, 429, 503},
    ("/api/v1/spaces", "post"): {401, 409},
    ("/api/v1/auth/email/verification/request", "post"): {401, 429, 503},
    ("/api/v1/auth/email/verification/confirm", "post"): {422},
    ("/api/v1/auth/recovery/request", "post"): {403, 422, 429, 503},
    ("/api/v1/auth/recovery/consume", "post"): {403, 422},
    ("/api/v1/auth/oidc/{connectionId}/start", "post"): {422, 429},
    ("/api/v1/auth/oidc/{connectionId}/link", "post"): {401, 422, 429},
    ("/api/v1/auth/oidc/{connectionId}/callback", "post"): {401, 409, 422},
    ("/api/v1/auth/passkeys/registration/start", "post"): {401},
    ("/api/v1/auth/passkeys/registration/finish", "post"): {401, 422},
    ("/api/v1/auth/passkeys/authentication/start", "post"): {422, 429},
    ("/api/v1/auth/passkeys/authentication/finish", "post"): {401, 422},
    ("/api/v1/spaces/{spaceId}/invitations", "post"): {401, 404, 409},
    ("/api/v1/spaces/{spaceId}/invitations", "get"): {401, 404},
    ("/api/v1/spaces/{spaceId}/invitations/{invitationId}", "delete"): {401, 404},
    ("/api/v1/invitations/accept", "post"): {401, 409, 422},
    ("/api/v1/spaces/{spaceId}", "get"): {401, 404},
    ("/api/v1/spaces/{spaceId}/presence", "get"): {401, 404},
    ("/api/v1/spaces/{spaceId}/presence", "post"): {401, 404},
    ("/api/v1/spaces/{spaceId}/profile", "get"): {401, 404},
    ("/api/v1/spaces/{spaceId}/profile", "put"): {401, 404, 409, 422},
}


def _response_schema(response: dict[str, Any]) -> dict[str, Any]:
    return response.get("content", {}).get("application/json", {}).get("schema", {})


def test_v1_endpoints_document_only_actual_problem_details() -> None:
    schema = create_app().openapi()

    for (path, method), expected in EXPECTED_PROBLEM_RESPONSES.items():
        responses = schema["paths"][path][method]["responses"]
        documented = {
            int(status)
            for status, response in responses.items()
            if _response_schema(response).get("$ref") == PROBLEM_DETAILS_REF
        }
        assert documented == expected, f"{method.upper()} {path}"


def test_request_validation_no_longer_references_fastapi_default_model() -> None:
    schema = create_app().openapi()

    for (path, method), statuses in EXPECTED_PROBLEM_RESPONSES.items():
        responses = schema["paths"][path][method]["responses"]
        if 422 in statuses:
            assert _response_schema(responses["422"]) == {"$ref": PROBLEM_DETAILS_REF}
        else:
            # FastAPI also invents a generic 422 for plain string path parameters.
            # eimir. intentionally maps such IDs to 404; the impossible
            # framework default must not appear in the contract.
            assert "422" not in responses

    schemas = schema["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    assert "ValidationError" not in schemas


def test_readiness_503_uses_actual_operational_model() -> None:
    schema = create_app().openapi()
    response = schema["paths"]["/api/v1/health/ready"]["get"]["responses"]["503"]

    assert _response_schema(response) == {"$ref": READINESS_REF}
