"""Opening a tapped operator notice resolves its ServerAdmin page (#2314 part 2b)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.core import clock
from eimir.engagement.models import Notification
from eimir.identity.models import AccountEmail
from eimir.monitoring import operator_push
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)
ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def allow_list(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    current = {"emails": [ADMIN_EMAIL]}

    def settings():  # type: ignore[no-untyped-def]
        return get_settings().model_copy(update={"server_admin_emails": current["emails"]})

    monkeypatch.setattr("eimir.authorization.server_admin.get_settings", settings)
    return current


@pytest.fixture
def admin(session: Session, allow_list):  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=NOW)
    )
    space = make_space(session, account)
    session.flush()
    return account, space


def _notice(session: Session, account_id, topic: str = "failed_jobs") -> Notification:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic=topic, at=clock.now(), recipients=[account_id])
    return session.scalars(
        select(Notification).where(Notification.recipient_account_id == account_id)
    ).one()


def _open(client, space_id, notice_id, token):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/spaces/{space_id}/notifications/{notice_id}/open", headers=auth(token)
    )


def test_admin_opens_own_notice_through_their_space_and_gets_the_route(
    client, session: Session, admin
) -> None:  # type: ignore[no-untyped-def]
    account, space = admin
    notice = _notice(session, account.id, "support_reports")

    opened = _open(client, space.id, notice.id, sign_in(session, account))

    assert opened.status_code == 200
    body = opened.json()
    assert body["kind"] == "OPERATOR_ALERT"
    assert body["operatorRoute"] == "/server-admin?section=reports&state=NEW"
    assert body["readAt"] is not None
    assert body["targetType"] is None and body["actor"] is None


def test_couple_notices_have_no_operator_route(client, session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    account, space = admin
    token = sign_in(session, account)
    listed = client.get(f"/api/v1/spaces/{space.id}/notifications", headers=auth(token))
    assert listed.status_code == 200
    assert all(item.get("operatorRoute") is None for item in listed.json()["items"])


def test_another_account_cannot_open_the_notice(client, session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    account, _ = admin
    notice = _notice(session, account.id)
    other = make_account(session, "Someone")
    other_space = make_space(session, other)

    opened = _open(client, other_space.id, notice.id, sign_in(session, other))

    assert opened.status_code == 404
    assert session.get(Notification, notice.id).read_at is None


def test_an_admin_removed_from_the_allow_list_cannot_open_it(
    client, session: Session, admin, allow_list
) -> None:  # type: ignore[no-untyped-def]
    account, space = admin
    notice = _notice(session, account.id)
    allow_list["emails"] = []

    opened = _open(client, space.id, notice.id, sign_in(session, account))

    assert opened.status_code == 404


def test_operator_notices_never_reach_the_notification_center(
    client, session: Session, admin
) -> None:  # type: ignore[no-untyped-def]
    account, space = admin
    notice = _notice(session, account.id)
    token = sign_in(session, account)

    listed = client.get(f"/api/v1/spaces/{space.id}/notifications", headers=auth(token))
    unread = client.get(
        f"/api/v1/spaces/{space.id}/notifications/unread-count", headers=auth(token)
    )
    read = client.post(
        f"/api/v1/spaces/{space.id}/notifications/{notice.id}/read", headers=auth(token)
    )
    read_all = client.post(f"/api/v1/spaces/{space.id}/notifications/read-all", headers=auth(token))

    assert str(notice.id) not in {item["id"] for item in listed.json()["items"]}
    assert unread.json()["unreadCount"] == 0
    assert read.status_code == 404
    assert read_all.json()["updated"] == 0
    session.expire_all()
    assert session.get(Notification, notice.id).read_at is None
