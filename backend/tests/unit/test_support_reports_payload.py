"""Strict support report payloads and the shape of their tables (#2189)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

import pytest
from pydantic import ValidationError
from sqlalchemy import ForeignKeyConstraint, Table, UniqueConstraint

from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.db.registry import MODEL_MODULES, load_all_models
from eimir.support_reports.models import SupportReport, SupportReportReplyRow
from eimir.support_reports.payload import (
    ClientContext,
    FailureReference,
    SupportReportPayload,
    SupportReportReply,
)

EMOJI = "\U0001f49b"


def _client() -> dict[str, Any]:
    return {
        "app_version": "0.2.0",
        "build": "123",
        "platform": "app",
        "os": "Android 16",
        "engine": "WebView 142",
        "locale": "de-DE",
        "theme": "dark",
        "online": True,
        "local_time": "2026-11-23T10:15:00",
        "time_zone": "Europe/Berlin",
    }


def _payload(**overrides: Any) -> dict[str, Any]:
    return {"note": "The list did not load.", "failure": None, "client": _client(), **overrides}


def test_payload_rejects_unknown_field() -> None:
    SupportReportPayload.model_validate(_payload())
    with pytest.raises(ValidationError):
        SupportReportPayload.model_validate(_payload(email="someone@example.com"))
    with pytest.raises(ValidationError):
        SupportReportPayload.model_validate(_payload(client={**_client(), "device_id": "abc"}))
    with pytest.raises(ValidationError):
        SupportReportPayload.model_validate(
            _payload(failure={"reference": "GET:/api/v1/plans:500", "token": "secret"})
        )


def test_payload_is_frozen() -> None:
    payload = SupportReportPayload.model_validate(_payload())
    with pytest.raises(ValidationError):
        payload.note = "changed"


def test_platform_is_app_or_web_only() -> None:
    for platform in ("app", "web"):
        ClientContext.model_validate({**_client(), "platform": platform})
    with pytest.raises(ValidationError):
        ClientContext.model_validate({**_client(), "platform": "ios"})


def test_note_limit_2000_characters_not_bytes() -> None:
    accepted = SupportReportPayload.model_validate(_payload(note=EMOJI * 2000))
    assert accepted.note == EMOJI * 2000
    assert len(accepted.note.encode()) > 2000
    with pytest.raises(ValidationError):
        SupportReportPayload.model_validate(_payload(note=EMOJI * 2001))


def test_reply_limit_500() -> None:
    replied_at = datetime(2026, 11, 23, 10, 0, tzinfo=UTC)
    assert SupportReportReply(text=EMOJI * 500, replied_at=replied_at).text == EMOJI * 500
    with pytest.raises(ValidationError):
        SupportReportReply(text=EMOJI * 501, replied_at=replied_at)
    with pytest.raises(ValidationError):
        SupportReportReply.model_validate(
            {"text": "Thanks", "replied_at": replied_at, "html": "<b>x</b>"}
        )


def test_failure_reference_has_no_url_fields() -> None:
    assert set(FailureReference.model_fields) == {"reference", "request_id"}
    with pytest.raises(ValidationError):
        FailureReference.model_validate(
            {"reference": "GET:/api/v1/plans/{id}:500", "url": "https://example.test/x?y=1"}
        )


@pytest.mark.parametrize(
    "reference",
    [
        "GET:/api/v1/plans/{id}:500:INTERNAL_ERROR:app",
        "POST:/api/v1/support-reports:network:web",
        "a.b_c-d/e{f}:g",
    ],
)
def test_failure_reference_accepts_generalized_tokens(reference: str) -> None:
    assert FailureReference(reference=reference).reference == reference


@pytest.mark.parametrize(
    "reference",
    [
        "",
        "https://example.test/plans",
        "GET:https://example.test",
        "GET:/api/v1/plans?token=abc",
        "GET:/api/v1/plans#fragment",
        "GET:/api/v1/plans:key=value",
        "GET /api/v1/plans 500",
        "GET:/api/v1/plans\n500",
        "GET:/api/v1/pläne",
        "x" * 201,
    ],
)
def test_failure_reference_rejects_urls_queries_and_whitespace(reference: str) -> None:
    with pytest.raises(ValidationError):
        FailureReference(reference=reference)


def test_failure_reference_accepts_200_characters() -> None:
    assert len(FailureReference(reference="a" * 200).reference) == 200


@pytest.mark.parametrize("request_id", ["req-1.2_3", "A" * 128])
def test_request_id_accepts_header_safe_tokens(request_id: str) -> None:
    assert FailureReference(reference="GET:/x", request_id=request_id).request_id == request_id


@pytest.mark.parametrize("request_id", ["", "a b", "a/b", "a:b", "a?b", "a" * 129, "id\n"])
def test_request_id_rejects_other_characters(request_id: str) -> None:
    with pytest.raises(ValidationError):
        FailureReference(reference="GET:/x", request_id=request_id)


def test_payload_columns_are_protected_and_typed() -> None:
    report_payload = SupportReport.__table__.c.payload.type
    reply_payload = SupportReportReplyRow.__table__.c.payload.type
    assert isinstance(report_payload, ProtectedPayloadJSON)
    assert report_payload.payload_type is SupportReportPayload
    assert isinstance(reply_payload, ProtectedPayloadJSON)
    assert reply_payload.payload_type is SupportReportReply
    assert "crypto_version" in SupportReport.__table__.c
    assert "crypto_version" in SupportReportReplyRow.__table__.c
    assert "reply" not in SupportReport.__table__.c


def test_client_request_id_is_unique_per_account() -> None:
    uniques = {
        tuple(column.name for column in constraint.columns)
        for constraint in cast(Table, SupportReport.__table__).constraints
        if isinstance(constraint, UniqueConstraint)
    }
    assert ("account_id", "client_request_id") in uniques


def _foreign_key(table: Any, column: str) -> ForeignKeyConstraint:
    load_all_models()
    [constraint] = [
        constraint
        for constraint in table.constraints
        if isinstance(constraint, ForeignKeyConstraint) and constraint.column_keys == [column]
    ]
    return constraint


def test_report_is_deleted_with_its_account() -> None:
    assert "eimir.support_reports.models" in MODEL_MODULES
    constraint = _foreign_key(SupportReport.__table__, "account_id")
    assert constraint.referred_table.name == "accounts"
    assert constraint.ondelete == "CASCADE"


def test_reply_row_disappears_with_its_report_and_is_one_per_report() -> None:
    table = SupportReportReplyRow.__table__
    constraint = _foreign_key(table, "report_id")
    assert constraint.referred_table.name == "support_reports"
    assert constraint.ondelete == "CASCADE"
    assert table.c.report_id.unique is True
    assert table.c.report_id.nullable is False
    assert table.c.replied_at.nullable is False
