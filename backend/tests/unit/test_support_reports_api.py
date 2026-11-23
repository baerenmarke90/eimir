"""Request validation and handler flow of the support report endpoint (#2189).

These tests need no database: the service and the rate limit are replaced by
recording fakes, so only the endpoint's own decisions are under test.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from eimir.api import deps
from eimir.api.errors import register_error_handlers
from eimir.api.v1 import support_reports as support_api
from eimir.auth import rate_limit
from eimir.config import Settings
from eimir.core.errors import ConflictError, ErrorCode, RateLimitedError
from eimir.db.session import get_session
from eimir.support_reports import service
from eimir.support_reports.models import SupportReportKind
from eimir.support_reports.payload import ClientContext, SupportReportPayload, SupportReportReply

EMOJI = "\U0001f49b"
ACCOUNT_ID = uuid4()


def _client_body() -> dict[str, Any]:
    return {
        "appVersion": "0.2.0",
        "build": "123",
        "platform": "app",
        "os": "Android 16",
        "engine": "WebView 142",
        "locale": "de-DE",
        "theme": "dark",
        "online": True,
        "localTime": "2026-11-23T10:15:00",
        "timeZone": "Europe/Berlin",
    }


def _body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "clientRequestId": str(uuid4()),
        "kind": "PROBLEM",
        "note": "The list did not load.",
        "client": _client_body(),
    }
    body.update(overrides)
    return body


def _validate(**overrides: Any) -> support_api.SupportReportCreate:
    return support_api.SupportReportCreate.model_validate(_body(**overrides))


# --- request model ---------------------------------------------------------


def test_problem_with_failure_reference_is_valid() -> None:
    request = _validate(
        failure={"reference": "GET:/api/v1/plans/{id}:500:INTERNAL_ERROR:app", "requestId": "r-1"}
    )
    payload = request.to_payload()
    assert isinstance(payload, SupportReportPayload)
    assert payload.failure is not None
    assert payload.failure.request_id == "r-1"
    # The stored shape stays snake_case; only the wire shape is camelCase.
    assert payload.client.app_version == "0.2.0"
    assert set(payload.seal()["client"]) == set(ClientContext.model_fields)


def test_problem_note_is_optional_and_blank_becomes_none() -> None:
    assert _validate(note=None).note is None
    assert _validate(note="   \n\t ").note is None
    assert _validate(note="").note is None
    body = _body()
    del body["note"]
    assert support_api.SupportReportCreate.model_validate(body).note is None


def test_note_is_stripped() -> None:
    assert _validate(note="  hello \n").note == "hello"


def test_feedback_requires_a_note() -> None:
    assert _validate(kind="FEEDBACK", note="Love it").kind is SupportReportKind.FEEDBACK
    for note in (None, "", "   ", "\n\t"):
        with pytest.raises(ValidationError):
            _validate(kind="FEEDBACK", note=note)
    body = _body(kind="FEEDBACK")
    del body["note"]
    with pytest.raises(ValidationError):
        support_api.SupportReportCreate.model_validate(body)


def test_feedback_never_carries_a_failure() -> None:
    with pytest.raises(ValidationError):
        _validate(kind="FEEDBACK", note="Love it", failure={"reference": "GET:/api/v1/plans:500"})


def test_unknown_fields_are_rejected_at_every_level() -> None:
    with pytest.raises(ValidationError):
        _validate(email="someone@example.com")
    with pytest.raises(ValidationError):
        _validate(client={**_client_body(), "deviceId": "abc"})
    with pytest.raises(ValidationError):
        _validate(failure={"reference": "GET:/x", "url": "https://example.test/x"})


def test_note_limit_counts_characters_not_bytes() -> None:
    assert _validate(note=EMOJI * 2000).note == EMOJI * 2000
    with pytest.raises(ValidationError):
        _validate(note=EMOJI * 2001)


def test_failure_reference_cannot_carry_a_url_or_query() -> None:
    for reference in ("https://example.test/plans", "GET:/api/v1/plans?token=abc", "GET /x 500"):
        with pytest.raises(ValidationError):
            _validate(failure={"reference": reference})


def test_kind_and_platform_are_closed_sets() -> None:
    with pytest.raises(ValidationError):
        _validate(kind="QUESTION")
    with pytest.raises(ValidationError):
        _validate(client={**_client_body(), "platform": "ios"})


def test_client_request_id_must_be_a_uuid() -> None:
    with pytest.raises(ValidationError):
        _validate(clientRequestId="not-a-uuid")


# --- rate limit constants --------------------------------------------------


def test_rate_limit_is_five_per_hour_and_twenty_per_day() -> None:
    hourly = rate_limit.SUPPORT_REPORT_HOURLY
    daily = rate_limit.SUPPORT_REPORT_DAILY
    assert (hourly.attempts, hourly.window) == (5, timedelta(hours=1))
    assert (daily.attempts, daily.window) == (20, timedelta(days=1))


# --- handler flow ----------------------------------------------------------


class Recorder:
    """Stands in for the database-backed service and rate limit."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.existing: SimpleNamespace | None = None
        self.replay_error: Exception | None = None
        self.limit_error: Exception | None = None
        self.created: SimpleNamespace | None = None

    def find_replay(self, _session: object, **kwargs: Any) -> SimpleNamespace | None:
        self.calls.append("find_replay")
        if self.replay_error is not None:
            raise self.replay_error
        return self.existing

    def check(self, _session: object, action: str, key: str, limit: rate_limit.Limit) -> None:
        self.calls.append(f"check:{action}:{key}:{limit.attempts}")
        if self.limit_error is not None:
            raise self.limit_error

    def create_report(self, _session: object, **kwargs: Any) -> tuple[SimpleNamespace, bool]:
        self.calls.append("create_report")
        assert kwargs["account_id"] == ACCOUNT_ID
        assert isinstance(kwargs["payload"], SupportReportPayload)
        self.created = _report()
        return self.created, True


