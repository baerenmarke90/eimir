"""The ticket body, the wire models and the tracker contract need no database (#2189)."""

from __future__ import annotations

import inspect
from typing import Any
from uuid import uuid4

import pytest
from pydantic import ValidationError

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.api.models import (
    SupportReportTicketCreate,
    SupportReportTicketProblem,
    SupportReportTicketSummary,
)
from eimir_admin.support_tickets import service
from eimir_admin.support_tickets.models import TicketState
from eimir_admin.tracker.github import GitHubIssueTracker

REPORT_ID = uuid4()
FOOTER_FIELDS: dict[str, Any] = {
    "report_id": REPORT_ID,
    "kind": "PROBLEM",
    "app_version": "0.2.0",
    "build": "123",
    "platform": "app",
    "failure_reference": "GET:/api/v1/plans:500:INTERNAL_ERROR:app",
    "request_id": "req-7",
}


def test_the_body_is_the_operator_text_plus_a_technical_footer() -> None:
    body = service.compose_body("Steps are in the video.", **FOOTER_FIELDS)

    assert body.startswith("Steps are in the video.\n")
    for expected in (
        "PROBLEM",
        "0.2.0",
        "123",
        "app",
        "GET:/api/v1/plans:500:INTERNAL_ERROR:app",
        "req-7",
        str(REPORT_ID),
    ):
        assert expected in body


def test_the_footer_names_missing_values_instead_of_dropping_them() -> None:
    body = service.compose_body(
        "", **{**FOOTER_FIELDS, "failure_reference": None, "request_id": None}
    )

    assert body.lower().count("none") == 2


def test_client_supplied_footer_values_cannot_inject_markup_or_mentions() -> None:
    hostile = "1.0\n\n# Heading @everyone [x](http://evil.example) `"
    body = service.compose_body(
        "text", **{**FOOTER_FIELDS, "app_version": hostile, "build": "<script>"}
    )

    # Whatever survives sits inside one code span, so it renders as plain text.
    assert "](" not in body
    assert "@" not in body
    assert body.count("`") == service.compose_body("text", **FOOTER_FIELDS).count("`")
    assert "<script>" not in body
    assert "# Heading" not in body
    # One footer line per value: the hostile text cannot start new lines.
    assert body.count("\n") == service.compose_body("text", **FOOTER_FIELDS).count("\n")


def test_the_footer_is_built_from_the_named_fields_only() -> None:
    signature = inspect.signature(service.compose_body)

    assert set(signature.parameters) == {"operator_body", *FOOTER_FIELDS}


def test_create_request_limits() -> None:
    assert SupportReportTicketCreate(title="  T  ", body="").title == "T"
    assert len(SupportReportTicketCreate(title="t" * 256, body="b" * 65536).body) == 65536
    for payload in (
        {"title": "", "body": ""},
        {"title": "   ", "body": ""},
        {"title": "t" * 257, "body": ""},
        {"title": "t", "body": "b" * 65537},
        {"title": "t"},
        {"title": "t", "body": "", "labels": ["x"]},
    ):
        with pytest.raises(ValidationError):
            SupportReportTicketCreate.model_validate(payload)


def test_the_problem_body_carries_the_link_and_the_retry_flag() -> None:
    problem = SupportReportTicketProblem(
        type="conflict",
        title="Conflict",
        status=409,
        detail="d",
        code=service.TICKET_EXISTS,
        ticket=SupportReportTicketSummary(
            tracker="github", state=TicketState.PENDING, url=None, number=None
        ),
        retryable=None,
    )

    wire = problem.model_dump(by_alias=True, mode="json")
    assert wire["ticket"]["state"] == "PENDING"
    assert wire["retryable"] is None


def test_the_github_adapter_names_its_tracker_for_the_link_row() -> None:
    assert GitHubIssueTracker("example/tickets", "t").name == "github"
    assert service.TICKET_LABELS == ("support-report",)
