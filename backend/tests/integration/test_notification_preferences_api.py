"""Account isolation and honest channel capability in the #638 API."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.engagement import email_delivery, notification_preferences, push
from eimir.engagement.models import NotificationChannel, NotificationKind, NotificationPreference
from eimir.identity.models import Account, AccountEmail
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/notification-preferences"


def _channel(entry: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in entry["channels"] if item["channel"] == name)


def _entry(payload: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in payload["items"] if item["kind"] == name)


def _capability(payload: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in payload["capabilities"] if item["channel"] == name)


def test_quiet_hours_are_owner_scoped_and_validate_complete_minute_windows(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna.timezone = "Europe/Berlin"
    ben.timezone = "America/New_York"
    session.flush()
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)
    path = f"{BASE}/quiet-hours"

    initial = client.get(BASE, headers=auth(anna_token))
    assert initial.json()["quietHours"] == {
        "enabled": False,
        "start": None,
        "end": None,
        "timeZone": "Europe/Berlin",
    }
    assert (
        client.patch(path, json={"enabled": True, "start": "22:00", "end": "07:00"}).status_code
        == 401
    )

    for bad in (
        {"enabled": True, "start": "22:00"},
        {"enabled": True, "start": "22:00", "end": "22:00"},
        {"enabled": True, "start": "22:00:01", "end": "07:00"},
        {"enabled": False, "start": "22:00", "end": "07:00"},
        {"enabled": True, "start": "22:00", "end": "07:00", "accountId": str(ben.id)},
    ):
        assert client.patch(path, json=bad, headers=auth(anna_token)).status_code == 422

    saved = client.patch(
        path, json={"enabled": True, "start": "22:00", "end": "07:00"}, headers=auth(anna_token)
    )
    assert saved.status_code == 200
    assert saved.headers["Cache-Control"] == "private, no-store"
    assert saved.json() == {
        "enabled": True,
        "start": "22:00:00",
        "end": "07:00:00",
        "timeZone": "Europe/Berlin",
    }
    assert client.get(BASE, headers=auth(anna_token)).json()["quietHours"] == saved.json()
    assert client.get(BASE, headers=auth(ben_token)).json()["quietHours"] == {
        "enabled": False,
        "start": None,
        "end": None,
        "timeZone": "America/New_York",
    }
    session.refresh(ben)
    assert ben.quiet_hours_start is None

    cleared = client.patch(path, json={"enabled": False}, headers=auth(anna_token))
    assert cleared.status_code == 200
    assert cleared.json()["enabled"] is False
    # The TestClient override shares this test Session and bypasses the request
    # unit-of-work commit; flush before refreshing from the database.
    session.flush()
    session.refresh(anna)
    assert anna.quiet_hours_start is None and anna.quiet_hours_end is None
    assert session.get(Account, ben.id).quiet_hours_start is None


def test_only_owner_can_read_or_change_personal_push_choice(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)

    initial = client.get(BASE, headers=auth(anna_token))
    assert initial.status_code == 200
    assert initial.headers["Cache-Control"] == "private, no-store"
    assert len(initial.json()["items"]) == len(NotificationKind)
    thinking = _entry(initial.json(), NotificationKind.THINKING_OF_YOU.value)
    assert thinking["deliveryClass"] == "IMMEDIATE"
    assert _channel(thinking, "PUSH") == {"channel": "PUSH", "enabled": True, "configurable": True}
    comment = _entry(initial.json(), NotificationKind.COMMENT_CREATED.value)
    assert comment["deliveryClass"] == "DIGESTIBLE"
    assert _channel(comment, "PUSH")["enabled"] is False
    assert _channel(comment, "PUSH")["configurable"] is True
    assert _channel(thinking, "IN_APP")["enabled"] is True
    assert _channel(thinking, "IN_APP")["configurable"] is True
    assert _channel(comment, "IN_APP")["configurable"] is True
    assert _channel(thinking, "EMAIL")["enabled"] is False

    changed = client.patch(
        f"{BASE}/THINKING_OF_YOU/PUSH", json={"enabled": False}, headers=auth(anna_token)
    )
    assert changed.status_code == 200
    assert changed.headers["Cache-Control"] == "private, no-store"
    assert changed.json() == {"kind": "THINKING_OF_YOU", "channel": "PUSH", "enabled": False}
    again = client.patch(
        f"{BASE}/THINKING_OF_YOU/PUSH", json={"enabled": False}, headers=auth(anna_token)
    )
    assert again.status_code == 200
    rows = session.execute(select(NotificationPreference)).scalars().all()
    assert len(rows) == 1
    assert rows[0].account_id == anna.id
    assert rows[0].channel == NotificationChannel.PUSH.value
    assert rows[0].enabled is False

    own = client.get(BASE, headers=auth(anna_token)).json()
    other = client.get(BASE, headers=auth(ben_token)).json()
    assert _channel(_entry(own, "THINKING_OF_YOU"), "PUSH")["enabled"] is False
    assert _channel(_entry(other, "THINKING_OF_YOU"), "PUSH")["enabled"] is True
    assert _channel(_entry(own, "REMINDER_DUE"), "PUSH")["enabled"] is True
    assert client.get(BASE).status_code == 401
    assert client.patch(f"{BASE}/REMINDER_DUE/PUSH", json={"enabled": False}).status_code == 401


def test_in_app_choice_is_independent_per_kind_and_account(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)

    for kind in ("COMMENT_CREATED", "THINKING_OF_YOU"):
        changed = client.patch(
            f"{BASE}/{kind}/IN_APP", json={"enabled": False}, headers=auth(anna_token)
        )
        assert changed.status_code == 200
        assert changed.json() == {"kind": kind, "channel": "IN_APP", "enabled": False}
    repeated = client.patch(
        f"{BASE}/COMMENT_CREATED/IN_APP", json={"enabled": False}, headers=auth(anna_token)
    )
    assert repeated.status_code == 200

    own = client.get(BASE, headers=auth(anna_token)).json()
    partner = client.get(BASE, headers=auth(ben_token)).json()
    assert _channel(_entry(own, "COMMENT_CREATED"), "IN_APP")["enabled"] is False
    assert _channel(_entry(own, "THINKING_OF_YOU"), "IN_APP")["enabled"] is False
    assert _channel(_entry(own, "REMINDER_DUE"), "IN_APP")["enabled"] is True
    assert _channel(_entry(own, "THINKING_OF_YOU"), "PUSH")["enabled"] is True
    assert _channel(_entry(partner, "COMMENT_CREATED"), "IN_APP")["enabled"] is True
    assert len(session.execute(select(NotificationPreference)).scalars().all()) == 2

    restored = client.patch(
        f"{BASE}/COMMENT_CREATED/IN_APP", json={"enabled": True}, headers=auth(anna_token)
    )
    assert restored.status_code == 200
    assert (
        _channel(
            _entry(client.get(BASE, headers=auth(anna_token)).json(), "COMMENT_CREATED"), "IN_APP"
        )["enabled"]
        is True
    )
    assert (
        client.patch(f"{BASE}/COMMENT_CREATED/IN_APP", json={"enabled": False}).status_code == 401
    )


def test_comment_digest_push_requires_explicit_owner_choice_without_transport(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)
    path = f"{BASE}/COMMENT_CREATED/PUSH"

    assert not notification_preferences.digest_push_enabled(
        session, account_id=anna.id, kind=NotificationKind.COMMENT_CREATED.value
    )
    assert client.patch(path, json={"enabled": True}).status_code == 401
    enabled = client.patch(path, json={"enabled": True}, headers=auth(anna_token))
    assert enabled.status_code == 200
    assert enabled.headers["Cache-Control"] == "private, no-store"
    assert enabled.json() == {
        "kind": "COMMENT_CREATED",
        "channel": "PUSH",
        "enabled": True,
    }
    assert notification_preferences.digest_push_enabled(
        session, account_id=anna.id, kind=NotificationKind.COMMENT_CREATED.value
    )
    assert not notification_preferences.push_enabled(
        session, account_id=anna.id, kind=NotificationKind.COMMENT_CREATED.value
    )
    assert (
        _channel(
            _entry(client.get(BASE, headers=auth(anna_token)).json(), "COMMENT_CREATED"), "PUSH"
        )["enabled"]
        is True
    )
    assert (
        _channel(
            _entry(client.get(BASE, headers=auth(ben_token)).json(), "COMMENT_CREATED"), "PUSH"
        )["enabled"]
        is False
    )

    disabled = client.patch(path, json={"enabled": False}, headers=auth(anna_token))
    assert disabled.status_code == 200
    assert not notification_preferences.digest_push_enabled(
        session, account_id=anna.id, kind=NotificationKind.COMMENT_CREATED.value
    )
    rows = session.execute(select(NotificationPreference)).scalars().all()
    assert len(rows) == 1
    assert rows[0].account_id == anna.id
    assert rows[0].enabled is False


def test_unimplemented_comment_email_and_invalid_requests_fail_without_writing(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session)
    token = sign_in(session, account)
    response = client.patch(
        f"{BASE}/COMMENT_CREATED/EMAIL", json={"enabled": True}, headers=auth(token)
    )
    assert response.status_code == 409
    assert response.json()["code"] == "NOTIFICATION_EMAIL_NOT_ALLOWED"

    assert (
        client.patch(
            f"{BASE}/THINKING_OF_YOU/PUSH",
            json={"enabled": False, "accountId": str(account.id)},
            headers=auth(token),
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"{BASE}/NOT_A_KIND/PUSH", json={"enabled": False}, headers=auth(token)
        ).status_code
        == 422
    )
    assert session.execute(select(NotificationPreference)).scalars().all() == []


def test_capabilities_never_promise_unimplemented_transport(client, session: Session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session)
    token = sign_in(session, account)
    first = client.get(BASE, headers=auth(token)).json()
    assert _capability(first, "IN_APP") == {
        "channel": "IN_APP",
        "available": True,
        "reason": None,
        "destination": None,
    }
    assert _capability(first, "PUSH")["reason"] == "PUSH_ENDPOINT_MISSING"
    assert _capability(first, "PUSH")["available"] is False
    assert _capability(first, "EMAIL") == {
        "channel": "EMAIL",
        "available": False,
        "reason": "EMAIL_TRANSPORT_UNAVAILABLE",
        "destination": None,
    }

    push.register_endpoint(
        session, account_id=account.id, provider_key="unconfigured", endpoint_value="opaque-token"
    )
    later = client.get(BASE, headers=auth(token)).json()
    assert _capability(later, "PUSH")["reason"] == "PUSH_TRANSPORT_NOT_READY"
    assert _capability(later, "PUSH")["available"] is False


def test_email_opt_in_requires_smtp_and_verified_primary_and_is_account_scoped(
    client, session: Session, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    anna_token = sign_in(session, anna)
    ben_token = sign_in(session, ben)
    path = f"{BASE}/REMINDER_DUE/EMAIL"

    unavailable = client.patch(path, json={"enabled": True}, headers=auth(anna_token))
    assert unavailable.status_code == 409
    assert unavailable.json()["code"] == "NOTIFICATION_EMAIL_TRANSPORT_UNAVAILABLE"
    monkeypatch.setattr(email_delivery, "transport_available", lambda: True)
    missing = client.patch(path, json={"enabled": True}, headers=auth(anna_token))
    assert missing.status_code == 409
    assert missing.json()["code"] == "NOTIFICATION_EMAIL_VERIFIED_PRIMARY_MISSING"

    address = AccountEmail(account_id=anna.id, email="anna@example.org", is_primary=True)
    session.add(address)
    session.flush()
    unverified = client.get(BASE, headers=auth(anna_token)).json()
    assert _capability(unverified, "EMAIL")["available"] is False
    address.verified_at = now()
    session.flush()

    enabled = client.patch(path, json={"enabled": True}, headers=auth(anna_token))
    assert enabled.status_code == 200
    own = client.get(BASE, headers=auth(anna_token))
    assert own.headers["Cache-Control"] == "private, no-store"
    assert _capability(own.json(), "EMAIL") == {
        "channel": "EMAIL",
        "available": True,
        "reason": None,
        "destination": "anna@example.org",
    }
    assert _channel(_entry(own.json(), "REMINDER_DUE"), "EMAIL")["enabled"] is True
    assert _channel(_entry(own.json(), "COMMENT_CREATED"), "EMAIL")["configurable"] is False
    partner = client.get(BASE, headers=auth(ben_token)).json()
    assert _capability(partner, "EMAIL")["destination"] is None
    assert _channel(_entry(partner, "REMINDER_DUE"), "EMAIL")["enabled"] is False

    injection = client.patch(
        path,
        json={"enabled": True, "destination": "someone@example.org"},
        headers=auth(anna_token),
    )
    assert injection.status_code == 422
    address.verified_at = None
    session.flush()
    # Disabling remains possible when the transport or address disappears.
    disabled = client.patch(path, json={"enabled": False}, headers=auth(anna_token))
    assert disabled.status_code == 200