def _report() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(), state="NEW", created_at=datetime(2026, 11, 23, 10, 0, tzinfo=UTC)
    )


@pytest.fixture
def recorder(monkeypatch: pytest.MonkeyPatch) -> Recorder:
    recorder = Recorder()
    monkeypatch.setattr(service, "find_replay", recorder.find_replay)
    monkeypatch.setattr(service, "create_report", recorder.create_report)
    monkeypatch.setattr(rate_limit, "check", recorder.check)
    return recorder


def _enable(monkeypatch: pytest.MonkeyPatch, enabled: bool = True) -> None:
    monkeypatch.setattr(
        support_api,
        "get_settings",
        lambda: Settings.model_validate({"support_reports_enabled": enabled}),
    )


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(support_api.router, prefix="/api/v1")

    def session() -> Iterator[None]:
        yield None

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[deps.current_account] = lambda: SimpleNamespace(id=ACCOUNT_ID)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


URL = "/api/v1/support-reports"


def test_disabled_flag_answers_not_found_without_touching_anything(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch, False)
    response = client.post(URL, json=_body())
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert recorder.calls == []


def test_new_report_is_201_with_a_small_body_and_spends_both_budgets(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    response = client.post(URL, json=_body())
    assert response.status_code == 201
    assert recorder.created is not None
    assert response.json() == {
        "id": str(recorder.created.id),
        "state": "NEW",
        "createdAt": "2026-11-23T10:00:00Z",
    }
    assert recorder.calls == [
        "find_replay",
        f"check:{support_api.ACTION_HOURLY}:{ACCOUNT_ID}:5",
        f"check:{support_api.ACTION_DAILY}:{ACCOUNT_ID}:20",
        "create_report",
    ]
    assert response.headers["Cache-Control"] == "private, no-store"


def test_replay_is_200_and_consumes_no_budget(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    recorder.existing = _report()
    recorder.limit_error = RateLimitedError("Too many attempts.", ErrorCode.RATE_LIMITED)
    response = client.post(URL, json=_body())
    assert response.status_code == 200
    assert response.json()["id"] == str(recorder.existing.id)
    assert recorder.calls == ["find_replay"]


def test_same_identity_with_other_content_is_409(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    recorder.replay_error = ConflictError("Reused.", ErrorCode.IDEMPOTENCY_KEY_REUSED)
    response = client.post(URL, json=_body())
    assert response.status_code == 409
    assert response.json()["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert recorder.calls == ["find_replay"]


def test_exhausted_budget_is_429_and_creates_nothing(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    recorder.limit_error = RateLimitedError("Too many attempts.", ErrorCode.RATE_LIMITED)
    response = client.post(URL, json=_body())
    assert response.status_code == 429
    assert response.json()["code"] == "RATE_LIMITED"
    assert "create_report" not in recorder.calls


@pytest.mark.parametrize(
    "mutate",
    [
        lambda body: body.update(email="someone@example.com"),
        lambda body: body.update(kind="FEEDBACK", note="   "),
        lambda body: body.update(kind="FEEDBACK", failure={"reference": "GET:/x"}),
        lambda body: body["client"].update(deviceId="abc"),
    ],
    ids=["unknown-field", "blank-feedback", "feedback-with-failure", "unknown-client-field"],
)
def test_invalid_bodies_are_422_before_anything_happens(
    client: TestClient,
    recorder: Recorder,
    monkeypatch: pytest.MonkeyPatch,
    mutate: Callable[[dict[str, Any]], object],
) -> None:
    _enable(monkeypatch)
    body = _body()
    mutate(body)
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert recorder.calls == []


def test_422_does_not_echo_submitted_text(
    client: TestClient, recorder: Recorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch)
    response = client.post(URL, json=_body(kind="FEEDBACK", note="   ", secret="hunter2"))
    assert response.status_code == 422
    assert "hunter2" not in response.text


def test_operation_is_in_the_contract_with_both_success_statuses() -> None:
    from eimir.main import create_app

    operation = create_app().openapi()["paths"]["/api/v1/support-reports"]["post"]
    assert operation["operationId"] == "createSupportReport"
    assert {"200", "201", "401", "404", "409", "422", "429"} <= set(operation["responses"])


# --- reply read ------------------------------------------------------------


class ReplyRecorder:
    """Stands in for ``service.get_reply``."""

    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []
        self.reply: SupportReportReply | None = None

    def get_reply(
        self, _session: object, *, report_id: object, account_id: object
    ) -> SupportReportReply | None:
        self.calls.append((report_id, account_id))
        return self.reply


@pytest.fixture
def replies(monkeypatch: pytest.MonkeyPatch) -> ReplyRecorder:
    recorder = ReplyRecorder()
    monkeypatch.setattr(service, "get_reply", recorder.get_reply)
    return recorder


def test_reply_is_returned_to_the_reporter_even_when_the_flag_is_off(
    client: TestClient, replies: ReplyRecorder, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable(monkeypatch, False)
    report_id = uuid4()
    replies.reply = SupportReportReply(
        text="<b>Thanks</b> & sorry", replied_at=datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
    )
    response = client.get(f"{URL}/{report_id}/reply")
    assert response.status_code == 200
    assert response.json() == {"text": "<b>Thanks</b> & sorry", "repliedAt": "2026-11-23T12:00:00Z"}
    assert replies.calls == [(report_id, ACCOUNT_ID)]
    assert response.headers["Cache-Control"] == "private, no-store"


def test_no_reply_for_this_reporter_is_a_plain_404(
    client: TestClient, replies: ReplyRecorder
) -> None:
    response = client.get(f"{URL}/{uuid4()}/reply")
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert len(replies.calls) == 1


def test_malformed_report_id_is_the_same_404_without_a_lookup(
    client: TestClient, replies: ReplyRecorder
) -> None:
    response = client.get(f"{URL}/not-a-uuid/reply")
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert replies.calls == []


def test_reply_operation_is_in_the_contract() -> None:
    from eimir.main import create_app

    operation = create_app().openapi()["paths"]["/api/v1/support-reports/{reportId}/reply"]["get"]
    assert operation["operationId"] == "getSupportReportReply"
    assert {"200", "401", "404"} <= set(operation["responses"])
