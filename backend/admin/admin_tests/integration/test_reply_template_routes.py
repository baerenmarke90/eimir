"""The operator's reply template routes against a real database (#2327).

Templates are operator text shared by all ServerAdmins: no step-up, no privileged
audit, the same guard, operator switch and ``no-store`` as the report routes.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.reply_templates.models import SupportReplyTemplate

from eimir.administration.models import InstanceAdministrationActionEvent
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import Account, AccountEmail
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/server-admin/support-reports/templates"
ADMIN_EMAIL = "template-operator@example.test"
NO_STORE = "private, no-store"


@pytest.fixture(autouse=True)
def server_admin_allowlist(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _operator(session: Session) -> tuple[Account, str]:
    account = make_account(session, "Template operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    return account, sign_in(session, account)


def _create(client: Any, token: str, name: str, text: str = "Thanks for your report.") -> Any:
    return client.post(BASE, json={"name": name, "text": text}, headers=auth(token))


def _audit_count(session: Session) -> int:
    return session.execute(
        select(func.count()).select_from(InstanceAdministrationActionEvent)
    ).scalar_one()


def test_create_lists_the_template(client: Any, session: Session) -> None:
    _, token = _operator(session)

    created = _create(client, token, "  We are on it  ", "  We look at it today.  ")

    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "We are on it"
    assert body["text"] == "We look at it today."
    assert set(body) == {"id", "name", "text", "createdAt", "updatedAt"}
    listed = client.get(BASE, headers=auth(token))
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [body["id"]]


def test_list_is_sorted_by_name_ignoring_case(client: Any, session: Session) -> None:
    _, token = _operator(session)
    for name in ("b", "A", "c"):
        assert _create(client, token, name).status_code == 201

    items = client.get(BASE, headers=auth(token)).json()["items"]

    assert [item["name"] for item in items] == ["A", "b", "c"]


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "n" * 41, "text": "ok"},
        {"name": "", "text": "ok"},
        {"name": "   ", "text": "ok"},
        {"name": "ok", "text": "t" * 501},
        {"name": "ok", "text": " \n "},
    ],
)
def test_invalid_name_or_text_is_422(
    client: Any, session: Session, payload: dict[str, str]
) -> None:
    _, token = _operator(session)

    response = client.post(BASE, json=payload, headers=auth(token))

    assert response.status_code == 422
    assert session.execute(select(func.count()).select_from(SupportReplyTemplate)).scalar_one() == 0


def test_exactly_the_limits_are_accepted(client: Any, session: Session) -> None:
    _, token = _operator(session)

    assert _create(client, token, "n" * 40, "t" * 500).status_code == 201


def test_the_31st_template_is_409(client: Any, session: Session) -> None:
    _, token = _operator(session)
    for index in range(30):
        assert _create(client, token, f"Template {index:02d}").status_code == 201

    response = _create(client, token, "One too many")

    assert response.status_code == 409
    assert response.json()["code"] == "SUPPORT_TEMPLATE_LIMIT"


def test_a_name_taken_in_any_case_is_409(client: Any, session: Session) -> None:
    _, token = _operator(session)
    first = _create(client, token, "Danke").json()
    other = _create(client, token, "Behoben").json()

    duplicate = _create(client, token, "danke")
    renamed = client.put(
        f"{BASE}/{other['id']}", json={"name": "DANKE", "text": "x"}, headers=auth(token)
    )

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "SUPPORT_TEMPLATE_NAME_TAKEN"
    assert renamed.status_code == 409
    assert renamed.json()["code"] == "SUPPORT_TEMPLATE_NAME_TAKEN"
    assert first["name"] == "Danke"


def test_rename_to_own_name_other_case_is_allowed(client: Any, session: Session) -> None:
    _, token = _operator(session)
    template = _create(client, token, "Danke").json()

    response = client.put(
        f"{BASE}/{template['id']}",
        json={"name": "DANKE", "text": "Changed text."},
        headers=auth(token),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "DANKE"
    assert response.json()["text"] == "Changed text."


def test_delete_removes_the_template(client: Any, session: Session) -> None:
    _, token = _operator(session)
    template = _create(client, token, "Gone soon").json()

    deleted = client.delete(f"{BASE}/{template['id']}", headers=auth(token))
    again = client.delete(f"{BASE}/{template['id']}", headers=auth(token))

    assert deleted.status_code == 204
    assert again.status_code == 404
    assert again.json()["code"] == "SUPPORT_TEMPLATE_NOT_FOUND"
    assert client.get(BASE, headers=auth(token)).json()["items"] == []


@pytest.mark.parametrize("template_id", ["0190f0e0-0000-7000-8000-000000000000", "not-an-id"])
def test_unknown_or_malformed_id_is_404(client: Any, session: Session, template_id: str) -> None:
    _, token = _operator(session)

    updated = client.put(
        f"{BASE}/{template_id}", json={"name": "x", "text": "y"}, headers=auth(token)
    )
    deleted = client.delete(f"{BASE}/{template_id}", headers=auth(token))

    for response in (updated, deleted):
        assert response.status_code == 404
        assert response.json()["code"] == "SUPPORT_TEMPLATE_NOT_FOUND"


def _requests() -> list[tuple[str, str, dict[str, str] | None]]:
    some_id = "0190f0e0-0000-7000-8000-000000000000"
    return [
        ("GET", BASE, None),
        ("POST", BASE, {"name": "n", "text": "t"}),
        ("PUT", f"{BASE}/{some_id}", {"name": "n", "text": "t"}),
        ("DELETE", f"{BASE}/{some_id}", None),
    ]


def test_non_admin_is_403(client: Any, session: Session) -> None:
    token = sign_in(session, make_account(session, "Ordinary person"))

    for method, path, body in _requests():
        response = client.request(method, path, json=body, headers=auth(token))
        assert response.status_code == 403, (method, path)


def test_anonymous_is_401(client: Any, session: Session) -> None:
    for method, path, body in _requests():
        assert client.request(method, path, json=body).status_code == 401, (method, path)


def test_feature_off_is_404(client: Any, session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    _, token = _operator(session)
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "false")
    get_settings.cache_clear()

    for method, path, body in _requests():
        response = client.request(method, path, json=body, headers=auth(token))
        assert response.status_code == 404, (method, path)


def test_responses_are_no_store_and_writes_are_not_audited(client: Any, session: Session) -> None:
    _, token = _operator(session)
    before = _audit_count(session)

    created = _create(client, token, "Audit free")
    template_id = created.json()["id"]
    responses = [
        created,
        client.get(BASE, headers=auth(token)),
        client.put(
            f"{BASE}/{template_id}", json={"name": "Audit free", "text": "x"}, headers=auth(token)
        ),
        client.delete(f"{BASE}/{template_id}", headers=auth(token)),
    ]

    for response in responses:
        assert response.status_code < 300, response.text
        assert response.headers["cache-control"] == NO_STORE
    assert _audit_count(session) == before


def test_a_name_taken_by_a_concurrent_writer_is_409_and_keeps_the_session(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The unique index decides a race the pre-check missed; the request may go on."""
    from eimir_admin.reply_templates import service

    from eimir.core.errors import ConflictError

    service.create_template(session, name="Danke", text="First.")
    # The other writer passed the pre-check before this one committed.
    monkeypatch.setattr(service, "_ensure_name_free", lambda *args, **kwargs: None)

    with pytest.raises(ConflictError) as raised:
        service.create_template(session, name="DANKE", text="Second.")

    assert raised.value.code == service.TEMPLATE_NAME_TAKEN
    # Only the savepoint rolled back: the first template and the session survive.
    assert [template.name for template in service.list_templates(session)] == ["Danke"]
