"""``POST /api/v1/support-reports`` against a real database (#2189)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.api.v1 import support_reports as support_api
from eimir.config import Settings
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportKind
from eimir.support_reports.payload import ClientContext, SupportReportPayload
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

URL = "/api/v1/support-reports"


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        support_api,
        "get_settings",
        lambda: Settings.model_validate({"support_reports_enabled": True}),
    )


def _body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "clientRequestId": str(uuid4()),
        "kind": "PROBLEM",
        "note": "The list did not load.",
        "failure": {"reference": "GET:/api/v1/plans:500:INTERNAL_ERROR:app", "requestId": "r-1"},
        "client": {
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
        },
    }
    body.update(overrides)
    return body


def _count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(SupportReport)).scalar_one()


def test_create_returns_201_then_200_on_replay(
    client: Any, session: Session, enabled: None
) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    body = _body()

    created = client.post(URL, json=body, headers=auth(token))
    assert created.status_code == 201
    assert set(created.json()) == {"id", "state", "createdAt"}
    assert created.json()["state"] == "NEW"

    replay = client.post(URL, json=body, headers=auth(token))
    assert replay.status_code == 200
    assert replay.json() == created.json()
    assert _count(session) == 1


def test_replay_with_other_content_is_409(client: Any, session: Session, enabled: None) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    body = _body()
    assert client.post(URL, json=body, headers=auth(token)).status_code == 201

    changed = client.post(URL, json={**body, "note": "Another note."}, headers=auth(token))
    assert changed.status_code == 409
    assert changed.json()["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert _count(session) == 1


def test_another_account_cannot_replay_a_request_identity(
    client: Any, session: Session, enabled: None
) -> None:
    anna = sign_in(session, make_account(session, "Anna"))
    ben = sign_in(session, make_account(session, "Ben"))
    body = _body()
    first = client.post(URL, json=body, headers=auth(anna))
    second = client.post(URL, json=body, headers=auth(ben))
    assert (first.status_code, second.status_code) == (201, 201)
    assert first.json()["id"] != second.json()["id"]


def test_unauthenticated_is_401(client: Any, enabled: None) -> None:
    response = client.post(URL, json=_body())
    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_disabled_flag_refuses(client: Any, session: Session) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    response = client.post(URL, json=_body(), headers=auth(token))
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert _count(session) == 0


def test_unknown_field_is_422(client: Any, session: Session, enabled: None) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    response = client.post(URL, json=_body(email="someone@example.com"), headers=auth(token))
    assert response.status_code == 422
    assert _count(session) == 0


def test_whitespace_only_feedback_is_422(client: Any, session: Session, enabled: None) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    response = client.post(
        URL, json=_body(kind="FEEDBACK", note="  \n ", failure=None), headers=auth(token)
    )
    assert response.status_code == 422
    assert _count(session) == 0


def test_feedback_with_failure_reference_is_422(
    client: Any, session: Session, enabled: None
) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    response = client.post(URL, json=_body(kind="FEEDBACK", note="Love it"), headers=auth(token))
    assert response.status_code == 422
    assert _count(session) == 0


def test_sixth_report_within_an_hour_is_429(client: Any, session: Session, enabled: None) -> None:
    token = sign_in(session, make_account(session, "Anna"))
    bodies = [_body() for _ in range(6)]

    for body in bodies[:5]:
        assert client.post(URL, json=body, headers=auth(token)).status_code == 201

    limited = client.post(URL, json=bodies[5], headers=auth(token))
    assert limited.status_code == 429
    assert limited.json()["code"] == "RATE_LIMITED"
    assert _count(session) == 5

    # A retry of an already received report is still answered once the budget is used.
    replay = client.post(URL, json=bodies[0], headers=auth(token))
    assert replay.status_code == 200


def test_the_budget_is_per_account(client: Any, session: Session, enabled: None) -> None:
    anna = sign_in(session, make_account(session, "Anna"))
    ben = sign_in(session, make_account(session, "Ben"))
    for _ in range(5):
        assert client.post(URL, json=_body(), headers=auth(anna)).status_code == 201
    assert client.post(URL, json=_body(), headers=auth(anna)).status_code == 429
    assert client.post(URL, json=_body(), headers=auth(ben)).status_code == 201


# --- reply read ------------------------------------------------------------


def _report_with_reply(session: Session, account: Any, reply: str | None) -> UUID:
    report, _ = service.create_report(
        session,
        account_id=account.id,
        client_request_id=uuid4(),
        kind=SupportReportKind.PROBLEM,
        payload=SupportReportPayload(
            note="A note.", client=ClientContext.model_validate(_body()["client"])
        ),
    )
    if reply is not None:
        service.send_reply(session, report_id=report.id, text=reply, operator_id=None)
    session.flush()
    return report.id


def test_reply_read_is_reporter_only(client: Any, session: Session) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    report_id = _report_with_reply(session, anna, "We fixed it.")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)

    own = client.get(f"{URL}/{report_id}/reply", headers=auth(anna_token))
    assert own.status_code == 200
    assert set(own.json()) == {"text", "repliedAt", "reportedAt"}
    assert own.json()["text"] == "We fixed it."
    report = service.get_report(session, report_id)
    assert report is not None
    assert datetime.fromisoformat(own.json()["reportedAt"]) == report.created_at

    other = client.get(f"{URL}/{report_id}/reply", headers=auth(ben_token))
    unknown = client.get(f"{URL}/{uuid4()}/reply", headers=auth(anna_token))
    assert other.status_code == unknown.status_code == 404
    assert other.json()["code"] == unknown.json()["code"] == "RESOURCE_NOT_FOUND"


def test_reply_read_without_a_reply_is_404(client: Any, session: Session) -> None:
    anna = make_account(session, "Anna")
    report_id = _report_with_reply(session, anna, None)
    response = client.get(f"{URL}/{report_id}/reply", headers=auth(sign_in(session, anna)))
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_reply_read_needs_authentication(client: Any) -> None:
    assert client.get(f"{URL}/{uuid4()}/reply").status_code == 401


def test_reply_read_html_is_returned_verbatim(client: Any, session: Session) -> None:
    anna = make_account(session, "Anna")
    reply = "<script>alert(1)</script> <b>bold</b> &amp; https://example.test/x?a=1 \U0001f49b"
    report_id = _report_with_reply(session, anna, reply)
    response = client.get(f"{URL}/{report_id}/reply", headers=auth(sign_in(session, anna)))
    assert response.status_code == 200
    assert response.json()["text"] == reply
    assert response.headers["Content-Type"].startswith("application/json")


def test_reply_stays_readable_when_support_reports_are_switched_off(
    client: Any, session: Session
) -> None:
    # The `enabled` fixture is deliberately not used: the default is off.
    anna = make_account(session, "Anna")
    report_id = _report_with_reply(session, anna, "Still here.")
    response = client.get(f"{URL}/{report_id}/reply", headers=auth(sign_in(session, anna)))
    assert response.status_code == 200
