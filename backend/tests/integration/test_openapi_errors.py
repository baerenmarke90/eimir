"""Runtime errors and the documented ProblemDetails schema remain aligned."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from eimir.api.errors import ProblemDetails
from eimir.auth import local, rate_limit
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

PROBLEM_DETAILS_REF = "#/components/schemas/ProblemDetails"
REQUIRED_FIELDS = {"type", "title", "status", "detail", "code"}


def _assert_problem_contract(
    client: TestClient,
    *,
    path_template: str,
    method: str,
    response,
) -> None:  # type: ignore[no-untyped-def]
    body = response.json()
    assert set(body) == REQUIRED_FIELDS
    details = ProblemDetails.model_validate(body)
    assert details.status == response.status_code

    schema: dict[str, Any] = client.get("/openapi.json").json()
    documented = schema["paths"][path_template][method]["responses"][str(response.status_code)]
    assert documented["content"]["application/json"]["schema"] == {"$ref": PROBLEM_DETAILS_REF}


def test_401_authentication_runtime_matches_contract(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    _assert_problem_contract(
        client,
        path_template="/api/v1/auth/me",
        method="get",
        response=response,
    )


def test_422_request_validation_runtime_matches_contract(client: TestClient) -> None:
    response = client.post("/api/v1/auth/sign-in", json={})

    assert response.status_code == 422
    _assert_problem_contract(
        client,
        path_template="/api/v1/auth/sign-in",
        method="post",
        response=response,
    )


def test_404_tenant_boundary_runtime_matches_contract(
    client: TestClient,
    session: Session,
) -> None:
    account = make_account(session, "Anna")
    token = sign_in(session, account)

    response = client.get("/api/v1/spaces/not-a-uuid", headers=auth(token))

    assert response.status_code == 404
    _assert_problem_contract(
        client,
        path_template="/api/v1/spaces/{spaceId}",
        method="get",
        response=response,
    )


def test_409_concurrency_runtime_matches_contract(
    client: TestClient,
    session: Session,
) -> None:
    account = make_account(session, "Anna")
    space = make_space(session, account)
    token = sign_in(session, account)

    response = client.put(
        f"/api/v1/spaces/{space.id}/profile",
        headers={**auth(token), "If-Match": '"999"'},
        json={
            "relationshipStartedOn": None,
            "showRelationshipDuration": True,
            "durationDisplayMode": "YEARS_MONTHS",
        },
    )

    assert response.status_code == 409
    _assert_problem_contract(
        client,
        path_template="/api/v1/spaces/{spaceId}/profile",
        method="put",
        response=response,
    )


def test_429_rate_limit_runtime_matches_contract(
    client: TestClient,
    session: Session,
) -> None:
    email = "rate-limit-openapi@example.test"
    for _ in range(rate_limit.SIGN_IN.attempts):
        rate_limit.record_attempt(session, local.ACTION_SIGN_IN, email)

    response = client.post(
        "/api/v1/auth/sign-in",
        json={"email": email, "password": "ungueltig"},
    )

    assert response.status_code == 429
    _assert_problem_contract(
        client,
        path_template="/api/v1/auth/sign-in",
        method="post",
        response=response,
    )
