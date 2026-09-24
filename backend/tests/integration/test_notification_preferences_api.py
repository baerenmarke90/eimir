"""Account isolation and honest channel capability in the #638 API."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.engagement import push
from eimir.engagement.models import NotificationChannel, NotificationKind, NotificationPreference
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

BASE = "/api/v1/notification-preferences"


def _channel(entry: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in entry["channels"] if item["channel"] == name)


def _entry(payload: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in payload["items"] if item["kind"] == name)


def _capability(payload: dict, name: str) -> dict:  # type: ignore[type-arg]
    return next(item for item in payload["capabilities"] if item["channel"] == name)


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
    assert _channel(thinking, "PUSH") == {
        "channel": "PUSH", "enabled": True, "configurable": True
    }
    comment = _entry(initial.json(), NotificationKind.COMMENT_CREATED.value)
    assert comment["deliveryClass"] == "DIGESTIBLE"
    assert _channel(comment, "PUSH")["enabled"] is False
    assert _channel(comment, "PUSH")["configurable"] is False
    assert _channel(thinking, "IN_APP")["enabled"] is True
    assert _channel(thinking, "EMAIL")["enabled"] is False

    changed = client.patch(
        f"{BASE}/THINKING_OF_YOU/PUSH", json={"enabled": False}, headers=auth(anna_token)
    )
    assert changed.status_code == 200
    assert changed.headers["Cache-Control"] == "private, no-store"
    assert changed.json() == {
        "kind": "THINKING_OF_YOU", "channel": "PUSH", "enabled": False
    }
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


def test_unimplemented_channels_and_digestible_push_fail_without_writing(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session)
    token = sign_in(session, account)
    for kind, channel, code in (
        ("THINKING_OF_YOU", "IN_APP", "NOTIFICATION_CHANNEL_NOT_CONFIGURABLE"),
        ("THINKING_OF_YOU", "EMAIL", "NOTIFICATION_CHANNEL_NOT_CONFIGURABLE"),
        ("COMMENT_CREATED", "PUSH", "NOTIFICATION_PUSH_NOT_ALLOWED"),
    ):
        response = client.patch(
            f"{BASE}/{kind}/{channel}", json={"enabled": True}, headers=auth(token)
        )
        assert response.status_code == 409
        assert response.json()["code"] == code

    assert client.patch(
        f"{BASE}/THINKING_OF_YOU/PUSH",
        json={"enabled": False, "accountId": str(account.id)},
        headers=auth(token),
    ).status_code == 422
    assert client.patch(
        f"{BASE}/NOT_A_KIND/PUSH", json={"enabled": False}, headers=auth(token)
    ).status_code == 422
    assert session.execute(select(NotificationPreference)).scalars().all() == []


def test_capabilities_never_promise_unimplemented_transport(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session)
    token = sign_in(session, account)
    first = client.get(BASE, headers=auth(token)).json()
    assert _capability(first, "IN_APP") == {
        "channel": "IN_APP", "available": True, "reason": None
    }
    assert _capability(first, "PUSH")["reason"] == "PUSH_ENDPOINT_MISSING"
    assert _capability(first, "PUSH")["available"] is False
    assert _capability(first, "EMAIL") == {
        "channel": "EMAIL", "available": False, "reason": "EMAIL_DELIVERY_NOT_IMPLEMENTED"
    }

    push.register_endpoint(
        session, account_id=account.id, provider_key="unconfigured", endpoint_value="opaque-token"
    )
    later = client.get(BASE, headers=auth(token)).json()
    assert _capability(later, "PUSH")["reason"] == "PUSH_TRANSPORT_NOT_READY"
    assert _capability(later, "PUSH")["available"] is False
